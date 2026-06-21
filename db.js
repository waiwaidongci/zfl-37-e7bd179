import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "ink-stick-testing.json");

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
  ]
};

const stages = ["待试磨", "已试磨", "重点观察"];
const statLabels = ["待试磨", "已试磨", "重点观察"];
const fields = [["code", "墨锭编号", "text"], ["smokeSource", "烟料来源", "text"], ["glueRatio", "胶料比例", "text"], ["ageYears", "存放年限", "number"], ["storage", "存放位置", "text"]];
const extraFields = [["paper", "试磨纸张"], ["water", "加水量"], ["speed", "出墨速度"], ["colorLayer", "墨色层次"], ["sediment", "沉淀情况"], ["score", "评分"]];
const batchFields = [["code", "批次编号", "text"], ["smokeSource", "烟料来源", "text"], ["receiveDate", "入库日期", "date"], ["note", "备注说明", "textarea"]];
const templateFields = [["name", "方案名称", "text"], ["paper", "试磨纸张", "text"], ["water", "加水量", "text"], ["grindingTime", "研磨时长", "text"], ["speed", "出墨速度", "text"], ["observationPoints", "观察重点", "textarea"]];

export const config = { stages, statLabels, fields, extraFields, batchFields, templateFields };

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  let changed = false;
  if (!db.batches) { db.batches = []; changed = true; }
  if (!db.items) { db.items = []; changed = true; }
  if (!db.templates) { db.templates = []; changed = true; }
  for (const item of db.items) { if (!item.id) { item.id = item.code || ("IS-" + Date.now() + Math.random().toString(36).slice(2,5)); changed = true; } }
  for (const tpl of db.templates) { if (!tpl.id) { tpl.id = newTemplateId(); changed = true; } if (tpl.isDefault === undefined) { tpl.isDefault = false; changed = true; } }
  if (changed) await saveDb(db);
  return db;
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
  const tested = batchItems.filter(i => i.status === "已试磨").length;
  return { total, tested, percent: total ? Math.round((tested / total) * 100) : 0 };
}

export function newTemplateId() {
  return "TPL-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
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
