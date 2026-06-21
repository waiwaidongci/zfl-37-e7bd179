import { loadDb, saveDb, newBatchId, newItemId, newTemplateId, summarize, computeBatchProgress, getDefaultTemplate, computeStorageKanban } from "./db.js";

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
  item.tests.push({ at: new Date().toISOString(), ...input, score });
  item.status = score >= 85 ? "已试磨" : "重点观察";
  const noteParts = [];
  if (input.paper) noteParts.push(input.paper);
  if (input.water) noteParts.push(input.water);
  if (input.grindingTime) noteParts.push("研磨" + input.grindingTime);
  noteParts.push("评分" + score);
  item.logs.push({ at: new Date().toISOString(), step: "试磨", note: noteParts.join("，"), score });
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
  const batchItems = db.items.filter(i => i.batchId === batch.id);
  return send(res, 200, {
    ...batch,
    items: batchItems.map(summarize),
    progress: computeBatchProgress(batch, db.items)
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
