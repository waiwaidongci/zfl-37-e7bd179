import { EventEmitter } from "node:events";

const syncEmitter = new EventEmitter();
syncEmitter.setMaxListeners(100);

const CHANGE_TYPES = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  BATCH_UPDATED: "batch_updated"
};

export function emitChange(collection, changeType, record, extra = {}) {
  const event = {
    collection,
    changeType,
    recordId: record.id,
    record: sanitizeRecord(record),
    timestamp: new Date().toISOString(),
    ...extra
  };
  syncEmitter.emit("data-change", event);
  syncEmitter.emit(`${collection}:${changeType}`, event);
  syncEmitter.emit(`${collection}:${record.id}`, event);
  return event;
}

export function onDataChange(callback) {
  syncEmitter.on("data-change", callback);
  return () => syncEmitter.off("data-change", callback);
}

export function onCollectionChange(collection, callback) {
  const handler = (event) => callback(event);
  syncEmitter.on(`${collection}:created`, handler);
  syncEmitter.on(`${collection}:updated`, handler);
  syncEmitter.on(`${collection}:deleted`, handler);
  return () => {
    syncEmitter.off(`${collection}:created`, handler);
    syncEmitter.off(`${collection}:updated`, handler);
    syncEmitter.off(`${collection}:deleted`, handler);
  };
}

function sanitizeRecord(record) {
  if (!record) return null;
  const { _changeLog, ...safe } = record;
  return safe;
}

export { CHANGE_TYPES };
