const REQUIRED_FIELDS = ["code", "smokeSource"];
const OPTIONAL_FIELDS = ["glueRatio", "ageYears", "storage", "batchId", "status"];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_ALIASES = {
  "墨锭编号": "code",
  "编号": "code",
  "code": "code",
  "烟料来源": "smokeSource",
  "烟料": "smokeSource",
  "来源": "smokeSource",
  "smokeSource": "smokeSource",
  "胶料比例": "glueRatio",
  "胶比": "glueRatio",
  "glueRatio": "glueRatio",
  "存放年限": "ageYears",
  "年限": "ageYears",
  "年龄": "ageYears",
  "ageYears": "ageYears",
  "存放位置": "storage",
  "位置": "storage",
  "storage": "storage",
  "批次编号": "batchId",
  "批次": "batchId",
  "batchId": "batchId",
  "状态": "status",
  "status": "status"
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const separator = detectSeparator(lines[0]);
  const headers = parseLine(lines[0], separator);
  const rows = lines.slice(1).map(line => parseLine(line, separator)).filter(row => row.some(cell => cell.trim()));

  return { headers, rows };
}

function detectSeparator(line) {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let maxCount = -1;
  for (const sep of candidates) {
    const count = (line.match(new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      best = sep;
    }
  }
  return best;
}

function parseLine(line, separator) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function recognizeFields(headers) {
  const recognized = {};
  const unrecognized = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();
    const normalized = header.toLowerCase().trim();
    const mapped = FIELD_ALIASES[header] || FIELD_ALIASES[normalized];
    if (mapped) {
      recognized[mapped] = i;
    } else {
      unrecognized.push({ index: i, header });
    }
  }

  return { recognized, unrecognized };
}

function validateAge(value) {
  if (value === null || value === undefined || value === "") return true;
  const num = Number(value);
  return !isNaN(num) && num >= 0 && Number.isInteger(num);
}

function normalizeValue(field, value) {
  if (value === null || value === undefined) return "";
  const trimmed = String(value).trim();
  if (trimmed === "") return "";

  if (field === "ageYears") {
    const num = Number(trimmed);
    return isNaN(num) ? trimmed : num;
  }

  return trimmed;
}

export function analyzeCSV(csvText, existingItems = [], existingBatches = [], manualMapping = {}) {
  const { headers, rows } = parseCSV(csvText);
  let { recognized, unrecognized } = recognizeFields(headers);

  if (manualMapping && typeof manualMapping === "object") {
    for (const [colIndexStr, fieldName] of Object.entries(manualMapping)) {
      const colIdx = Number(colIndexStr);
      if (isNaN(colIdx) || colIdx < 0 || colIdx >= headers.length) continue;
      const existingField = Object.entries(recognized).find(([, idx]) => idx === colIdx);
      if (existingField) {
        delete recognized[existingField[0]];
      }
      if (!fieldName) {
        unrecognized = unrecognized.filter(u => u.index !== colIdx);
        unrecognized.push({ index: colIdx, header: headers[colIdx] });
        continue;
      }
      if (!ALL_FIELDS.includes(fieldName)) continue;
      const prevIdx = recognized[fieldName];
      if (prevIdx !== undefined) {
        unrecognized = unrecognized.filter(u => u.index !== prevIdx);
        unrecognized.push({ index: prevIdx, header: headers[prevIdx] });
      }
      recognized[fieldName] = colIdx;
      unrecognized = unrecognized.filter(u => u.index !== colIdx);
    }
  }

  const existingCodes = new Set(existingItems.map(item => item.code).filter(Boolean));
  const existingBatchCodes = new Map(existingBatches.map(b => [b.code, b.id]));
  const validStatuses = new Set(["待试磨", "已试磨", "重点观察"]);

  const parsedRows = [];
  const duplicateCodes = [];
  const missingRequired = [];
  const ageFormatErrors = [];
  const statusErrors = [];
  const batchNotFound = [];
  const seenCodes = new Set();

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const parsed = {};
    let hasError = false;

    for (const [field, colIdx] of Object.entries(recognized)) {
      const rawValue = row[colIdx] ?? "";
      parsed[field] = normalizeValue(field, rawValue);
    }

    const code = parsed.code;
    if (!code) {
      missingRequired.push({ row: rowIdx + 2, field: "code", message: "缺少墨锭编号" });
      hasError = true;
    } else {
      if (existingCodes.has(code)) {
        duplicateCodes.push({ row: rowIdx + 2, code, message: `编号 ${code} 已存在` });
        hasError = true;
      }
      if (seenCodes.has(code)) {
        duplicateCodes.push({ row: rowIdx + 2, code, message: `编号 ${code} 在CSV中重复` });
        hasError = true;
      }
      seenCodes.add(code);
    }

    if (!parsed.smokeSource) {
      missingRequired.push({ row: rowIdx + 2, field: "smokeSource", message: "缺少烟料来源" });
      hasError = true;
    }

    if (parsed.ageYears !== "" && !validateAge(parsed.ageYears)) {
      ageFormatErrors.push({ row: rowIdx + 2, value: parsed.ageYears, message: `年龄格式错误：${parsed.ageYears}，应为非负整数` });
      hasError = true;
    }

    if (parsed.status && !validStatuses.has(parsed.status)) {
      statusErrors.push({ row: rowIdx + 2, value: parsed.status, message: `状态值错误：${parsed.status}，应为：待试磨、已试磨、重点观察` });
      hasError = true;
    }

    if (parsed.batchId) {
      const batchId = existingBatchCodes.get(parsed.batchId);
      if (batchId) {
        parsed.batchId = batchId;
      } else {
        const batchExists = existingBatches.some(b => b.id === parsed.batchId);
        if (!batchExists) {
          batchNotFound.push({ row: rowIdx + 2, value: parsed.batchId, message: `批次不存在：${parsed.batchId}` });
          hasError = true;
        }
      }
    }

    parsedRows.push({
      rowIndex: rowIdx + 2,
      data: parsed,
      hasError,
      raw: row
    });
  }

  const importableRows = parsedRows.filter(r => !r.hasError);
  const errors = [
    ...duplicateCodes,
    ...missingRequired,
    ...ageFormatErrors,
    ...statusErrors,
    ...batchNotFound
  ].sort((a, b) => a.row - b.row);

  const fieldMapping = Object.entries(recognized).map(([field, colIdx]) => ({
    field,
    header: headers[colIdx],
    columnIndex: colIdx,
    required: REQUIRED_FIELDS.includes(field)
  })).sort((a, b) => a.columnIndex - b.columnIndex);

  return {
    totalRows: rows.length,
    importableCount: importableRows.length,
    errorCount: errors.length,
    headers,
    fieldMapping,
    unrecognizedFields: unrecognized,
    missingRequiredFields: REQUIRED_FIELDS.filter(f => !(f in recognized)),
    duplicateCodes,
    missingRequired,
    ageFormatErrors,
    statusErrors,
    batchNotFound,
    errors,
    importableRows,
    parsedRows
  };
}

export function buildImportItems(analysisResult, options = {}) {
  const { createdBy = "未指定用户", defaultStatus = "待试磨" } = options;
  const now = new Date().toISOString();

  return analysisResult.importableRows.map(({ data }) => {
    const item = {
      id: "IS-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      code: data.code,
      smokeSource: data.smokeSource,
      glueRatio: data.glueRatio || "",
      ageYears: data.ageYears !== "" ? Number(data.ageYears) : null,
      storage: data.storage || "",
      batchId: data.batchId || "",
      status: data.status || defaultStatus,
      logs: [{
        at: now,
        step: "建档",
        note: `CSV批量导入创建墨锭${data.batchId ? "，归入批次" : ""}`
      }],
      tests: [],
      versions: [{
        version: 1,
        createdAt: now,
        createdBy,
        reason: "CSV批量导入建档",
        action: "create",
        parentVersion: null,
        snapshot: null,
        changes: null
      }],
      currentVersion: 1
    };

    item.versions[0].snapshot = {
      status: item.status,
      storage: item.storage,
      smokeSource: item.smokeSource,
      glueRatio: item.glueRatio,
      ageYears: item.ageYears,
      batchId: item.batchId,
      logs: JSON.parse(JSON.stringify(item.logs)),
      tests: []
    };

    return item;
  });
}

export function generateImportLog(importBatch, importedItems, createdBy = "未指定用户") {
  return {
    at: new Date().toISOString(),
    step: "批量建档",
    note: `CSV批量导入完成，批次 ${importBatch.code}，成功导入 ${importedItems.length} 条记录`,
    createdBy,
    batchCode: importBatch.code
  };
}
