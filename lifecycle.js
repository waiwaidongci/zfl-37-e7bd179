export const LIFECYCLE_STATES = {
  CREATED: "建档",
  STORED: "入库",
  TESTED: "已试磨",
  RETEST: "复测",
  WATCHING: "重点观察",
  ARCHIVED: "归档"
};

export const LIFECYCLE_STATE_LIST = [
  LIFECYCLE_STATES.CREATED,
  LIFECYCLE_STATES.STORED,
  LIFECYCLE_STATES.TESTED,
  LIFECYCLE_STATES.RETEST,
  LIFECYCLE_STATES.WATCHING,
  LIFECYCLE_STATES.ARCHIVED
];

const TRANSITIONS = [
  {
    from: LIFECYCLE_STATES.CREATED,
    to: LIFECYCLE_STATES.STORED,
    action: "store",
    label: "入库",
    validate(item) {
      if (!item.storage || !item.storage.trim()) {
        return { allowed: false, reason: "入库需要指定存放位置" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.STORED,
    to: LIFECYCLE_STATES.TESTED,
    action: "test",
    label: "试磨",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录，无法标记为已试磨" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.STORED,
    to: LIFECYCLE_STATES.WATCHING,
    action: "markWatching",
    label: "标记重点观察",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录，无法标记重点观察" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.STORED,
    to: LIFECYCLE_STATES.RETEST,
    action: "retest",
    label: "创建复测",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录，无法创建复测" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.TESTED,
    to: LIFECYCLE_STATES.WATCHING,
    action: "markWatching",
    label: "标记重点观察",
    validate() {
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.TESTED,
    to: LIFECYCLE_STATES.RETEST,
    action: "retest",
    label: "创建复测",
    validate() {
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.TESTED,
    to: LIFECYCLE_STATES.ARCHIVED,
    action: "archive",
    label: "归档",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录不能直接归档" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.WATCHING,
    to: LIFECYCLE_STATES.RETEST,
    action: "retest",
    label: "创建复测",
    validate() {
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.WATCHING,
    to: LIFECYCLE_STATES.ARCHIVED,
    action: "archive",
    label: "归档",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录不能直接归档" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.RETEST,
    to: LIFECYCLE_STATES.TESTED,
    action: "passRetest",
    label: "复测达标",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "复测需要试磨记录才能确认达标" };
      }
      const lastTest = item.tests[item.tests.length - 1];
      if (lastTest && lastTest.score !== undefined && lastTest.score < 85) {
        return { allowed: false, reason: "复测评分未达85分，不能转为已试磨" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.RETEST,
    to: LIFECYCLE_STATES.WATCHING,
    action: "failRetest",
    label: "复测未达标",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "复测需要试磨记录" };
      }
      return { allowed: true };
    }
  },
  {
    from: LIFECYCLE_STATES.RETEST,
    to: LIFECYCLE_STATES.ARCHIVED,
    action: "archive",
    label: "归档",
    validate(item) {
      if (!item.tests || item.tests.length === 0) {
        return { allowed: false, reason: "未建试磨记录不能直接归档" };
      }
      return { allowed: true };
    }
  }
];

export function getAvailableTransitions(item) {
  const current = item.lifecycleState || inferLifecycleState(item);
  return TRANSITIONS
    .filter(t => t.from === current)
    .map(t => {
      const validation = t.validate(item);
      return {
        action: t.action,
        label: t.label,
        from: t.from,
        to: t.to,
        allowed: validation.allowed,
        reason: validation.allowed ? null : validation.reason
      };
    });
}

export function canTransition(item, action) {
  const current = item.lifecycleState || inferLifecycleState(item);
  const transition = TRANSITIONS.find(t => t.from === current && t.action === action);
  if (!transition) {
    return { allowed: false, reason: `当前状态「${current}」无法执行「${action}」操作` };
  }
  return transition.validate(item);
}

export function executeTransition(item, action) {
  const current = item.lifecycleState || inferLifecycleState(item);
  const transition = TRANSITIONS.find(t => t.from === current && t.action === action);
  if (!transition) {
    return { success: false, error: `当前状态「${current}」无法执行「${action}」操作` };
  }
  const validation = transition.validate(item);
  if (!validation.allowed) {
    return { success: false, error: validation.reason };
  }
  const previousState = current;
  item.lifecycleState = transition.to;
  item.lifecycleHistory ||= [];
  item.lifecycleHistory.push({
    from: previousState,
    to: transition.to,
    action: transition.action,
    label: transition.label,
    at: new Date().toISOString()
  });
  return { success: true, previousState, newState: transition.to };
}

export function inferLifecycleState(item) {
  const status = item.status || "";
  if (status === "归档") return LIFECYCLE_STATES.ARCHIVED;
  if (status === "建议复测") return LIFECYCLE_STATES.RETEST;
  if (status === "重点观察") return LIFECYCLE_STATES.WATCHING;
  if (status === "已试磨") return LIFECYCLE_STATES.TESTED;
  if (item.tests && item.tests.length > 0 && item.storage && item.storage.trim()) {
    return LIFECYCLE_STATES.TESTED;
  }
  if (item.storage && item.storage.trim()) return LIFECYCLE_STATES.STORED;
  return LIFECYCLE_STATES.CREATED;
}

export function lifecycleToStatus(lifecycleState) {
  switch (lifecycleState) {
    case LIFECYCLE_STATES.CREATED: return "待试磨";
    case LIFECYCLE_STATES.STORED: return "待试磨";
    case LIFECYCLE_STATES.TESTED: return "已试磨";
    case LIFECYCLE_STATES.RETEST: return "建议复测";
    case LIFECYCLE_STATES.WATCHING: return "重点观察";
    case LIFECYCLE_STATES.ARCHIVED: return "归档";
    default: return "待试磨";
  }
}

export function buildTimeline(item) {
  const events = [];
  const logs = item.logs || [];
  const tests = item.tests || [];
  const history = item.lifecycleHistory || [];

  for (const log of logs) {
    events.push({
      type: "log",
      at: log.at,
      step: log.step,
      note: log.note,
      score: log.score
    });
  }

  for (const test of tests) {
    events.push({
      type: "test",
      at: test.at,
      paper: test.paper,
      water: test.water,
      speed: test.speed,
      score: test.score,
      ruleName: test.ruleName,
      ruleHint: test.ruleHint
    });
  }

  for (const h of history) {
    events.push({
      type: "lifecycle",
      at: h.at,
      from: h.from,
      to: h.to,
      action: h.action,
      label: h.label
    });
  }

  events.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  return events;
}

export function getAllActions() {
  const actions = {};
  for (const t of TRANSITIONS) {
    if (!actions[t.action]) {
      actions[t.action] = { action: t.action, label: t.label };
    }
  }
  return Object.values(actions);
}

export function autoTransitionAfterTest(item, score) {
  const current = item.lifecycleState || inferLifecycleState(item);
  const numericScore = Number(score) || 0;
  if (current === LIFECYCLE_STATES.CREATED) {
    if (item.storage && item.storage.trim()) {
      return "store";
    }
    return null;
  }
  if (current === LIFECYCLE_STATES.STORED) {
    if (numericScore >= 85) {
      return "test";
    }
    if (numericScore >= 70) {
      return "markWatching";
    }
    if (numericScore >= 0) {
      return "retest";
    }
    return null;
  }
  if (current === LIFECYCLE_STATES.RETEST) {
    if (numericScore >= 85) {
      return "passRetest";
    }
    return "failRetest";
  }
  if (current === LIFECYCLE_STATES.TESTED) {
    if (numericScore >= 70 && numericScore < 85) {
      return "markWatching";
    }
    if (numericScore < 70) {
      return "retest";
    }
  }
  if (current === LIFECYCLE_STATES.WATCHING) {
    if (numericScore >= 85) {
      return "retest";
    }
  }
  return null;
}
