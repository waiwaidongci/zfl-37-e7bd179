import { loadDb, saveDb, newBatchId, newItemId, newTemplateId, newTaskId, summarize, computeBatchProgress, getDefaultTemplate, computeStorageKanban, buildComparisonReport, computeBatchDetail } from "./db.js";

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
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
  db.items.unshift(item);
  await saveDb(db);
  return send(res, 201, item);
}

export async function patchItem(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });
  const input = await body(req);
  const oldStatus = item.status;
  const oldStorage = item.storage;
  Object.assign(item, input);
  item.logs ||= [];
  if (input.status !== undefined && input.status !== oldStatus) {
    item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
  }
  if (input.storage !== undefined && input.storage !== oldStorage) {
    item.logs.push({ at: new Date().toISOString(), step: "存放位置", note: "从 " + (oldStorage || "未指定") + " 移至 " + (item.storage || "未指定") });
  }
  await saveDb(db);
  return send(res, 200, item);
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
  if (!item) return send(res, 404, { error: "item_not_found" });
  const input = await body(req);
  item.logs ||= [];
  item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
  await saveDb(db);
  return send(res, 201, item);
}

export async function addAction(req, res, id) {
  const db = await loadDb();
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) return send(res, 404, { error: "item_not_found" });
  const input = await body(req);
  item.logs ||= [];
  const score = Number(input.score || 0);
  item.tests ||= [];
  const testRecord = { at: new Date().toISOString(), ...input, score };
  item.tests.push(testRecord);
  item.status = score >= 85 ? "已试磨" : "重点观察";
  const noteParts = [];
  if (input.paper) noteParts.push(input.paper);
  if (input.water) noteParts.push(input.water);
  if (input.grindingTime) noteParts.push("研磨" + input.grindingTime);
  noteParts.push("评分" + score);
  item.logs.push({ at: new Date().toISOString(), step: "试磨", note: noteParts.join("，"), score });

  db.tasks ||= [];
  const pendingTask = db.tasks
    .filter(t => t.itemId === item.id && t.status === "已完成" && !t.testRecordId)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
  if (pendingTask) {
    pendingTask.testRecordId = testRecord.at;
  }

  await saveDb(db);
  return send(res, 201, item);
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
  db.batches ||= [];
  db.batches.unshift(batch);
  await saveDb(db);
  return send(res, 201, batch);
}

export async function getBatch(req, res, id) {
  const db = await loadDb();
  const batch = (db.batches || []).find(b => b.id === id || b.code === id);
  if (!batch) return send(res, 404, { error: "batch_not_found" });
  const detail = computeBatchDetail(batch, db.items, db.tasks || [], db.scoringRules || null);
  return send(res, 200, {
    ...batch,
    ...detail
  });
}

export async function createBatchTasks(req, res, id) {
  const db = await loadDb();
  const batch = (db.batches || []).find(b => b.id === id || b.code === id);
  if (!batch) return send(res, 404, { error: "batch_not_found" });

  const input = await body(req);
  const scheduledDate = input.scheduledDate || new Date().toISOString().slice(0, 10);
  const assignee = input.assignee || "";
  const note = input.note || "";
  const targetStatus = input.targetStatus || "待试磨";
  const itemIds = input.itemIds || null;

  const batchItems = db.items.filter(i => i.batchId === batch.id);
  let targetItems = batchItems;

  if (itemIds && Array.isArray(itemIds)) {
    targetItems = batchItems.filter(i => itemIds.includes(i.id) || itemIds.includes(i.code));
  } else if (targetStatus) {
    targetItems = batchItems.filter(i => i.status === targetStatus);
  }

  const createdTasks = [];
  const skippedItems = [];

  for (const item of targetItems) {
    const hasUnfinished = (db.tasks || []).some(t =>
      t.itemId === item.id && t.status !== "已完成" && t.status !== "已取消"
    );
    if (hasUnfinished) {
      skippedItems.push({ id: item.id, code: item.code, reason: "已有未完成任务" });
      continue;
    }

    const task = {
      id: newTaskId(),
      itemId: item.id,
      scheduledDate,
      assignee,
      status: "待办",
      note,
      createdAt: new Date().toISOString(),
      completedAt: null,
      testRecordId: null
    };

    db.tasks ||= [];
    db.tasks.unshift(task);
    createdTasks.push(enrichTask(task, db.items));
  }

  await saveDb(db);

  return send(res, 201, {
    batchId: batch.id,
    batchCode: batch.code,
    createdCount: createdTasks.length,
    skippedCount: skippedItems.length,
    createdTasks,
    skippedItems
  });
}

export async function getStats(req, res) {
  const db = await loadDb();
  const stats = Object.fromEntries(["待试磨", "已试磨", "重点观察"].map(label => [label, 0]));
  for (const item of db.items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
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
  db.templates.unshift(template);
  await saveDb(db);
  return send(res, 201, template);
}

export async function updateTemplate(req, res, id) {
  const db = await loadDb();
  const template = (db.templates || []).find(t => t.id === id);
  if (!template) return send(res, 404, { error: "template_not_found" });
  const input = await body(req);
  Object.assign(template, input);
  await saveDb(db);
  return send(res, 200, template);
}

export async function deleteTemplate(req, res, id) {
  const db = await loadDb();
  db.templates ||= [];
  const idx = db.templates.findIndex(t => t.id === id);
  if (idx === -1) return send(res, 404, { error: "template_not_found" });
  const deleted = db.templates.splice(idx, 1)[0];
  if (deleted.isDefault && db.templates.length > 0) {
    db.templates[0].isDefault = true;
  }
  await saveDb(db);
  return send(res, 200, { success: true });
}

export async function setDefaultTemplate(req, res, id) {
  const db = await loadDb();
  db.templates ||= [];
  const template = db.templates.find(t => t.id === id);
  if (!template) return send(res, 404, { error: "template_not_found" });
  db.templates.forEach(t => { t.isDefault = t.id === id; });
  await saveDb(db);
  return send(res, 200, db.templates);
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

  if (!input.itemId) return send(res, 400, { error: "item_id_required" });

  const item = db.items.find(x => x.id === input.itemId || x.code === input.itemId);
  if (!item) return send(res, 404, { error: "item_not_found" });

  const hasUnfinished = (db.tasks || []).some(t =>
    t.itemId === item.id && t.status !== "已完成" && t.status !== "已取消"
  );
  if (hasUnfinished) return send(res, 409, { error: "task_already_exists", message: "该墨锭已有未完成的试磨任务" });

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

  db.tasks ||= [];
  db.tasks.unshift(task);
  await saveDb(db);

  return send(res, 201, enrichTask(task, db.items));
}

export async function updateTask(req, res, id) {
  const db = await loadDb();
  const task = (db.tasks || []).find(t => t.id === id);
  if (!task) return send(res, 404, { error: "task_not_found" });

  const input = await body(req);
  const oldStatus = task.status;

  if (input.scheduledDate !== undefined) task.scheduledDate = input.scheduledDate;
  if (input.assignee !== undefined) task.assignee = input.assignee;
  if (input.note !== undefined) task.note = input.note;
  if (input.status !== undefined) {
    task.status = input.status;
    if (input.status === "已完成" && oldStatus !== "已完成") {
      task.completedAt = new Date().toISOString();
    } else if (input.status !== "已完成") {
      task.completedAt = null;
    }
  }

  await saveDb(db);
  return send(res, 200, enrichTask(task, db.items));
}

export async function completeTask(req, res, id) {
  const db = await loadDb();
  const task = (db.tasks || []).find(t => t.id === id);
  if (!task) return send(res, 404, { error: "task_not_found" });
  if (task.status === "已完成") return send(res, 400, { error: "task_already_completed" });

  const item = db.items.find(x => x.id === task.itemId);
  if (!item) return send(res, 404, { error: "item_not_found" });

  const input = await body(req);

  task.status = "已完成";
  task.completedAt = new Date().toISOString();

  if (input.paper || input.score !== undefined) {
    const score = Number(input.score || 0);
    item.tests ||= [];
    const testRecord = {
      at: new Date().toISOString(),
      paper: input.paper || "",
      water: input.water || "",
      speed: input.speed || "",
      colorLayer: input.colorLayer || "",
      sediment: input.sediment || "",
      score
    };
    item.tests.push(testRecord);
    task.testRecordId = testRecord.at;

    item.status = score >= 85 ? "已试磨" : "重点观察";
    item.logs ||= [];
    const noteParts = [];
    if (input.paper) noteParts.push(input.paper);
    if (input.water) noteParts.push(input.water);
    if (input.grindingTime) noteParts.push("研磨" + input.grindingTime);
    noteParts.push("评分" + score);
    item.logs.push({ at: new Date().toISOString(), step: "试磨", note: noteParts.join("，"), score });
  } else {
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: "任务完成", note: "试磨任务已完成，待录入试磨数据" });
  }

  await saveDb(db);
  return send(res, 200, enrichTask(task, db.items));
}

export async function deleteTask(req, res, id) {
  const db = await loadDb();
  db.tasks ||= [];
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx === -1) return send(res, 404, { error: "task_not_found" });
  db.tasks.splice(idx, 1);
  await saveDb(db);
  return send(res, 200, { success: true });
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
  if (!item) return send(res, 404, { error: "item_not_found" });

  db.items = db.items.filter(x => x.id !== item.id);

  db.tasks ||= [];
  db.tasks = db.tasks.filter(t => t.itemId !== item.id);

  await saveDb(db);
  return send(res, 200, { success: true });
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
