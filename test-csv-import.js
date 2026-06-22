import { analyzeCSV, buildImportItems } from "./csvImporter.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("✓ " + name);
  } catch (e) {
    failed++;
    console.error("✗ " + name);
    console.error("  " + (e.message || e));
  }
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg || "assertEq") + " - expected: " + e + ", actual: " + a);
  }
}

function assertTruthy(v, msg) {
  if (!v) throw new Error(msg || "expected truthy");
}

function assertFalsy(v, msg) {
  if (v) throw new Error(msg || "expected falsy");
}

console.log("=== CSV导入字段映射修正与错误行保留测试 ===");
console.log("");

console.log("--- 1. 手动映射修正未识别字段 ---");

test("未识别列通过manualMapping映射到code后可被正确识别", () => {
  const csv = "编号别名,烟料来源\nIS-301,黄山松烟\nIS-302,桐油烟";
  const result = analyzeCSV(csv, [], [], { "0": "code" });
  assertEq(result.unrecognizedFields.length, 0, "映射后不应有未识别字段");
  assertEq(result.fieldMapping.some(fm => fm.field === "code" && fm.header === "编号别名"), true, "应将编号别名映射到code");
  assertEq(result.importableCount, 2, "两行均应可导入");
});

test("未识别列映射到smokeSource后必填校验通过", () => {
  const csv = "墨锭编号,烟料\nIS-401,黄山松烟";
  const result = analyzeCSV(csv, [], [], { "1": "smokeSource" });
  assertEq(result.missingRequiredFields.length, 0, "smokeSource不应缺失");
  assertEq(result.importableCount, 1);
});

test("未识别列映射到glueRatio", () => {
  const csv = "墨锭编号,烟料来源,胶\nIS-501,黄山松烟,7.5%";
  const result = analyzeCSV(csv, [], [], { "2": "glueRatio" });
  assertTruthy(result.importableRows[0], "应有可导入行");
  assertEq(result.importableRows[0].data.glueRatio, "7.5%");
});

test("未识别列映射到ageYears", () => {
  const csv = "墨锭编号,烟料来源,年\nIS-601,黄山松烟,5";
  const result = analyzeCSV(csv, [], [], { "2": "ageYears" });
  assertTruthy(result.importableRows[0]);
  assertEq(result.importableRows[0].data.ageYears, 5);
});

test("未识别列映射到storage", () => {
  const csv = "墨锭编号,烟料来源,位置\nIS-701,黄山松烟,恒湿柜A";
  const result = analyzeCSV(csv, [], [], { "2": "storage" });
  assertEq(result.importableRows[0].data.storage, "恒湿柜A");
});

test("未识别列映射到batchId", () => {
  const csv = "墨锭编号,烟料来源,批\nIS-801,黄山松烟,B001";
  const existingBatches = [{ id: "batch-1", code: "B001" }];
  const result = analyzeCSV(csv, [], existingBatches, { "2": "batchId" });
  assertEq(result.importableRows[0].data.batchId, "batch-1", "应解析为batch ID");
});

test("未识别列映射到status", () => {
  const csv = "墨锭编号,烟料来源,状态列\nIS-901,黄山松烟,待试磨";
  const result = analyzeCSV(csv, [], [], { "2": "status" });
  assertEq(result.importableRows[0].data.status, "待试磨");
});

test("无效的fieldName映射被忽略", () => {
  const csv = "墨锭编号,烟料来源,备注\nIS-100,黄山松烟,测试";
  const result = analyzeCSV(csv, [], [], { "2": "invalidField" });
  assertEq(result.unrecognizedFields.length, 1, "无效映射应被忽略，列仍为未识别");
});

test("越界列索引映射被忽略", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟";
  const result = analyzeCSV(csv, [], [], { "99": "code" });
  assertEq(result.importableCount, 1, "越界索引不影响正常识别");
});

test("空manualMapping等同无映射", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟";
  const result1 = analyzeCSV(csv, [], [], {});
  const result2 = analyzeCSV(csv, [], []);
  assertEq(result1.importableCount, result2.importableCount);
  assertEq(result1.fieldMapping.length, result2.fieldMapping.length);
});

console.log("");
console.log("--- 2. 映射修正后重新校验 ---");

test("修正映射后缺失必填字段消除", () => {
  const csv = "编号别名,烟料别名\nIS-401,黄山松烟";
  const before = analyzeCSV(csv, [], []);
  assertEq(before.missingRequiredFields.length, 2, "修正前两个必填缺失");
  const after = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource" });
  assertEq(after.missingRequiredFields.length, 0, "修正后必填不缺失");
  assertEq(after.importableCount, 1);
});

test("修正映射后错误行变可导入", () => {
  const csv = "编号别名,烟料别名\nIS-401,黄山松烟";
  const before = analyzeCSV(csv, [], []);
  assertEq(before.importableCount, 0, "修正前无行可导入");
  const after = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource" });
  assertEq(after.importableCount, 1, "修正后1行可导入");
});

test("修正映射后status校验生效", () => {
  const csv = "编号别名,烟料别名,状态列\nIS-401,黄山松烟,无效状态";
  const result = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource", "2": "status" });
  assertEq(result.statusErrors.length, 1, "无效状态应报错");
  assertEq(result.importableCount, 0, "状态错误行不可导入");
});

test("修正映射后ageYears校验生效", () => {
  const csv = "编号别名,烟料别名,年限列\nIS-401,黄山松烟,abc";
  const result = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource", "2": "ageYears" });
  assertEq(result.ageFormatErrors.length, 1, "年限格式错误应报错");
});

console.log("");
console.log("--- 3. 错误行保留测试 ---");

test("错误行保留在parsedRows中且标记hasError", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟\n,桐油烟\nIS-102,";
  const result = analyzeCSV(csv, [], []);
  assertEq(result.totalRows, 3, "总行数应为3");
  assertEq(result.parsedRows.length, 3, "parsedRows应保留所有行");
  assertEq(result.parsedRows[0].hasError, false, "第1行无错");
  assertEq(result.parsedRows[1].hasError, true, "第2行有错（缺code）");
  assertEq(result.parsedRows[2].hasError, true, "第3行有错（缺smokeSource）");
});

test("错误行不出现在importableRows中", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟\n,桐油烟";
  const result = analyzeCSV(csv, [], []);
  assertEq(result.importableRows.length, 1, "只有1行可导入");
  assertEq(result.importableRows[0].data.code, "IS-100");
});

test("部分错误行保留，部分可导入", () => {
  const csv = "墨锭编号,烟料来源,状态\nIS-100,黄山松烟,待试磨\nIS-101,桐油烟,无效状态\nIS-102,松烟,已试磨";
  const result = analyzeCSV(csv, [], []);
  assertEq(result.totalRows, 3);
  assertEq(result.importableCount, 2, "2行可导入");
  assertEq(result.errorCount, 1, "1行有错");
  assertEq(result.parsedRows[1].hasError, true, "第2行状态错误");
  assertEq(result.parsedRows[1].data.status, "无效状态", "错误行数据保留");
});

test("重复编号行保留在parsedRows中", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟\nIS-100,桐油烟";
  const result = analyzeCSV(csv, [], []);
  assertEq(result.parsedRows.length, 2);
  assertEq(result.duplicateCodes.length, 1);
  assertEq(result.parsedRows[1].hasError, true, "重复行标记有错");
  assertEq(result.parsedRows[1].data.code, "IS-100", "重复行数据保留");
});

test("修正映射后错误行重新校验并保留", () => {
  const csv = "编号别名,烟料别名\nIS-100,黄山松烟\n,桐油烟";
  const result = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource" });
  assertEq(result.parsedRows.length, 2, "所有行保留");
  assertEq(result.parsedRows[0].hasError, false, "第1行有效");
  assertEq(result.parsedRows[1].hasError, true, "第2行缺code仍错");
  assertEq(result.importableCount, 1, "只有1行可导入");
});

console.log("");
console.log("--- 4. 映射覆盖已识别字段 ---");

test("手动映射覆盖自动识别结果", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟";
  const result = analyzeCSV(csv, [], [], { "0": "smokeSource", "1": "code" });
  const row = result.importableRows[0];
  assertTruthy(row, "应有可导入行");
  assertEq(row.data.code, "黄山松烟", "第2列映射为code");
  assertEq(row.data.smokeSource, "IS-100", "第1列映射为smokeSource");
});

test("映射为空值取消已有识别", () => {
  const csv = "墨锭编号,烟料来源\nIS-100,黄山松烟";
  const result = analyzeCSV(csv, [], [], { "0": "" });
  assertTruthy(result.unrecognizedFields.some(u => u.header === "墨锭编号"), "原识别列变为未识别");
});

console.log("");
console.log("--- 5. buildImportItems与映射配合 ---");

test("修正映射后buildImportItems生成正确数据", () => {
  const csv = "编号别名,烟料别名\nIS-100,黄山松烟";
  const analysis = analyzeCSV(csv, [], [], { "0": "code", "1": "smokeSource" });
  const items = buildImportItems(analysis, { createdBy: "测试" });
  assertEq(items.length, 1);
  assertEq(items[0].code, "IS-100");
  assertEq(items[0].smokeSource, "黄山松烟");
});

console.log("");
console.log(`=== 测试完成：${passed} 通过，${failed} 失败 ===`);
if (failed > 0) process.exit(1);
