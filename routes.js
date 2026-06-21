import { loadDb, saveDb, newBatchId, newItemId, newTemplateId, newTaskId, newImportBatchId, summarize, computeBatchProgress, getDefaultTemplate, computeStorageKanban, buildComparisonReport, createVersion, restoreToVersion, buildItemSnapshot, migrateItemToVersions, prepareNewRecord, updateRecordWithVersion, findInCollection, saveAndNotify, CHANGE_TYPES } from "./db.js";
import { analyzeCSV, buildImportItems } from "./csvImporter.js";
import { matchRule, validateRule, getSortedRules, getCoverageSummary, newScoringRuleId, collectStatuses } from "./scoringRules.js";
import { detectConflict, resolveConflict } from "./conflictDetection.js";
import { onDataChange } from "./syncEvents.js";
import { COLLLECTIONS } from "./dataLayer.js";

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

export function sendOk(res, data, meta = {}) {
  return send(res, 200, { ok: true, data, ...meta });
}

export function sendCreated(res, data, meta = {}) {
  return send(res, 201, { ok: true, data, ...meta });
}

export function sendError(res, status, error, message, details = {}) {
  return send(res, status, { ok: false, error, message, ...details });
}

export function sendConflict(res, conflict) {
  return send(res, 409, {
    ok: false,
    error: "version_conflict",
    message: "数据已被其他用户修改，请确认如何处理冲突",
    conflict
  });
}

export function handleUpdatesWithConflict(collection, currentRecord, input, applyFn) {
  const baseVersion = Number(input._baseVersion) || 0;
  const updates = { ...input };
  delete updates._baseVersion;
  delete updates._conflictResolution;

  const conflict = detectConflict(collection, currentRecord, baseVersion, updates);
  if (conflict) {
    if (input._conflictResolution) {
      const resolved = resolveConflict(conflict, input._conflictResolution);
      applyFn(resolved);
      return { resolved: true, conflict: null, record: currentRecord };
    }
    return { resolved: false, conflict, record: currentRecord };
  }

  applyFn(updates);
  return { resolved: true, conflict: null, record: currentRecord };
}

const sseClients = new Set();

export function streamEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.write(`: connected ${new Date().toISOString()}\n\n`);
  const heartbeat = setInterval(() => {
    res.write(`: ping ${new Date().toISOString()}\n\n`);
  }, 15000);

  const off = onDataChange((event) => {
    try {
      res.write(`event: change\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (e) {
      cleanup();
    }
  });

  function cleanup() {
    clearInterval(heartbeat);
    off();
    sseClients.delete(res);
    try { res.end(); } catch (e) {}
  }

  sseClients.add(res);
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  req.on("error", cleanup);
}

export async function getItems(req, res) {
  const db = await loadDb();
  return send(res, 200, db.items.map(summarize));
}

export async function createItem(req, res) {
  const db = await loadDb();
  const input = await body(req);
  const item = {
    id: newItemId(),
    status: input.status || "待试磨",
    ...input,
    logs: [{ at: new Date().toISOString(), step: "建档", note: "创建墨锭" + (input.batchId ? "，归入批次" : "") }]
  };
  migrateItemToVersions(item);
  const initialVersion = item.versions[0];
  initialVersion.createdBy = input.createdBy || "未指定用户";
  initialVersion.reason = "墨锭建档";
  initialVersion.createdAt = item.logs[0].at;
  initialVersion.snapshot = buildItemSnapshot(item);
  prepareNewRecord(item, {
    createdAt: item.logs[0].at,
    createdBy: input.createdBy || "未指定用户"
  });
  db.items.unshift(item);
  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.CREATED, item);
  return sendCreated(res, item);
}

export async function patchItem(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");
  const input = await body(req);

  const result = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    const oldStatus = item.status;
    const oldStorage = item.storage;
    Object.assign(item, updates);
    item.logs ||= [];
    if (updates.status !== undefined && updates.status !== oldStatus) {
      item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
    }
    if (updates.storage !== undefined && updates.storage !== oldStorage) {
      item.logs.push({ at: new Date().toISOString(), step: "存放位置", note: "从 " + (oldStorage || "未指定") + " 移至 " + (item.storage || "未指定") });
    }
    createVersion(item, {
      createdBy: updates.createdBy || "未指定用户",
      reason: updates.reason || "更新墨锭信息",
      action: "revise"
    });
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendOk(res, item);
}

export async function getStorageKanban(req, res) {
  const db = await loadDb();
  const kanban = computeStorageKanban(db.items);
  return send(res, 200, kanban);
}

export async function getItemsByStorage(req, res, storage) {
  const db = await loadDb();
  const decoded = decodeURIComponent(storage);
  const filtered = db.items.filter(item => (item.storage || "未指定位置") === decoded).map(summarize);
  return send(res, 200, { storage: decoded, items: filtered });
}

export async function addLog(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");
  const input = await body(req);

  const result = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    item.logs ||= [];
    const newLog = { at: new Date().toISOString(), step: updates.step || "记录", note: updates.note || "" };
    item.logs.push(newLog);
    createVersion(item, {
      createdBy: updates.createdBy || "未指定用户",
      reason: updates.reason || ("追加备注：" + (updates.step || "记录")),
      action: "revise"
    });
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendCreated(res, item);
}

export async function addAction(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");
  const input = await body(req);

  const result = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    item.logs ||= [];
    const score = Number(updates.score || 0);
    item.tests ||= [];
    const testRecord = { at: new Date().toISOString(), ...updates, score };
    const ruleMatch = matchRule(score, db.scoringRules || []);
    if (ruleMatch) {
      testRecord.ruleId = ruleMatch.ruleId;
      testRecord.ruleName = ruleMatch.ruleName;
      testRecord.ruleHint = ruleMatch.hintText;
    }
    item.tests.push(testRecord);
    if (ruleMatch) {
      item.status = ruleMatch.resultStatus;
    } else {
      if (!item.status) item.status = "待试磨";
      const warnNote = "评分" + score + "未匹配规则，状态保持" + item.status;
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: "规则", note: warnNote, score });
    }
    const noteParts = [];
    if (updates.paper) noteParts.push(updates.paper);
    if (updates.water) noteParts.push(updates.water);
    if (updates.grindingTime) noteParts.push("研磨" + updates.grindingTime);
    noteParts.push("评分" + score);
    if (ruleMatch) {
      noteParts.push("命中规则：" + ruleMatch.ruleName);
    }
    const logEntry = { at: new Date().toISOString(), step: "试磨", note: noteParts.join("，"), score };
    if (ruleMatch) {
      logEntry.ruleId = ruleMatch.ruleId;
      logEntry.ruleName = ruleMatch.ruleName;
    }
    item.logs.push(logEntry);

    db.tasks ||= [];
    const pendingTask = db.tasks
      .filter(t => t.itemId === item.id && t.status === "已完成" && !t.testRecordId)
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
    if (pendingTask) {
      pendingTask.testRecordId = testRecord.at;
    }

    createVersion(item, {
      createdBy: updates.createdBy || "未指定用户",
      reason: updates.reason || ("创建试磨记录，评分" + score),
      action: "revise"
    });
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendCreated(res, item);
}

export async function getBatches(req, res) {
  const db = await loadDb();
  const batches = (db.batches || []).map(b => ({
    ...b,
    progress: computeBatchProgress(b, db.items)
  }));
  return send(res, 200, batches);
}

export async function createBatch(req, res) {
  const db = await loadDb();
  const input = await body(req);
  const batch = {
    id: newBatchId(),
    code: input.code || ("B" + String((db.batches || []).length + 1).padStart(3, "0")),
    smokeSource: input.smokeSource || "",
    receiveDate: input.receiveDate || new Date().toISOString().slice(0, 10),
    note: input.note || ""
  };
  prepareNewRecord(batch, {
    createdAt: batch.receiveDate,
    createdBy: input.createdBy || "未指定用户"
  });
  db.batches ||= [];
  db.batches.unshift(batch);
  await saveAndNotify(db, COLLLECTIONS.BATCHES, CHANGE_TYPES.CREATED, batch);
  return sendCreated(res, batch);
}

export async function getBatch(req, res, id) {
  const db = await loadDb();
  const batch = (db.batches || []).find(b => b.id === id || b.code === id);
  if (!batch) return send(res, 404, { error: "batch_not_found" });
  const batchItems = db.items.filter(i => i.batchId === batch.id);
  return send(res, 200, {
    ...batch,
    items: batchItems.map(summarize),
    progress: computeBatchProgress(batch, db.items)
  });
}

export async function getStats(req, res) {
  const db = await loadDb();
  const statuses = collectStatuses(db.scoringRules || [], db.items || []);
  const stats = Object.fromEntries(statuses.map(label => [label, 0]));
  for (const item of db.items) {
    if (stats[item.status] === undefined) stats[item.status] = 0;
    stats[item.status] += 1;
  }
  return send(res, 200, stats);
}

export async function getTemplates(req, res) {
  const db = await loadDb();
  return send(res, 200, db.templates || []);
}

export async function createTemplate(req, res) {
  const db = await loadDb();
  const input = await body(req);
  db.templates ||= [];
  if (input.isDefault) {
    db.templates.forEach(t => { t.isDefault = false; });
  } else if (db.templates.length === 0) {
    input.isDefault = true;
  }
  const template = {
    id: newTemplateId(),
    name: input.name || "",
    paper: input.paper || "",
    water: input.water || "",
    grindingTime: input.grindingTime || "",
    speed: input.speed || "",
    observationPoints: input.observationPoints || "",
    isDefault: input.isDefault ? true : false
  };
  prepareNewRecord(template, {
    createdBy: input.createdBy || "未指定用户"
  });
  db.templates.unshift(template);
  await saveAndNotify(db, COLLLECTIONS.TEMPLATES, CHANGE_TYPES.CREATED, template);
  return sendCreated(res, template);
}

export async function updateTemplate(req, res, id) {
  const db = await loadDb();
  const template = (db.templates || []).find(t => t.id === id);
  if (!template) return sendError(res, 404, "template_not_found", "模板不存在");
  const input = await body(req);

  const result = handleUpdatesWithConflict(COLLLECTIONS.TEMPLATES, template, input, (updates) => {
    Object.assign(template, updates);
    updateRecordWithVersion(template, {}, { updatedBy: updates.createdBy || template._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.TEMPLATES, CHANGE_TYPES.UPDATED, template);
  return sendOk(res, template);
}

export async function deleteTemplate(req, res, id) {
  const db = await loadDb();
  db.templates ||= [];
  const idx = db.templates.findIndex(t => t.id === id);
  if (idx === -1) return sendError(res, 404, "template_not_found", "模板不存在");
  const deleted = db.templates.splice(idx, 1)[0];
  if (deleted.isDefault && db.templates.length > 0) {
    db.templates[0].isDefault = true;
  }
  await saveAndNotify(db, COLLLECTIONS.TEMPLATES, CHANGE_TYPES.DELETED, deleted);
  return sendOk(res, { success: true });
}

export async function setDefaultTemplate(req, res, id) {
  const db = await loadDb();
  db.templates ||= [];
  const template = db.templates.find(t => t.id === id);
  if (!template) return sendError(res, 404, "template_not_found", "模板不存在");
  const input = await body(req);
  db.templates.forEach(t => {
    if (t.id === id) {
      updateRecordWithVersion(t, { isDefault: true }, { updatedBy: input.createdBy || t._updatedBy });
    } else if (t.isDefault) {
      updateRecordWithVersion(t, { isDefault: false }, { updatedBy: input.createdBy || t._updatedBy });
    }
  });
  for (const t of db.templates) {
    await saveAndNotify(db, COLLLECTIONS.TEMPLATES, CHANGE_TYPES.UPDATED, t);
  }
  return sendOk(res, db.templates);
}

function enrichTask(task, items) {
  const item = items.find(i => i.id === task.itemId || i.code === task.itemId);
  return {
    ...task,
    itemCode: item ? item.code : task.itemId,
    itemSmokeSource: item ? item.smokeSource : "",
    itemStatus: item ? item.status : ""
  };
}

function isOverdue(task) {
  if (task.status === "已完成" || task.status === "已取消") return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.scheduledDate < today;
}

export async function getTasks(req, res) {
  const db = await loadDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const status = url.searchParams.get("status");
  const assignee = url.searchParams.get("assignee");
  const itemId = url.searchParams.get("itemId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  let tasks = (db.tasks || []).map(t => enrichTask(t, db.items));

  if (status) tasks = tasks.filter(t => t.status === status);
  if (assignee) tasks = tasks.filter(t => t.assignee === assignee);
  if (itemId) tasks = tasks.filter(t => t.itemId === itemId);
  if (dateFrom) tasks = tasks.filter(t => t.scheduledDate >= dateFrom);
  if (dateTo) tasks = tasks.filter(t => t.scheduledDate <= dateTo);

  tasks.sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  return send(res, 200, tasks);
}

export async function createTask(req, res) {
  const db = await loadDb();
  const input = await body(req);

  if (!input.itemId) return sendError(res, 400, "item_id_required", "需要指定墨锭ID");

  const item = db.items.find(x => x.id === input.itemId || x.code === input.itemId);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");

  const hasUnfinished = (db.tasks || []).some(t =>
    t.itemId === item.id && t.status !== "已完成" && t.status !== "已取消"
  );
  if (hasUnfinished) return sendError(res, 409, "task_already_exists", "该墨锭已有未完成的试磨任务");

  const task = {
    id: newTaskId(),
    itemId: item.id,
    scheduledDate: input.scheduledDate || new Date().toISOString().slice(0, 10),
    assignee: input.assignee || "",
    status: "待办",
    note: input.note || "",
    createdAt: new Date().toISOString(),
    completedAt: null,
    testRecordId: null
  };
  prepareNewRecord(task, {
    createdAt: task.createdAt,
    createdBy: input.createdBy || "未指定用户"
  });

  db.tasks ||= [];
  db.tasks.unshift(task);
  await saveAndNotify(db, COLLLECTIONS.TASKS, CHANGE_TYPES.CREATED, task);

  return sendCreated(res, enrichTask(task, db.items));
}

export async function updateTask(req, res, id) {
  const db = await loadDb();
  const task = (db.tasks || []).find(t => t.id === id);
  if (!task) return sendError(res, 404, "task_not_found", "任务不存在");

  const input = await body(req);

  const result = handleUpdatesWithConflict(COLLLECTIONS.TASKS, task, input, (updates) => {
    const oldStatus = task.status;

    if (updates.scheduledDate !== undefined) task.scheduledDate = updates.scheduledDate;
    if (updates.assignee !== undefined) task.assignee = updates.assignee;
    if (updates.note !== undefined) task.note = updates.note;
    if (updates.status !== undefined) {
      task.status = updates.status;
      if (updates.status === "已完成" && oldStatus !== "已完成") {
        task.completedAt = new Date().toISOString();
      } else if (updates.status !== "已完成") {
        task.completedAt = null;
      }
    }
    updateRecordWithVersion(task, {}, { updatedBy: updates.createdBy || task._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.TASKS, CHANGE_TYPES.UPDATED, task);
  return sendOk(res, enrichTask(task, db.items));
}

export async function completeTask(req, res, id) {
  const db = await loadDb();
  const task = (db.tasks || []).find(t => t.id === id);
  if (!task) return sendError(res, 404, "task_not_found", "任务不存在");
  if (task.status === "已完成") return sendError(res, 400, "task_already_completed", "任务已经完成");

  const item = db.items.find(x => x.id === task.itemId);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");

  const input = await body(req);

  const taskResult = handleUpdatesWithConflict(COLLLECTIONS.TASKS, task, input, (updates) => {
    task.status = "已完成";
    task.completedAt = new Date().toISOString();
    updateRecordWithVersion(task, {}, { updatedBy: updates.createdBy || task._updatedBy });
  });

  if (!taskResult.resolved && taskResult.conflict) {
    return sendConflict(res, taskResult.conflict);
  }

  const itemResult = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    if (updates.paper || updates.score !== undefined) {
      const score = Number(updates.score || 0);
      item.tests ||= [];
      const ruleMatch = matchRule(score, db.scoringRules || []);
      const testRecord = {
        at: new Date().toISOString(),
        paper: updates.paper || "",
        water: updates.water || "",
        speed: updates.speed || "",
        colorLayer: updates.colorLayer || "",
        sediment: updates.sediment || "",
        score
      };
      if (ruleMatch) {
        testRecord.ruleId = ruleMatch.ruleId;
        testRecord.ruleName = ruleMatch.ruleName;
        testRecord.ruleHint = ruleMatch.hintText;
      }
      item.tests.push(testRecord);
      task.testRecordId = testRecord.at;

      if (ruleMatch) {
        item.status = ruleMatch.resultStatus;
      } else {
        if (!item.status) item.status = "待试磨";
        const warnNote = "评分" + score + "未匹配规则，状态保持" + item.status;
        item.logs ||= [];
        item.logs.push({ at: new Date().toISOString(), step: "规则", note: warnNote, score });
      }
      item.logs ||= [];
      const noteParts = [];
      if (updates.paper) noteParts.push(updates.paper);
      if (updates.water) noteParts.push(updates.water);
      if (updates.grindingTime) noteParts.push("研磨" + updates.grindingTime);
      noteParts.push("评分" + score);
      if (ruleMatch) {
        noteParts.push("命中规则：" + ruleMatch.ruleName);
      }
      const logEntry = { at: new Date().toISOString(), step: "试磨", note: noteParts.join("，"), score };
      if (ruleMatch) {
        logEntry.ruleId = ruleMatch.ruleId;
        logEntry.ruleName = ruleMatch.ruleName;
      }
      item.logs.push(logEntry);
      createVersion(item, {
        createdBy: updates.createdBy || "未指定用户",
        reason: updates.reason || ("任务完成并录入试磨记录，评分" + score),
        action: "revise"
      });
    } else {
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: "任务完成", note: "试磨任务已完成，待录入试磨数据" });
      createVersion(item, {
        createdBy: updates.createdBy || "未指定用户",
        reason: updates.reason || "完成试磨任务，待录入试磨数据",
        action: "revise"
      });
    }
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
  });

  if (!itemResult.resolved && itemResult.conflict) {
    return sendConflict(res, itemResult.conflict);
  }

  await saveAndNotify(db, COLLLECTIONS.TASKS, CHANGE_TYPES.UPDATED, task);
  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendOk(res, enrichTask(task, db.items));
}

export async function deleteTask(req, res, id) {
  const db = await loadDb();
  db.tasks ||= [];
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx === -1) return sendError(res, 404, "task_not_found", "任务不存在");
  const deleted = db.tasks.splice(idx, 1)[0];
  await saveAndNotify(db, COLLLECTIONS.TASKS, CHANGE_TYPES.DELETED, deleted);
  return sendOk(res, { success: true });
}

export async function getTodayTasks(req, res) {
  const db = await loadDb();
  const today = new Date().toISOString().slice(0, 10);

  const allTasks = (db.tasks || []).map(t => enrichTask(t, db.items));

  const todayTasks = allTasks.filter(t => t.scheduledDate === today && t.status !== "已完成" && t.status !== "已取消");
  const overdueTasks = allTasks.filter(t => isOverdue(t));
  const completedToday = allTasks.filter(t => t.completedAt && t.completedAt.slice(0, 10) === today);

  return send(res, 200, {
    today,
    todayTasks,
    overdueTasks,
    completedToday,
    counts: {
      today: todayTasks.length,
      overdue: overdueTasks.length,
      completed: completedToday.length
    }
  });
}

export async function getItemTasks(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });

  const tasks = (db.tasks || [])
    .filter(t => t.itemId === item.id)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return send(res, 200, tasks);
}

export async function deleteItem(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");

  db.items = db.items.filter(x => x.id !== item.id);

  db.tasks ||= [];
  const deletedTasks = db.tasks.filter(t => t.itemId === item.id);
  db.tasks = db.tasks.filter(t => t.itemId !== item.id);

  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.DELETED, item);
  for (const task of deletedTasks) {
    await saveAndNotify(db, COLLLECTIONS.TASKS, CHANGE_TYPES.DELETED, task);
  }
  return sendOk(res, { success: true });
}

export async function getComparisonReport(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return send(res, 400, { error: "ids_required" });

  const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length < 2) return send(res, 400, { error: "min_two_items", message: "至少选择2块墨锭进行对比" });
  if (ids.length > 4) return send(res, 400, { error: "max_four_items", message: "最多选择4块墨锭进行对比" });

  const db = await loadDb();
  const report = buildComparisonReport(db.items, ids);
  return send(res, 200, report);
}

export async function getItemVersions(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });
  const versions = (item.versions || []).slice().reverse().map(v => ({
    version: v.version,
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    reason: v.reason,
    action: v.action,
    parentVersion: v.parentVersion,
    changes: v.changes,
    snapshotSummary: {
      status: v.snapshot.status,
      storage: v.snapshot.storage,
      testCount: (v.snapshot.tests || []).length,
      logCount: (v.snapshot.logs || []).length,
      latestScore: (v.snapshot.tests && v.snapshot.tests.length > 0)
        ? v.snapshot.tests[v.snapshot.tests.length - 1].score
        : null
    }
  }));
  return send(res, 200, {
    itemId: item.id,
    itemCode: item.code,
    currentVersion: item.currentVersion,
    versions
  });
}

export async function getVersionDetail(req, res, id, versionNum) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });
  const vNum = Number(versionNum);
  const version = (item.versions || []).find(v => v.version === vNum);
  if (!version) return send(res, 404, { error: "version_not_found" });
  const prevVersion = (item.versions || []).find(v => v.version === vNum - 1);
  return send(res, 200, {
    itemId: item.id,
    itemCode: item.code,
    version,
    previousSnapshot: prevVersion ? prevVersion.snapshot : null
  });
}

export async function createRevision(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");
  const input = await body(req);

  let validationError = null;
  let createdVersion = null;

  const result = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    const beforeSnap = buildItemSnapshot(item);
    const beforeLogLen = (item.logs || []).length;
    const beforeTestLen = (item.tests || []).length;
    let changed = false;
    if (updates.updates) {
      for (const [k, v] of Object.entries(updates.updates)) {
        if (JSON.stringify(item[k]) !== JSON.stringify(v)) {
          changed = true;
          break;
        }
      }
      if (!changed && Object.keys(updates.updates).length > 0) {
        for (const [k, v] of Object.entries(updates.updates)) {
          if (v !== undefined && v !== null && v !== "") {
            changed = true;
            break;
          }
        }
      }
      Object.assign(item, updates.updates);
    }
    if (updates.appendLog) {
      item.logs ||= [];
      item.logs.push({
        at: new Date().toISOString(),
        step: updates.appendLog.step || "修订",
        note: updates.appendLog.note || ""
      });
      changed = true;
    }
    if (updates.appendTest) {
      item.tests ||= [];
      const score = Number(updates.appendTest.score || 0);
      const ruleMatch = matchRule(score, db.scoringRules || []);
      const testRecord = {
        at: new Date().toISOString(),
        ...updates.appendTest,
        score
      };
      if (ruleMatch) {
        testRecord.ruleId = ruleMatch.ruleId;
        testRecord.ruleName = ruleMatch.ruleName;
        testRecord.ruleHint = ruleMatch.hintText;
      }
      item.tests.push(testRecord);
      if (score > 0) {
        if (ruleMatch) {
          item.status = ruleMatch.resultStatus;
          item.logs ||= [];
          if (updates.appendLog === undefined) {
            item.logs.push({
              at: new Date().toISOString(),
              step: "试磨",
              note: "评分" + score + "，命中规则：" + ruleMatch.ruleName,
              score,
              ruleId: ruleMatch.ruleId,
              ruleName: ruleMatch.ruleName
            });
          }
        } else {
          if (!item.status) item.status = "待试磨";
          item.logs ||= [];
          const warnNote = "评分" + score + "未匹配规则，状态保持" + item.status;
          item.logs.push({ at: new Date().toISOString(), step: "规则", note: warnNote, score });
        }
      }
      changed = true;
    }
    const version = createVersion(item, {
      createdBy: updates.createdBy || "未指定用户",
      reason: updates.reason || "修订记录",
      action: "revise"
    });
    if (!version && !changed) {
      validationError = { status: 400, error: "no_changes", message: "未检测到任何变更内容，未创建新版本" };
      return;
    }
    if (!version) {
      if (updates.appendLog) { item.logs = item.logs.slice(0, beforeLogLen); }
      if (updates.appendTest) { item.tests = item.tests.slice(0, beforeTestLen); }
      if (updates.updates) {
        item.status = beforeSnap.status;
        item.storage = beforeSnap.storage;
        item.smokeSource = beforeSnap.smokeSource;
        item.glueRatio = beforeSnap.glueRatio;
        item.ageYears = beforeSnap.ageYears;
        item.batchId = beforeSnap.batchId;
      }
      validationError = { status: 400, error: "no_changes", message: "提交的内容与当前版本完全一致，未创建新版本" };
      return;
    }
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
    createdVersion = version;
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  if (validationError) {
    return sendError(res, validationError.status, validationError.error, validationError.message);
  }

  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendCreated(res, { item, version: createdVersion });
}

export async function restoreItemVersion(req, res, id, versionNum) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return sendError(res, 404, "item_not_found", "墨锭不存在");
  const vNum = Number(versionNum);
  const input = await body(req);

  let notFound = false;

  const result = handleUpdatesWithConflict(COLLLECTIONS.ITEMS, item, input, (updates) => {
    const restored = restoreToVersion(item, vNum, {
      createdBy: updates.createdBy || "未指定用户",
      reason: updates.reason || `恢复至版本 v${vNum}`
    });
    if (!restored) {
      notFound = true;
      return;
    }
    updateRecordWithVersion(item, {}, { updatedBy: updates.createdBy || item._updatedBy });
    item._restoredVersion = restored;
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  if (notFound) {
    return sendError(res, 404, "version_not_found", "版本不存在");
  }

  const restored = item._restoredVersion;
  delete item._restoredVersion;
  await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.UPDATED, item);
  return sendOk(res, { item, restoredVersion: restored });
}

export async function compareTwoVersions(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const v1 = Number(url.searchParams.get("v1"));
  const v2 = Number(url.searchParams.get("v2"));
  if (!v1 || !v2) return send(res, 400, { error: "versions_required" });
  const version1 = (item.versions || []).find(v => v.version === v1);
  const version2 = (item.versions || []).find(v => v.version === v2);
  if (!version1) return send(res, 404, { error: "version1_not_found" });
  if (!version2) return send(res, 404, { error: "version2_not_found" });
  const changes = computeVersionDiff(version1.snapshot, version2.snapshot);
  return send(res, 200, {
    itemId: item.id,
    itemCode: item.code,
    version1: {
      version: version1.version,
      createdAt: version1.createdAt,
      createdBy: version1.createdBy,
      reason: version1.reason
    },
    version2: {
      version: version2.version,
      createdAt: version2.createdAt,
      createdBy: version2.createdBy,
      reason: version2.reason
    },
    changes
  });
}

function computeVersionDiff(snap1, snap2) {
  const diff = {};
  const fields = ["status", "storage", "smokeSource", "glueRatio", "ageYears", "batchId"];
  for (const f of fields) {
    const a = snap1[f];
    const b = snap2[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diff[f] = { v1: a, v2: b };
    }
  }
  const tests1 = snap1.tests || [];
  const tests2 = snap2.tests || [];
  if (tests1.length !== tests2.length) {
    diff.tests = {
      v1Count: tests1.length,
      v2Count: tests2.length,
      added: tests2.slice(tests1.length),
      removed: tests1.slice(tests2.length)
    };
  }
  const logs1 = snap1.logs || [];
  const logs2 = snap2.logs || [];
  if (logs1.length !== logs2.length) {
    diff.logs = {
      v1Count: logs1.length,
      v2Count: logs2.length,
      added: logs2.slice(logs1.length),
      removed: logs1.slice(logs2.length)
    };
  }
  return diff;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function previewCSVImport(req, res) {
  const db = await loadDb();
  const contentType = req.headers["content-type"] || "";

  let csvText = "";
  if (contentType.startsWith("multipart/form-data")) {
    const raw = await readRawBody(req);
    const boundary = contentType.split("boundary=")[1];
    if (boundary) {
      const parts = raw.split("--" + boundary);
      for (const part of parts) {
        if (part.includes('filename=') || part.includes('name="csvText"') || part.includes('name="file"')) {
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd !== -1) {
            csvText = part.slice(headerEnd + 4).replace(/\r\n--$/, "").trim();
            break;
          }
        }
      }
    }
  } else {
    const input = await body(req);
    csvText = input.csvText || "";
  }

  if (!csvText.trim()) {
    return send(res, 400, { error: "empty_csv", message: "CSV内容不能为空" });
  }

  const analysis = analyzeCSV(csvText, db.items, db.batches);

  const sanitizedAnalysis = {
    totalRows: analysis.totalRows,
    importableCount: analysis.importableCount,
    errorCount: analysis.errorCount,
    headers: analysis.headers,
    fieldMapping: analysis.fieldMapping,
    unrecognizedFields: analysis.unrecognizedFields,
    missingRequiredFields: analysis.missingRequiredFields,
    duplicateCodes: analysis.duplicateCodes,
    missingRequired: analysis.missingRequired,
    ageFormatErrors: analysis.ageFormatErrors,
    statusErrors: analysis.statusErrors,
    batchNotFound: analysis.batchNotFound,
    errors: analysis.errors,
    importableRows: analysis.importableRows.map(r => ({
      rowIndex: r.rowIndex,
      data: r.data
    }))
  };

  return send(res, 200, sanitizedAnalysis);
}

export async function confirmCSVImport(req, res) {
  const db = await loadDb();
  const input = await body(req);
  const { csvText, createdBy = "未指定用户", note = "" } = input;

  if (!csvText || !csvText.trim()) {
    return sendError(res, 400, "empty_csv", "CSV内容不能为空");
  }

  const analysis = analyzeCSV(csvText, db.items, db.batches);

  if (analysis.importableCount === 0) {
    return sendError(res, 400, "no_importable_rows", "没有可导入的有效数据行");
  }

  const items = buildImportItems(analysis, { createdBy });

  const importBatch = {
    id: newImportBatchId(),
    code: "IMP" + String((db.importBatches || []).length + 1).padStart(4, "0"),
    importedAt: new Date().toISOString(),
    importedBy: createdBy,
    itemCount: items.length,
    totalRows: analysis.totalRows,
    errorCount: analysis.errorCount,
    note,
    itemCodes: items.map(i => i.code),
    errors: analysis.errors
  };
  prepareNewRecord(importBatch, {
    createdAt: importBatch.importedAt,
    createdBy
  });

  for (const item of items) {
    prepareNewRecord(item, {
      createdAt: importBatch.importedAt,
      createdBy
    });
    db.items.unshift(item);
  }

  db.importBatches ||= [];
  db.importBatches.unshift(importBatch);

  for (const item of items) {
    await saveAndNotify(db, COLLLECTIONS.ITEMS, CHANGE_TYPES.CREATED, item);
  }
  await saveAndNotify(db, COLLLECTIONS.IMPORT_BATCHES, CHANGE_TYPES.CREATED, importBatch);

  return sendCreated(res, {
    importBatch,
    importedCount: items.length,
    importedItems: items.map(i => ({ id: i.id, code: i.code, smokeSource: i.smokeSource }))
  });
}

export async function getImportBatches(req, res) {
  const db = await loadDb();
  const batches = (db.importBatches || []).map(b => ({
    ...b,
    items: b.itemCodes ? b.itemCodes.length : 0
  }));
  return send(res, 200, batches);
}

export async function getImportBatch(req, res, id) {
  const db = await loadDb();
  const batch = (db.importBatches || []).find(b => b.id === id || b.code === id);
  if (!batch) return send(res, 404, { error: "import_batch_not_found" });

  const batchItems = db.items.filter(i => batch.itemCodes && batch.itemCodes.includes(i.code));
  return send(res, 200, {
    ...batch,
    items: batchItems.map(summarize)
  });
}

export async function getScoringRules(req, res) {
  const db = await loadDb();
  const rules = getSortedRules(db.scoringRules || []);
  const coverage = getCoverageSummary(db.scoringRules || []);
  const statuses = collectStatuses(db.scoringRules || [], db.items || []);
  return send(res, 200, { rules, coverage, statuses });
}

export async function createScoringRule(req, res) {
  const db = await loadDb();
  const input = await body(req);
  const rule = {
    id: newScoringRuleId(),
    name: input.name || "",
    minScore: Number(input.minScore),
    maxScore: Number(input.maxScore),
    resultStatus: input.resultStatus || "",
    hintText: input.hintText || "",
    order: Number(input.order) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const errors = validateRule(rule, db.scoringRules || []);
  if (errors.length > 0) {
    return sendError(res, 400, "validation_failed", "规则验证失败", { errors });
  }
  prepareNewRecord(rule, {
    createdAt: rule.createdAt,
    createdBy: input.createdBy || "未指定用户"
  });
  db.scoringRules ||= [];
  db.scoringRules.push(rule);
  await saveAndNotify(db, COLLLECTIONS.SCORING_RULES, CHANGE_TYPES.CREATED, rule);
  return sendCreated(res, rule);
}

export async function updateScoringRule(req, res, id) {
  const db = await loadDb();
  db.scoringRules ||= [];
  const rule = db.scoringRules.find(r => r.id === id);
  if (!rule) return sendError(res, 404, "rule_not_found", "评分规则不存在");
  const input = await body(req);

  let validationErrors = null;

  const result = handleUpdatesWithConflict(COLLLECTIONS.SCORING_RULES, rule, input, (updates) => {
    const updated = {
      ...rule,
      name: updates.name !== undefined ? updates.name : rule.name,
      minScore: updates.minScore !== undefined ? Number(updates.minScore) : rule.minScore,
      maxScore: updates.maxScore !== undefined ? Number(updates.maxScore) : rule.maxScore,
      resultStatus: updates.resultStatus !== undefined ? updates.resultStatus : rule.resultStatus,
      hintText: updates.hintText !== undefined ? updates.hintText : rule.hintText,
      order: updates.order !== undefined ? Number(updates.order) : rule.order,
      updatedAt: new Date().toISOString()
    };
    const errors = validateRule(updated, db.scoringRules, id);
    if (errors.length > 0) {
      validationErrors = errors;
      return;
    }
    Object.assign(rule, updated);
    updateRecordWithVersion(rule, {}, { updatedBy: updates.createdBy || rule._updatedBy });
  });

  if (!result.resolved && result.conflict) {
    return sendConflict(res, result.conflict);
  }

  if (validationErrors) {
    return sendError(res, 400, "validation_failed", "规则验证失败", { errors: validationErrors });
  }

  await saveAndNotify(db, COLLLECTIONS.SCORING_RULES, CHANGE_TYPES.UPDATED, rule);
  return sendOk(res, rule);
}

export async function deleteScoringRule(req, res, id) {
  const db = await loadDb();
  db.scoringRules ||= [];
  const idx = db.scoringRules.findIndex(r => r.id === id);
  if (idx === -1) return sendError(res, 404, "rule_not_found", "评分规则不存在");
  const deleted = db.scoringRules.splice(idx, 1)[0];
  await saveAndNotify(db, COLLLECTIONS.SCORING_RULES, CHANGE_TYPES.DELETED, deleted);
  return sendOk(res, { success: true });
}

export async function reorderScoringRules(req, res) {
  const db = await loadDb();
  db.scoringRules ||= [];
  const input = await body(req);
  const orderMap = input.orders || {};
  const updatedRules = [];
  for (const rule of db.scoringRules) {
    if (orderMap[rule.id] !== undefined) {
      updateRecordWithVersion(rule, { order: Number(orderMap[rule.id]) }, { updatedBy: input.createdBy || rule._updatedBy });
      updatedRules.push(rule);
    }
  }
  for (const rule of updatedRules) {
    await saveAndNotify(db, COLLLECTIONS.SCORING_RULES, CHANGE_TYPES.UPDATED, rule);
  }
  const rules = getSortedRules(db.scoringRules);
  return sendOk(res, { rules });
}

export async function previewRuleMatch(req, res) {
  const db = await loadDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const score = Number(url.searchParams.get("score"));
  if (isNaN(score)) {
    return send(res, 400, { error: "invalid_score" });
  }
  const match = matchRule(score, db.scoringRules || []);
  return send(res, 200, { score, match });
}
