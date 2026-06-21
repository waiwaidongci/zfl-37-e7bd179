import { matchRule, validateRule, getSortedRules, getCoverageSummary, defaultScoringRules, collectStatuses } from "./scoringRules.js";

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

console.log("=== 评分规则模块回归测试 ===");
console.log("");

console.log("--- 1. 默认规则匹配测试 ---");

test("85分匹配「优秀（已试磨）」", () => {
  const result = matchRule(85, defaultScoringRules);
  assertTruthy(result, "应该有匹配结果");
  assertEq(result.resultStatus, "已试磨");
  assertEq(result.ruleName, "优秀（已试磨）");
  assertEq(result.matchedRange, "85-100");
});

test("100分匹配「优秀（已试磨）」", () => {
  const result = matchRule(100, defaultScoringRules);
  assertTruthy(result);
  assertEq(result.resultStatus, "已试磨");
});

test("84分匹配「合格（重点观察）」", () => {
  const result = matchRule(84, defaultScoringRules);
  assertTruthy(result);
  assertEq(result.resultStatus, "重点观察");
  assertEq(result.ruleName, "合格（重点观察）");
  assertEq(result.matchedRange, "70-84");
});

test("70分匹配「合格（重点观察）」", () => {
  const result = matchRule(70, defaultScoringRules);
  assertTruthy(result);
  assertEq(result.resultStatus, "重点观察");
});

test("69分匹配「待改进（建议复测）」", () => {
  const result = matchRule(69, defaultScoringRules);
  assertTruthy(result);
  assertEq(result.resultStatus, "建议复测");
  assertEq(result.ruleName, "待改进（建议复测）");
  assertEq(result.matchedRange, "0-69");
});

test("0分匹配「待改进（建议复测）」", () => {
  const result = matchRule(0, defaultScoringRules);
  assertTruthy(result);
  assertEq(result.resultStatus, "建议复测");
});

test("NaN分数不匹配任何规则", () => {
  const result = matchRule(NaN, defaultScoringRules);
  assertFalsy(result);
});

console.log("");
console.log("--- 2. 规则排序测试 ---");

test("默认规则按order排序", () => {
  const sorted = getSortedRules(defaultScoringRules);
  assertEq(sorted[0].order, 1);
  assertEq(sorted[1].order, 2);
  assertEq(sorted[2].order, 3);
  assertEq(sorted[0].name, "优秀（已试磨）");
  assertEq(sorted[2].name, "待改进（建议复测）");
});

test("相同order时按maxScore降序", () => {
  const rules = [
    { id: "1", name: "低", order: 1, minScore: 0, maxScore: 50, resultStatus: "待试磨" },
    { id: "2", name: "高", order: 1, minScore: 51, maxScore: 100, resultStatus: "已试磨" }
  ];
  const sorted = getSortedRules(rules);
  assertEq(sorted[0].name, "高");
  assertEq(sorted[1].name, "低");
});

console.log("");
console.log("--- 3. 规则校验测试 ---");

test("有效规则通过校验", () => {
  const rule = {
    name: "测试规则",
    minScore: 55,
    maxScore: 55,
    resultStatus: "重点观察"
  };
  const errors = validateRule(rule, []);
  assertEq(errors, []);
});

test("规则名称为空报错", () => {
  const rule = { name: "", minScore: 0, maxScore: 10, resultStatus: "待试磨" };
  const errors = validateRule(rule, defaultScoringRules);
  assertTruthy(errors.length > 0);
  assertTruthy(errors.some(e => e.includes("名称")));
});

test("min>max报错", () => {
  const rule = { name: "test", minScore: 80, maxScore: 70, resultStatus: "待试磨" };
  const errors = validateRule(rule, defaultScoringRules);
  assertTruthy(errors.length > 0);
  assertTruthy(errors.some(e => e.includes("大于")));
});

test("状态结果为空报错", () => {
  const rule = { name: "test", minScore: 0, maxScore: 10, resultStatus: "" };
  const errors = validateRule(rule, defaultScoringRules);
  assertTruthy(errors.length > 0);
  assertTruthy(errors.some(e => e.includes("状态")));
});

test("区间重叠报错", () => {
  const rule = { name: "重叠测试", minScore: 80, maxScore: 90, resultStatus: "已试磨" };
  const errors = validateRule(rule, defaultScoringRules);
  assertTruthy(errors.length > 0);
  assertTruthy(errors.some(e => e.includes("重叠")));
});

test("区间紧邻不报错", () => {
  const rule = { name: "紧邻测试", minScore: 65, maxScore: 69, resultStatus: "重点观察" };
  const existing = [
    { id: "x", name: "低", order: 1, minScore: 0, maxScore: 64, resultStatus: "待试磨" },
    { id: "y", name: "高", order: 2, minScore: 70, maxScore: 100, resultStatus: "已试磨" }
  ];
  const errors = validateRule(rule, existing);
  assertEq(errors, []);
});

test("排除自身ID后不报错重叠", () => {
  const rule = { id: "SCR-DEFAULT-HIGH", name: "编辑优秀", minScore: 85, maxScore: 100, resultStatus: "已试磨" };
  const errors = validateRule(rule, defaultScoringRules, "SCR-DEFAULT-HIGH");
  assertEq(errors, []);
});

test("分数超出0-100报错", () => {
  const r1 = { name: "t", minScore: -1, maxScore: 10, resultStatus: "待试磨" };
  const r2 = { name: "t", minScore: 0, maxScore: 101, resultStatus: "待试磨" };
  assertTruthy(validateRule(r1, []).length > 0);
  assertTruthy(validateRule(r2, []).length > 0);
});

console.log("");
console.log("--- 4. 覆盖率检查测试 ---");

test("默认规则覆盖率100%", () => {
  const cov = getCoverageSummary(defaultScoringRules);
  assertEq(cov.coveragePercent, 100);
  assertEq(cov.hasFullCoverage, true);
  assertEq(cov.gaps.length, 0);
  assertEq(cov.totalCoverage, 101);
});

test("缺失中间区间识别gap", () => {
  const rules = [
    { id: "1", name: "低", minScore: 0, maxScore: 50, resultStatus: "待试磨" },
    { id: "2", name: "高", minScore: 80, maxScore: 100, resultStatus: "已试磨" }
  ];
  const cov = getCoverageSummary(rules);
  assertEq(cov.hasFullCoverage, false);
  assertEq(cov.gaps.length, 1);
  assertEq(cov.gaps[0], [51, 79]);
});

test("缺失两端区间识别gap", () => {
  const rules = [
    { id: "1", name: "中", minScore: 30, maxScore: 70, resultStatus: "重点观察" }
  ];
  const cov = getCoverageSummary(rules);
  assertEq(cov.hasFullCoverage, false);
  assertEq(cov.gaps.length, 2);
  assertEq(cov.gaps[0], [0, 29]);
  assertEq(cov.gaps[1], [71, 100]);
});

console.log("");
console.log("--- 5. 空规则边界测试 ---");

test("空规则数组不匹配任何分数", () => {
  assertFalsy(matchRule(50, []));
  assertFalsy(matchRule(100, []));
});

test("空规则覆盖率0%", () => {
  const cov = getCoverageSummary([]);
  assertEq(cov.coveragePercent, 0);
  assertEq(cov.totalCoverage, 0);
  assertEq(cov.hasFullCoverage, false);
  assertEq(cov.gaps.length, 1);
  assertEq(cov.gaps[0], [0, 100]);
});

console.log("");
console.log("--- 6. 匹配优先级测试 ---");

test("order小的规则优先匹配（即使区间重叠）", () => {
  const overlappingRules = [
    { id: "a", name: "高优先级", order: 1, minScore: 0, maxScore: 100, resultStatus: "高优先结果", hintText: "" },
    { id: "b", name: "低优先级", order: 2, minScore: 80, maxScore: 100, resultStatus: "低优先结果", hintText: "" }
  ];
  const result = matchRule(90, overlappingRules);
  assertTruthy(result);
  assertEq(result.ruleName, "高优先级");
  assertEq(result.resultStatus, "高优先结果");
});

console.log("");
console.log("--- 7. 返回值完整性测试 ---");

test("匹配结果包含所有必要字段", () => {
  const result = matchRule(88, defaultScoringRules);
  assertTruthy(result.ruleId);
  assertTruthy(result.ruleName);
  assertTruthy(result.resultStatus);
  assertTruthy(result.hintText !== undefined);
  assertTruthy(result.matchedRange);
  assertEq(typeof result.score, "number");
});

console.log("");
console.log("--- 8. 自定义状态收集测试 ---");

test("默认规则收集到4种状态：含建议复测", () => {
  const statuses = collectStatuses(defaultScoringRules);
  assertTruthy(statuses.includes("待试磨"));
  assertTruthy(statuses.includes("已试磨"));
  assertTruthy(statuses.includes("重点观察"));
  assertTruthy(statuses.includes("建议复测"));
  assertEq(statuses.length, 4);
});

test("基础状态在前，自定义状态在后", () => {
  const statuses = collectStatuses(defaultScoringRules);
  assertEq(statuses[0], "待试磨");
  assertEq(statuses[1], "已试磨");
  assertEq(statuses[2], "重点观察");
  assertEq(statuses[3], "建议复测");
});

test("items中的状态也被收集", () => {
  const rules = [{ id: "1", name: "r1", minScore: 0, maxScore: 100, resultStatus: "返修中" }];
  const items = [{ status: "已报废" }, { status: "建议复测" }];
  const statuses = collectStatuses(rules, items);
  assertTruthy(statuses.includes("返修中"));
  assertTruthy(statuses.includes("已报废"));
  assertTruthy(statuses.includes("建议复测"));
  assertTruthy(statuses.includes("待试磨"));
  assertTruthy(statuses.includes("已试磨"));
  assertTruthy(statuses.includes("重点观察"));
});

test("空输入仍返回基础状态", () => {
  const statuses = collectStatuses(null, null);
  assertEq(statuses, ["待试磨", "已试磨", "重点观察"]);
});

test("去重：规则和items中重复的状态只出现一次", () => {
  const rules = [{ id: "1", name: "r1", minScore: 0, maxScore: 50, resultStatus: "建议复测" }];
  const items = [{ status: "建议复测" }, { status: "已试磨" }];
  const statuses = collectStatuses(rules, items);
  const count = statuses.filter(s => s === "建议复测").length;
  assertEq(count, 1);
});

console.log("");
console.log("=== 测试结果 ===");
console.log("通过: " + passed + " / " + (passed + failed));
console.log("失败: " + failed);

if (failed > 0) {
  process.exit(1);
}
