import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initScoringRules, newScoringRuleId } from "./scoringRules.js";
import { ensureMetaFields, bumpMetaFields, deepClone } from "./dataLayer.js";
import { appendChangeLog } from "./conflictDetection.js";
import { emitChange, CHANGE_TYPES } from "./syncEvents.js";
import { inferLifecycleState, lifecycleToStatus } from "./lifecycle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, "data", "ink-stick-testing.json");

const seed = {
  "batches": [
    {
      "id": "BAT-20260611-01",
      "code": "B001",
      "smokeSource": "黄山松烟",
      "receiveDate": "2026-06-01",
      "note": "春季入料，干燥度良好"
    },
    {
      "id": "BAT-20260611-02",
      "code": "B002",
      "smokeSource": "桐油烟",
      "receiveDate": "2026-06-10",
      "note": "新批次试样"
    }
  ],
  "importBatches": [],
  "items": [
    {
      "id": "IS-001",
      "code": "IS-001",
      "batchId": "BAT-20260611-01",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 8,
      "storage": "恒湿柜B",
      "status": "已试磨",
      "lifecycleState": "已试磨",
      "lifecycleHistory": [{"from":"建档","to":"入库","action":"store","label":"入库","at":"2026-06-01"},{"from":"入库","to":"已试磨","action":"test","label":"试磨","at":"2026-06-11"}],
      "logs": [
        {
          "at": "2026-06-11",
          "step": "试磨",
          "note": "宣纸20滴水，出墨快，评分86",
          "score": 86
        }
      ]
    },
    {
      "id": "IS-002",
      "code": "IS-002",
      "batchId": "BAT-20260611-02",
      "smokeSource": "桐油烟",
      "glueRatio": "8%",
      "ageYears": 3,
      "storage": "试样盒C",
      "status": "重点观察",
      "lifecycleState": "重点观察",
      "lifecycleHistory": [{"from":"建档","to":"入库","action":"store","label":"入库","at":"2026-06-10"},{"from":"入库","to":"已试磨","action":"test","label":"试磨","at":"2026-06-21T03:50:28.907Z"},{"from":"已试磨","to":"重点观察","action":"markWatching","label":"标记重点观察","at":"2026-06-21T03:50:28.907Z"}],
      "logs": [
        {
          "at": "2026-06-21T03:50:28.907Z",
          "step": "试磨",
          "note": "棉连纸，评分79",
          "score": 79
        }
      ],
      "tests": [
        {
          "at": "2026-06-21T03:50:28.907Z",
          "paper": "棉连纸",
          "water": "18滴",
          "speed": "中",
          "colorLayer": "偏暖",
          "sediment": "少",
          "score": 79
        }
      ]
    }
  ],
  "templates": [
    {
      "id": "TPL-001",
      "name": "标准松烟墨方案",
      "paper": "净皮宣纸",
      "water": "20滴",
      "grindingTime": "10分钟",
      "observationPoints": "墨色层次、沉淀情况、出墨速度",
      "speed": "中",
      "isDefault": true
    },
    {
      "id": "TPL-002",
      "name": "油烟墨精磨方案",
      "paper": "棉连纸",
      "water": "15滴",
      "grindingTime": "15分钟",
      "observationPoints": "墨色浓淡、光泽度、颗粒细腻度",
      "speed": "慢",
      "isDefault": false
    }
  ],
  "scoringRules": [
    {
      "id": "SCR-DEFAULT-HIGH",
      "name": "优秀（已试磨）",
      "minScore": 85,
      "maxScore": 100,
      "resultStatus": "已试磨",
      "hintText": "试磨评分优秀，可正式使用",
      "order": 1,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": "SCR-DEFAULT-MID",
      "name": "合格（重点观察）",
      "minScore": 70,
      "maxScore": 84,
      "resultStatus": "重点观察",
      "hintText": "试磨评分合格，需继续观察使用效果",
      "order": 2,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": "SCR-DEFAULT-LOW",
      "name": "待改进（建议复测）",
      "minScore": 0,
      "maxScore": 69,
      "resultStatus": "建议复测",
      "hintText": "试磨评分偏低，建议调整参数后复测",
      "order": 3,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "views": [
    {
      "id": "VIEW-DEFAULT-ALL",
      "name": "全部墨锭",
      "filters": { "status": "", "batchId": "", "keyword": "" },
      "order": 0,
      "isSystem": true
    },
    {
      "id": "VIEW-DEFAULT-PENDING",
      "name": "待试磨清单",
      "filters": { "status": "待试磨", "batchId": "", "keyword": "" },
      "order": 1,
      "isSystem": true
    },
    {
      "id": "VIEW-DEFAULT-WATCHING",
      "name": "重点观察",
      "filters": { "status": "重点观察", "batchId": "", "keyword": "" },
      "order": 2,
      "isSystem": true
    }
  ]
};

const stages = ["待试磨", "已试磨", "重点观察"];
const statLabels = ["待试磨", "已试磨", "重点观察"];
const fields = [["code", "墨锭编号", "text"], ["smokeSource", "烟料来源", "text"], ["glueRatio", "胶料比例", "text"], ["ageYears", "存放年限", "number"], ["storage", "存放位置", "text"]];
const extraFields = [["paper", "试磨纸张"], ["water", "加水量"], ["speed", "出墨速度"], ["colorLayer", "墨色层次"], ["sediment", "沉淀情况"], ["score", "评分"]];
const batchFields = [["code", "批次编号", "text"], ["smokeSource", "烟料来源", "text"], ["receiveDate", "入库日期", "date"], ["note", "备注说明", "textarea"]];
const templateFields = [["name", "方案名称", "text"], ["paper", "试磨纸张", "text"], ["water", "加水量", "text"], ["grindingTime", "研磨时长", "text"], ["speed", "出墨速度", "text"], ["observationPoints", "观察重点", "textarea"]];
const taskStatuses = ["待办", "进行中", "已完成", "已取消"];
const taskFields = [["scheduledDate", "计划日期", "date"], ["assignee", "负责人", "text"], ["note", "任务备注", "textarea"]];
const importBatchFields = [["code", "导入批次号", "text"], ["importedAt", "导入时间", "date"], ["importedBy", "导入人", "text"], ["itemCount", "导入数量", "number"], ["note", "备注说明", "textarea"]];

export const config = { stages, statLabels, fields, extraFields, batchFields, templateFields, taskStatuses, taskFields, importBatchFields };

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  let changed = false;
  if (!db.batches) { db.batches = []; changed = true; }
  if (!db.importBatches) { db.importBatches = []; changed = true; }
  if (!db.items) { db.items = []; changed = true; }
  if (!db.templates) { db.templates = []; changed = true; }
  if (!db.tasks) { db.tasks = []; changed = true; }
  if (!db.views) { db.views = []; changed = true; }
  if (ensureDefaultViews(db)) { changed = true; }
  if (initScoringRules(db)) { changed = true; }
  for (const item of db.items) { if (!item.id) { item.id = item.code || ("IS-" + Date.now() + Math.random().toString(36).slice(2,5)); changed = true; } }
  for (const tpl of db.templates) { if (!tpl.id) { tpl.id = newTemplateId(); changed = true; } if (tpl.isDefault === undefined) { tpl.isDefault = false; changed = true; } }
  for (const task of db.tasks) {
    if (!task.id) { task.id = newTaskId(); changed = true; }
    if (!task.status) { task.status = "待办"; changed = true; }
  }
  for (const item of db.items) {
    if (!item.versions || !Array.isArray(item.versions) || item.versions.length === 0) {
      migrateItemToVersions(item);
      changed = true;
    }
    if (!item.currentVersion) {
      item.currentVersion = (item.versions && item.versions.length) ? item.versions.length : 1;
      changed = true;
    }
  }

  for (const item of db.items) {
    if (!item.lifecycleState) {
      item.lifecycleState = inferLifecycleState(item);
      changed = true;
    }
    if (!item.lifecycleHistory) {
      item.lifecycleHistory = buildMigratedLifecycleHistory(item);
      changed = true;
    }
  }

  for (const batch of db.batches) {
    if (ensureMetaFields(batch, { createdAt: batch.receiveDate })) changed = true;
  }
  for (const tpl of db.templates) {
    if (ensureMetaFields(tpl)) changed = true;
  }
  for (const task of db.tasks) {
    if (ensureMetaFields(task, { createdAt: task.createdAt })) changed = true;
  }
  for (const imp of db.importBatches) {
    if (ensureMetaFields(imp, { createdAt: imp.importedAt, createdBy: imp.importedBy })) changed = true;
  }
  for (const rule of db.scoringRules || []) {
    if (ensureMetaFields(rule, { createdAt: rule.createdAt, updatedAt: rule.updatedAt })) changed = true;
  }
  for (const view of db.views || []) {
    if (!view.id) { view.id = newViewId(); changed = true; }
    if (ensureMetaFields(view)) changed = true;
  }
  for (const item of db.items) {
    if (ensureMetaFields(item, { createdAt: (item.logs && item.logs[0]) ? item.logs[0].at : undefined })) changed = true;
  }

  if (changed) await saveDb(db);
  return db;
}

export function migrateItemToVersions(item) {
  const snapshot = buildItemSnapshot(item);
  const createdAt = (item.logs && item.logs.length > 0) ? item.logs[0].at : new Date().toISOString();
  item.versions = [{
    version: 1,
    createdAt,
    createdBy: "系统迁移",
    reason: "初始版本（历史数据迁移）",
    action: "create",
    parentVersion: null,
    snapshot,
    changes: null
  }];
  item.currentVersion = 1;
}

function buildMigratedLifecycleHistory(item) {
  const history = [];
  const logs = item.logs || [];
  const tests = item.tests || [];
  const currentState = inferLifecycleState(item);
  if (logs.length > 0 || item.storage || item._createdAt) {
    const createdTime = (logs.length > 0 && logs[0].at) || item._createdAt || new Date().toISOString();
    if (item.storage && item.storage.trim()) {
      history.push({
        from: "建档",
        to: "入库",
        action: "store",
        label: "入库",
        at: createdTime
      });
    }
  }
  if (tests.length > 0) {
    const firstTestTime = tests[0].at;
    const fromState = history.find(h => h.to === "入库") ? "入库" : "建档";
    const intermediateStates = [];
    if (currentState === "已试磨" || currentState === "重点观察" || currentState === "复测" || currentState === "归档") {
      intermediateStates.push({ from: fromState, to: "已试磨", action: "test", label: "试磨", at: firstTestTime });
    }
    if (currentState === "重点观察" || currentState === "复测") {
      const watchTime = tests.length > 1 ? tests[tests.length - 1].at : firstTestTime;
      if (currentState === "重点观察") {
        intermediateStates.push({ from: "已试磨", to: "重点观察", action: "markWatching", label: "标记重点观察", at: watchTime });
      } else {
        intermediateStates.push({ from: "已试磨", to: "重点观察", action: "markWatching", label: "标记重点观察", at: firstTestTime });
        intermediateStates.push({ from: "重点观察", to: "复测", action: "retest", label: "创建复测", at: watchTime });
      }
    }
    if (currentState === "归档") {
      const archiveTime = tests.length > 1 ? tests[tests.length - 1].at : firstTestTime;
      intermediateStates.push({ from: "已试磨", to: "归档", action: "archive", label: "归档", at: archiveTime });
    }
    for (const s of intermediateStates) history.push(s);
  }
  return history;
}

export function buildItemSnapshot(item) {
  return {
    status: item.status || "待试磨",
    lifecycleState: item.lifecycleState || "建档",
    storage: item.storage || "",
    smokeSource: item.smokeSource || "",
    glueRatio: item.glueRatio || "",
    ageYears: item.ageYears ?? null,
    batchId: item.batchId || "",
    logs: JSON.parse(JSON.stringify(item.logs || [])),
    tests: JSON.parse(JSON.stringify(item.tests || []))
  };
}

export function computeChanges(oldSnapshot, newSnapshot) {
  const changes = {};
  const fields = ["status", "lifecycleState", "storage", "smokeSource", "glueRatio", "ageYears", "batchId"];
  for (const field of fields) {
    const oldVal = oldSnapshot[field];
    const newVal = newSnapshot[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { before: oldVal, after: newVal };
    }
  }
  const oldTests = oldSnapshot.tests || [];
  const newTests = newSnapshot.tests || [];
  if (newTests.length > oldTests.length) {
    changes.testsAdded = newTests.slice(oldTests.length);
  }
  const oldLogs = oldSnapshot.logs || [];
  const newLogs = newSnapshot.logs || [];
  if (newLogs.length > oldLogs.length) {
    changes.logsAdded = newLogs.slice(oldLogs.length);
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function createVersion(item, options) {
  const { createdBy, reason, action = "revise", parentVersion = null, force = false } = options || {};
  if (!item.versions) {
    migrateItemToVersions(item);
  }
  const lastVersion = item.versions[item.versions.length - 1];
  const oldSnapshot = lastVersion ? lastVersion.snapshot : buildItemSnapshot(item);
  const newSnapshot = buildItemSnapshot(item);
  const changes = action === "restore" ? null : computeChanges(oldSnapshot, newSnapshot);
  if (!force && action !== "restore" && !changes) {
    return null;
  }
  const newVersionNum = (lastVersion ? lastVersion.version : 0) + 1;
  const version = {
    version: newVersionNum,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "未指定用户",
    reason: reason || "修订",
    action,
    parentVersion: parentVersion || (lastVersion ? lastVersion.version : null),
    snapshot: newSnapshot,
    changes
  };
  item.versions.push(version);
  item.currentVersion = newVersionNum;
  return version;
}

export function restoreToVersion(item, versionNum, options) {
  const { createdBy, reason } = options || {};
  const targetVersion = item.versions.find(v => v.version === versionNum);
  if (!targetVersion) return null;
  const snap = targetVersion.snapshot;
  item.status = snap.status;
  item.lifecycleState = snap.lifecycleState || inferLifecycleState(item);
  item.storage = snap.storage;
  item.smokeSource = snap.smokeSource;
  item.glueRatio = snap.glueRatio;
  item.ageYears = snap.ageYears;
  item.batchId = snap.batchId;
  item.logs = JSON.parse(JSON.stringify(snap.logs || []));
  item.tests = JSON.parse(JSON.stringify(snap.tests || []));
  const lastVersion = item.versions[item.versions.length - 1];
  const newVersionNum = (lastVersion ? lastVersion.version : 0) + 1;
  const newSnapshot = buildItemSnapshot(item);
  const restoredVersion = {
    version: newVersionNum,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "未指定用户",
    reason: reason || `恢复至版本 v${versionNum}`,
    action: "restore",
    parentVersion: versionNum,
    snapshot: newSnapshot,
    changes: { restoredFrom: versionNum }
  };
  item.versions.push(restoredVersion);
  item.currentVersion = newVersionNum;
  return restoredVersion;
}

export function newVersionId() {
  return "VER-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function newBatchId() {
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return "BAT-" + ymd + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function newItemId() {
  return "IS-" + Date.now();
}

export function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}

export function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}

export function computeBatchProgress(batch, items) {
  const batchItems = items.filter(i => i.batchId === batch.id);
  const total = batchItems.length;
  const tested = batchItems.filter(i => i.status !== "待试磨").length;
  return { total, tested, percent: total ? Math.round((tested / total) * 100) : 0 };
}

export function computeBatchDetail(batch, items, tasks = [], scoringRules = null) {
  const batchItems = items.filter(i => i.batchId === batch.id);
  const total = batchItems.length;

  const statusCounts = {};
  for (const item of batchItems) {
    const s = item.status || "待试磨";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  const untestedCount = batchItems.filter(i => i.status === "待试磨").length;
  const testedItems = batchItems.filter(i => i.status !== "待试磨");

  const getItemLatestScore = (item) => {
    const allTests = item.tests || [];
    const logTests = (item.logs || [])
      .filter(l => l.step === "试磨" && typeof l.score === "number")
      .map(l => ({ at: l.at, score: l.score }));
    const combined = [...allTests, ...logTests]
      .filter(t => t.at && typeof t.score === "number")
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    return combined[0] || null;
  };

  const isSuggestRetest = (item, latestScore) => {
    if (item.status === "建议复测") return true;
    if (latestScore === null) return false;
    if (scoringRules && scoringRules.length) {
      const sorted = [...scoringRules].sort((a, b) => {
        const o = (a.order || 0) - (b.order || 0);
        return o !== 0 ? o : (b.maxScore || 0) - (a.maxScore || 0);
      });
      for (const rule of sorted) {
        const min = Number(rule.minScore);
        const max = Number(rule.maxScore);
        if (latestScore >= min && latestScore <= max) {
          return rule.resultStatus === "建议复测";
        }
      }
    }
    return latestScore < 70;
  };

  const itemsWithDetail = batchItems.map(item => {
    const latestTest = getItemLatestScore(item);
    const latestScore = latestTest ? latestTest.score : null;
    const activeTask = tasks.find(t =>
      t.itemId === item.id && t.status !== "已完成" && t.status !== "已取消"
    );
    const suggestRetest = isSuggestRetest(item, latestScore);
    return {
      ...summarize(item),
      latestScore,
      latestTestAt: latestTest ? latestTest.at : null,
      hasActiveTask: !!activeTask,
      activeTaskId: activeTask ? activeTask.id : null,
      suggestRetest
    };
  });

  const testedScores = itemsWithDetail
    .filter(i => i.latestScore !== null)
    .map(i => i.latestScore);
  const avgScore = testedScores.length
    ? Math.round(testedScores.reduce((a, b) => a + b, 0) / testedScores.length)
    : null;
  const latestScore = testedScores.length ? Math.max(...testedScores) : null;
  const suggestRetestCount = itemsWithDetail.filter(i => i.suggestRetest).length;

  const itemsByStatus = {};
  for (const item of itemsWithDetail) {
    const s = item.status || "待试磨";
    if (!itemsByStatus[s]) itemsByStatus[s] = [];
    itemsByStatus[s].push(item);
  }

  return {
    total,
    untestedCount,
    testedCount: testedItems.length,
    avgScore,
    latestScore,
    suggestRetestCount,
    statusCounts,
    items: itemsWithDetail,
    itemsByStatus,
    progress: computeBatchProgress(batch, items)
  };
}

export function newTemplateId() {
  return "TPL-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function newTaskId() {
  return "TSK-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function newImportBatchId() {
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return "IMP-" + ymd + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function newViewId() {
  return "VIEW-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function ensureDefaultViews(db) {
  let changed = false;
  const defaultViews = [
    { id: "VIEW-DEFAULT-ALL", name: "全部墨锭", filters: { status: "", batchId: "", keyword: "" }, order: 0, isSystem: true },
    { id: "VIEW-DEFAULT-PENDING", name: "待试磨清单", filters: { status: "待试磨", batchId: "", keyword: "" }, order: 1, isSystem: true },
    { id: "VIEW-DEFAULT-WATCHING", name: "重点观察", filters: { status: "重点观察", batchId: "", keyword: "" }, order: 2, isSystem: true }
  ];
  if (!db.views || !Array.isArray(db.views)) {
    db.views = defaultViews;
    return true;
  }
  for (const dv of defaultViews) {
    if (!db.views.find(v => v.id === dv.id)) {
      db.views.push(dv);
      changed = true;
    }
  }
  for (const view of db.views) {
    if (!view.filters) { view.filters = { status: "", batchId: "", keyword: "" }; changed = true; }
    if (view.order === undefined) { view.order = db.views.indexOf(view); changed = true; }
    if (view.isSystem === undefined) { view.isSystem = false; changed = true; }
  }
  return changed;
}

export function getDefaultTemplate(templates) {
  return templates.find(t => t.isDefault) || templates[0] || null;
}

export function computeStorageKanban(items) {
  const groups = {};
  for (const item of items) {
    const storage = item.storage || "未指定位置";
    if (!groups[storage]) {
      groups[storage] = {
        storage,
        total: 0,
        counts: Object.fromEntries(statLabels.map(l => [l, 0])),
        items: []
      };
    }
    groups[storage].total += 1;
    if (groups[storage].counts[item.status] !== undefined) {
      groups[storage].counts[item.status] += 1;
    }
    groups[storage].items.push(summarize(item));
  }
  return Object.values(groups).sort((a, b) => {
    if (a.storage === "未指定位置") return 1;
    if (b.storage === "未指定位置") return -1;
    return a.storage.localeCompare(b.storage, "zh-CN");
  });
}

export function buildComparisonReport(items, ids) {
  const selected = ids
    .map(id => items.find(x => x.id === id || x.code === id))
    .filter(Boolean);

  const reportItems = selected.map(item => {
    const structuredTests = (item.tests || []).map(t => ({
      source: "tests",
      at: t.at,
      score: typeof t.score === "number" ? t.score : null,
      speed: t.speed || "",
      colorLayer: t.colorLayer || "",
      sediment: t.sediment || "",
      paper: t.paper || "",
      water: t.water || ""
    }));

    const logTests = (item.logs || [])
      .filter(l => l.step === "试磨" && typeof l.score === "number")
      .map(l => ({
        source: "logs",
        at: l.at,
        score: l.score,
        speed: "",
        colorLayer: "",
        sediment: "",
        paper: "",
        water: "",
        note: l.note || ""
      }));

    const seen = new Map();
    for (const t of structuredTests) {
      if (t.at) seen.set(t.at, t);
    }
    for (const l of logTests) {
      if (l.at && !seen.has(l.at)) {
        seen.set(l.at, l);
      }
    }
    const allTests = Array.from(seen.values())
      .sort((a, b) => (a.at || "").localeCompare(b.at || ""));

    const hasTests = allTests.length > 0;
    const scores = allTests.map(t => t.score).filter(s => typeof s === "number");
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const latestTest = allTests.length ? allTests[allTests.length - 1] : null;
    const speeds = allTests.map(t => t.speed).filter(Boolean);
    const colorLayers = allTests.map(t => t.colorLayer).filter(Boolean);
    const sediments = allTests.map(t => t.sediment).filter(Boolean);

    return {
      id: item.id,
      code: item.code || item.id,
      smokeSource: item.smokeSource || "",
      glueRatio: item.glueRatio || "",
      ageYears: item.ageYears ?? null,
      status: item.status || "",
      hasTests,
      testCount: allTests.length,
      allScores: scores,
      avgScore,
      latestScore: latestTest ? latestTest.score : null,
      latestSpeed: latestTest ? latestTest.speed : null,
      latestColorLayer: latestTest ? latestTest.colorLayer : null,
      latestSediment: latestTest ? latestTest.sediment : null,
      allSpeeds: [...new Set(speeds)],
      allColorLayers: [...new Set(colorLayers)],
      allSediments: [...new Set(sediments)],
      testHistory: allTests.slice().sort((a, b) => (b.at || "").localeCompare(a.at || "")).map(t => ({
        at: t.at,
        score: t.score,
        speed: t.speed || "",
        colorLayer: t.colorLayer || "",
        sediment: t.sediment || "",
        paper: t.paper || "",
        water: t.water || "",
        note: t.note || ""
      }))
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    itemCount: reportItems.length,
    items: reportItems
  };
}

export function prepareNewRecord(record, options = {}) {
  ensureMetaFields(record, options);
  return record;
}

export function updateRecordWithVersion(record, updates, options = {}) {
  const oldSnapshot = deepClone(record);
  Object.assign(record, updates);
  bumpMetaFields(record, options);
  appendChangeLog(record, oldSnapshot);
  return record;
}

export function findInCollection(db, collection, id) {
  const list = db[collection] || [];
  if (collection === "items") {
    return list.find(x => x.id === id || x.code === id);
  }
  if (collection === "batches") {
    return list.find(x => x.id === id || x.code === id);
  }
  if (collection === "importBatches") {
    return list.find(x => x.id === id || x.code === id);
  }
  return list.find(x => x.id === id);
}

export function saveAndNotify(db, collection, changeType, record, extra = {}) {
  return saveDb(db).then(() => {
    emitChange(collection, changeType, record, extra);
  });
}

export { CHANGE_TYPES };
