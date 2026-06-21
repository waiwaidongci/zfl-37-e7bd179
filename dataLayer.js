export const COLLLECTIONS = {
  ITEMS: "items",
  BATCHES: "batches",
  TEMPLATES: "templates",
  TASKS: "tasks",
  IMPORT_BATCHES: "importBatches",
  SCORING_RULES: "scoringRules"
};

export const COLLECTION_FIELDS = {
  [COLLLECTIONS.ITEMS]: ["code", "batchId", "smokeSource", "glueRatio", "ageYears", "storage", "status", "logs", "tests"],
  [COLLLECTIONS.BATCHES]: ["code", "smokeSource", "receiveDate", "note"],
  [COLLLECTIONS.TEMPLATES]: ["name", "paper", "water", "grindingTime", "speed", "observationPoints", "isDefault"],
  [COLLLECTIONS.TASKS]: ["itemId", "scheduledDate", "assignee", "status", "note", "completedAt", "testRecordId"],
  [COLLLECTIONS.IMPORT_BATCHES]: ["code", "importedAt", "importedBy", "itemCount", "totalRows", "errorCount", "note", "itemCodes", "errors"],
  [COLLLECTIONS.SCORING_RULES]: ["name", "minScore", "maxScore", "resultStatus", "hintText", "order"]
};

export function getCollectionFields(collection) {
  return COLLECTION_FIELDS[collection] || [];
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureMetaFields(record, options = {}) {
  const now = nowIso();
  let changed = false;

  if (!record._version) {
    record._version = 1;
    changed = true;
  }
  if (typeof record._version !== "number") {
    record._version = Number(record._version) || 1;
    changed = true;
  }

  if (!record._createdAt) {
    record._createdAt = options.createdAt || record.createdAt || now;
    changed = true;
  }
  if (!record._createdBy) {
    record._createdBy = options.createdBy || record.createdBy || "系统迁移";
    changed = true;
  }
  if (!record._updatedAt) {
    record._updatedAt = options.updatedAt || record.updatedAt || record._createdAt || now;
    changed = true;
  }
  if (!record._updatedBy) {
    record._updatedBy = options.updatedBy || record.updatedBy || record._createdBy || "系统迁移";
    changed = true;
  }

  return changed;
}

export function bumpMetaFields(record, options = {}) {
  record._version = (record._version || 0) + 1;
  record._updatedAt = nowIso();
  if (options.updatedBy) {
    record._updatedBy = options.updatedBy;
  }
  return record;
}

export function computeFieldDiff(before, after, fields) {
  const diff = {};
  for (const field of fields) {
    const beforeVal = before ? before[field] : undefined;
    const afterVal = after ? after[field] : undefined;
    const beforeJson = JSON.stringify(beforeVal);
    const afterJson = JSON.stringify(afterVal);
    if (beforeJson !== afterJson) {
      diff[field] = {
        before: beforeVal,
        after: afterVal
      };
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
