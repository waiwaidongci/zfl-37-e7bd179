export function newScoringRuleId() {
  return "SCR-" + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export const defaultScoringRules = [
  {
    id: "SCR-DEFAULT-HIGH",
    name: "优秀（已试磨）",
    minScore: 85,
    maxScore: 100,
    resultStatus: "已试磨",
    hintText: "试磨评分优秀，可正式使用",
    order: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "SCR-DEFAULT-MID",
    name: "合格（重点观察）",
    minScore: 70,
    maxScore: 84,
    resultStatus: "重点观察",
    hintText: "试磨评分合格，需继续观察使用效果",
    order: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "SCR-DEFAULT-LOW",
    name: "待改进（建议复测）",
    minScore: 0,
    maxScore: 69,
    resultStatus: "待试磨",
    hintText: "试磨评分偏低，建议调整参数后复测",
    order: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

export function initScoringRules(db) {
  if (!db.scoringRules || !Array.isArray(db.scoringRules) || db.scoringRules.length === 0) {
    db.scoringRules = JSON.parse(JSON.stringify(defaultScoringRules));
    return true;
  }
  for (const rule of db.scoringRules) {
    if (!rule.id) rule.id = newScoringRuleId();
    if (rule.order === undefined || rule.order === null) rule.order = 0;
    if (!rule.createdAt) rule.createdAt = new Date().toISOString();
    if (!rule.updatedAt) rule.updatedAt = new Date().toISOString();
  }
  return false;
}

export function getSortedRules(rules) {
  return [...rules].sort((a, b) => {
    const orderDiff = (a.order || 0) - (b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return (b.maxScore || 0) - (a.maxScore || 0);
  });
}

export function validateRule(rule, allRules, excludeId = null) {
  const errors = [];
  if (!rule.name || !rule.name.toString().trim()) {
    errors.push("规则名称不能为空");
  }
  const min = Number(rule.minScore);
  const max = Number(rule.maxScore);
  if (isNaN(min) || isNaN(max)) {
    errors.push("分数区间必须为数字");
  } else {
    if (min < 0 || min > 100) errors.push("最低分必须在0-100之间");
    if (max < 0 || max > 100) errors.push("最高分必须在0-100之间");
    if (min > max) errors.push("最低分不能大于最高分");
  }
  if (!rule.resultStatus || !rule.resultStatus.toString().trim()) {
    errors.push("状态结果不能为空");
  }
  if (errors.length > 0) return errors;
  if (!isNaN(min) && !isNaN(max)) {
    for (const other of allRules) {
      if (excludeId && other.id === excludeId) continue;
      const oMin = Number(other.minScore);
      const oMax = Number(other.maxScore);
      if (isNaN(oMin) || isNaN(oMax)) continue;
      if (!(max < oMin || min > oMax)) {
        errors.push(`分数区间与规则「${other.name}」(${oMin}-${oMax})重叠`);
      }
    }
  }
  return errors;
}

export function matchRule(score, rules) {
  const num = Number(score);
  if (isNaN(num)) return null;
  const sorted = getSortedRules(rules);
  for (const rule of sorted) {
    const min = Number(rule.minScore);
    const max = Number(rule.maxScore);
    if (num >= min && num <= max) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        resultStatus: rule.resultStatus,
        hintText: rule.hintText || "",
        score: num,
        matchedRange: `${min}-${max}`
      };
    }
  }
  return null;
}

export function getCoverageSummary(rules) {
  const sorted = [...rules]
    .filter(r => !isNaN(Number(r.minScore)) && !isNaN(Number(r.maxScore)))
    .map(r => ({ min: Number(r.minScore), max: Number(r.maxScore) }))
    .sort((a, b) => a.min - b.min);
  let covered = 0;
  let gaps = [];
  let lastEnd = -1;
  for (const rule of sorted) {
    const min = rule.min;
    const max = rule.max;
    if (min > lastEnd + 1) {
      gaps.push([lastEnd + 1, min - 1]);
    }
    const effectiveMin = Math.max(min, lastEnd + 1);
    if (effectiveMin <= max) {
      covered += (max - effectiveMin + 1);
    }
    lastEnd = Math.max(lastEnd, max);
  }
  if (lastEnd < 100) {
    gaps.push([lastEnd + 1, 100]);
  }
  gaps = gaps.filter(([a, b]) => a <= b);
  return {
    totalCoverage: covered,
    coveragePercent: Math.round((covered / 101) * 100),
    gaps,
    hasFullCoverage: gaps.length === 0
  };
}
