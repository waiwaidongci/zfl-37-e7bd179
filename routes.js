import { loadDb, saveDb, newBatchId, newItemId, summarize, computeBatchProgress } from "./db.js";

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
  Object.assign(item, await body(req));
  item.logs ||= [];
  item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
  await saveDb(db);
  return send(res, 200, item);
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
  item.logs.push({ at: new Date().toISOString(), step: "试磨", note: (input.paper || "试纸") + "，评分" + score, score });
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
