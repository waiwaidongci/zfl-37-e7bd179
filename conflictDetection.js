import { COLLLECTIONS, getCollectionFields, computeFieldDiff, deepClone } from "./dataLayer.js";

export function detectConflict(collection, currentRecord, clientBaseVersion, clientUpdates) {
  if (!currentRecord) {
    return null;
  }

  const currentVersion = currentRecord._version || 1;
  const baseVersion = Number(clientBaseVersion) || 0;

  if (baseVersion === 0 || baseVersion >= currentVersion) {
    return null;
  }

  const fields = getCollectionFields(collection);
  const serverRecord = stripMeta(currentRecord);

  const clientUpdateFields = Object.keys(clientUpdates || {}).filter(k =>
    !k.startsWith('_') && fields.includes(k)
  );

  if (clientUpdateFields.length === 0) {
    return null;
  }

  const conflictingFields = {};

  for (const field of clientUpdateFields) {
    const clientValue = clientUpdates[field];
    const currentServerValue = serverRecord[field];

    if (currentRecord._changeLog && currentRecord._changeLog.length > 0) {
      const baseSnapshot = currentRecord._changeLog.find(c => c.version === baseVersion);
      if (baseSnapshot && baseSnapshot.snapshot) {
        const baseValue = baseSnapshot.snapshot[field];
        if (JSON.stringify(baseValue) !== JSON.stringify(currentServerValue)) {
          conflictingFields[field] = {
            serverValue: currentServerValue,
            clientValue,
            baseValue
          };
        }
      } else if (JSON.stringify(clientValue) !== JSON.stringify(currentServerValue)) {
        conflictingFields[field] = {
          serverValue: currentServerValue,
          clientValue,
          baseValue: undefined
        };
      }
    } else if (JSON.stringify(clientValue) !== JSON.stringify(currentServerValue)) {
      conflictingFields[field] = {
        serverValue: currentServerValue,
        clientValue,
        baseValue: undefined
      };
    }
  }

  if (Object.keys(conflictingFields).length === 0) {
    return null;
  }

  return {
    type: "version_conflict",
    collection,
    recordId: currentRecord.id,
    baseVersion,
    currentVersion,
    allServerChanges: Object.fromEntries(
      Object.entries(conflictingFields).map(([k, v]) => [k, { before: v.baseValue, after: v.serverValue }])
    ),
    conflictingFields,
    serverRecord: deepClone(serverRecord)
  };
}

function stripMeta(record) {
  const { _version, _createdAt, _createdBy, _updatedAt, _updatedBy, _changeLog, ...rest } = record;
  return rest;
}

export function resolveConflict(conflict, resolution) {
  const { conflictingFields, serverRecord } = conflict;
  const resolved = { ...serverRecord };

  for (const field of Object.keys(conflictingFields)) {
    const res = resolution[field];
    if (res === "keep_server") {
      resolved[field] = conflictingFields[field].serverValue;
    } else if (res === "keep_client") {
      resolved[field] = conflictingFields[field].clientValue;
    } else if (resolution[field] !== undefined) {
      resolved[field] = resolution[field];
    } else {
      resolved[field] = conflictingFields[field].serverValue;
    }
  }

  return resolved;
}

export function appendChangeLog(record, oldSnapshot) {
  if (!record._changeLog) {
    record._changeLog = [];
  }
  record._changeLog.push({
    version: record._version,
    snapshot: deepClone(oldSnapshot),
    at: record._updatedAt,
    by: record._updatedBy
  });
  if (record._changeLog.length > 50) {
    record._changeLog = record._changeLog.slice(-50);
  }
  return record;
}

export function detectDeleteConflict(collection, currentRecord, clientBaseVersion) {
  if (!currentRecord) return null;
  const currentVersion = currentRecord._version || 1;
  const baseVersion = Number(clientBaseVersion) || 0;
  if (baseVersion === 0 || baseVersion >= currentVersion) return null;
  return {
    type: "delete_conflict",
    collection,
    recordId: currentRecord.id,
    baseVersion,
    currentVersion,
    message: "该记录已被其他用户修改，是否仍要删除？",
    serverRecord: deepClone(stripMeta(currentRecord))
  };
}
