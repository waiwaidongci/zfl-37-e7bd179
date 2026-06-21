import {
  LIFECYCLE_STATES,
  LIFECYCLE_STATE_LIST,
  getAvailableTransitions,
  canTransition,
  executeTransition,
  inferLifecycleState,
  lifecycleToStatus,
  buildTimeline,
  getAllActions,
  autoTransitionAfterTest
} from "./lifecycle.js";

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
    throw new Error((msg || "") + " expected " + e + " got " + a);
  }
}

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || "expected truthy");
}

function makeItem(overrides = {}) {
  return {
    id: "IS-TEST",
    code: "IS-TEST",
    status: "待试磨",
    storage: "",
    logs: [],
    tests: [],
    lifecycleState: "建档",
    lifecycleHistory: [],
    ...overrides
  };
}

test("LIFECYCLE_STATE_LIST has 6 states", () => {
  assertEq(LIFECYCLE_STATE_LIST.length, 6);
  assertEq(LIFECYCLE_STATE_LIST[0], "建档");
  assertEq(LIFECYCLE_STATE_LIST[5], "归档");
});

test("inferLifecycleState - item with no data is 建档", () => {
  assertEq(inferLifecycleState(makeItem()), "建档");
});

test("inferLifecycleState - item with storage but no tests is 入库", () => {
  assertEq(inferLifecycleState(makeItem({ storage: "恒湿柜A" })), "入库");
});

test("inferLifecycleState - item with storage and tests is 已试磨", () => {
  assertEq(inferLifecycleState(makeItem({ storage: "恒湿柜A", tests: [{ score: 90 }] })), "已试磨");
});

test("inferLifecycleState - status=重点观察 maps to 重点观察", () => {
  assertEq(inferLifecycleState(makeItem({ status: "重点观察" })), "重点观察");
});

test("inferLifecycleState - status=建议复测 maps to 复测", () => {
  assertEq(inferLifecycleState(makeItem({ status: "建议复测" })), "复测");
});

test("inferLifecycleState - status=归档 maps to 归档", () => {
  assertEq(inferLifecycleState(makeItem({ status: "归档" })), "归档");
});

test("lifecycleToStatus mapping", () => {
  assertEq(lifecycleToStatus("建档"), "待试磨");
  assertEq(lifecycleToStatus("入库"), "待试磨");
  assertEq(lifecycleToStatus("已试磨"), "已试磨");
  assertEq(lifecycleToStatus("复测"), "建议复测");
  assertEq(lifecycleToStatus("重点观察"), "重点观察");
  assertEq(lifecycleToStatus("归档"), "归档");
});

test("canTransition - 建档 → 入库 requires storage", () => {
  const item = makeItem({ lifecycleState: "建档" });
  const result = canTransition(item, "store");
  assertEq(result.allowed, false);
  assertTrue(result.reason.includes("存放位置"));
});

test("canTransition - 建档 → 入库 with storage", () => {
  const item = makeItem({ lifecycleState: "建档", storage: "恒湿柜A" });
  const result = canTransition(item, "store");
  assertEq(result.allowed, true);
});

test("canTransition - 入库 → 试磨 requires test record", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A" });
  const result = canTransition(item, "test");
  assertEq(result.allowed, false);
  assertTrue(result.reason.includes("试磨记录"));
});

test("canTransition - 入库 → 试磨 with test record", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 90 }] });
  const result = canTransition(item, "test");
  assertEq(result.allowed, true);
});

test("canTransition - 已试磨 → 归档 requires test record", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [] });
  const result = canTransition(item, "archive");
  assertEq(result.allowed, false);
});

test("canTransition - 已试磨 → 归档 with test record", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  const result = canTransition(item, "archive");
  assertEq(result.allowed, true);
});

test("canTransition - 已试磨 → 重点观察", () => {
  const item = makeItem({ lifecycleState: "已试磨" });
  const result = canTransition(item, "markWatching");
  assertEq(result.allowed, true);
});

test("canTransition - 重点观察 → 复测", () => {
  const item = makeItem({ lifecycleState: "重点观察" });
  const result = canTransition(item, "retest");
  assertEq(result.allowed, true);
});

test("canTransition - 复测 → 已试磨 requires score >= 85", () => {
  const item = makeItem({ lifecycleState: "复测", tests: [{ score: 80 }] });
  const result = canTransition(item, "passRetest");
  assertEq(result.allowed, false);
  assertTrue(result.reason.includes("85"));
});

test("canTransition - 复测 → 已试磨 with score >= 85", () => {
  const item = makeItem({ lifecycleState: "复测", tests: [{ score: 90 }] });
  const result = canTransition(item, "passRetest");
  assertEq(result.allowed, true);
});

test("canTransition - invalid action for current state", () => {
  const item = makeItem({ lifecycleState: "建档" });
  const result = canTransition(item, "archive");
  assertEq(result.allowed, false);
});

test("executeTransition - success case", () => {
  const item = makeItem({ lifecycleState: "建档", storage: "恒湿柜A" });
  const result = executeTransition(item, "store");
  assertEq(result.success, true);
  assertEq(result.previousState, "建档");
  assertEq(result.newState, "入库");
  assertEq(item.lifecycleState, "入库");
  assertEq(item.lifecycleHistory.length, 1);
  assertEq(item.lifecycleHistory[0].from, "建档");
  assertEq(item.lifecycleHistory[0].to, "入库");
});

test("executeTransition - failure case", () => {
  const item = makeItem({ lifecycleState: "建档" });
  const result = executeTransition(item, "store");
  assertEq(result.success, false);
  assertEq(item.lifecycleState, "建档");
});

test("executeTransition - full lifecycle flow", () => {
  const item = makeItem({ lifecycleState: "建档", storage: "恒湿柜A" });

  let r = executeTransition(item, "store");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "入库");

  item.tests = [{ score: 90 }];
  r = executeTransition(item, "test");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "已试磨");

  r = executeTransition(item, "archive");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "归档");

  assertEq(item.lifecycleHistory.length, 3);
});

test("executeTransition - retest flow", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 79 }] });

  let r = executeTransition(item, "markWatching");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "重点观察");

  r = executeTransition(item, "retest");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "复测");

  item.tests.push({ score: 88 });
  r = executeTransition(item, "passRetest");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "已试磨");
});

test("executeTransition - retest fail goes to 重点观察", () => {
  const item = makeItem({ lifecycleState: "复测", tests: [{ score: 75 }] });
  const r = executeTransition(item, "failRetest");
  assertEq(r.success, true);
  assertEq(item.lifecycleState, "重点观察");
});

test("getAvailableTransitions - 建档 with storage", () => {
  const item = makeItem({ lifecycleState: "建档", storage: "恒湿柜A" });
  const transitions = getAvailableTransitions(item);
  assertTrue(transitions.length > 0);
  const storeTransition = transitions.find(t => t.action === "store");
  assertTrue(storeTransition !== undefined);
  assertEq(storeTransition.allowed, true);
});

test("getAvailableTransitions - 建档 without storage", () => {
  const item = makeItem({ lifecycleState: "建档" });
  const transitions = getAvailableTransitions(item);
  const storeTransition = transitions.find(t => t.action === "store");
  assertTrue(storeTransition !== undefined);
  assertEq(storeTransition.allowed, false);
});

test("buildTimeline - combines logs, tests, and lifecycle history", () => {
  const item = makeItem({
    lifecycleState: "入库",
    logs: [{ at: "2026-06-01T00:00:00Z", step: "建档", note: "创建" }],
    tests: [{ at: "2026-06-02T00:00:00Z", score: 90, paper: "宣纸" }],
    lifecycleHistory: [
      { from: "建档", to: "入库", action: "store", label: "入库", at: "2026-06-01T01:00:00Z" }
    ]
  });
  const timeline = buildTimeline(item);
  assertEq(timeline.length, 3);
  assertEq(timeline[0].type, "log");
  assertEq(timeline[1].type, "lifecycle");
  assertEq(timeline[2].type, "test");
});

test("buildTimeline - sorted by time", () => {
  const item = makeItem({
    lifecycleState: "入库",
    logs: [{ at: "2026-06-03T00:00:00Z", step: "备注", note: "late" }],
    tests: [{ at: "2026-06-01T00:00:00Z", score: 90 }],
    lifecycleHistory: [
      { from: "建档", to: "入库", action: "store", label: "入库", at: "2026-06-02T00:00:00Z" }
    ]
  });
  const timeline = buildTimeline(item);
  assertEq(timeline[0].type, "test");
  assertEq(timeline[1].type, "lifecycle");
  assertEq(timeline[2].type, "log");
});

test("getAllActions returns all action types", () => {
  const actions = getAllActions();
  assertTrue(actions.length >= 6);
  const actionNames = actions.map(a => a.action);
  assertTrue(actionNames.includes("store"));
  assertTrue(actionNames.includes("test"));
  assertTrue(actionNames.includes("archive"));
  assertTrue(actionNames.includes("retest"));
  assertTrue(actionNames.includes("markWatching"));
  assertTrue(actionNames.includes("passRetest"));
});

test("归档 state has no available transitions", () => {
  const item = makeItem({ lifecycleState: "归档" });
  const transitions = getAvailableTransitions(item);
  assertEq(transitions.length, 0);
});

test("重点观察 can archive with tests", () => {
  const item = makeItem({ lifecycleState: "重点观察", tests: [{ score: 79 }] });
  const transitions = getAvailableTransitions(item);
  const archiveT = transitions.find(t => t.action === "archive");
  assertTrue(archiveT !== undefined);
  assertEq(archiveT.allowed, true);
});

test("重点观察 cannot archive without tests", () => {
  const item = makeItem({ lifecycleState: "重点观察", tests: [] });
  const transitions = getAvailableTransitions(item);
  const archiveT = transitions.find(t => t.action === "archive");
  assertTrue(archiveT !== undefined);
  assertEq(archiveT.allowed, false);
});

test("autoTransitionAfterTest - 建档 with storage returns store", () => {
  const item = makeItem({ lifecycleState: "建档", storage: "恒湿柜A" });
  assertEq(autoTransitionAfterTest(item, 90), "store");
});

test("autoTransitionAfterTest - 建档 without storage returns null", () => {
  const item = makeItem({ lifecycleState: "建档" });
  assertEq(autoTransitionAfterTest(item, 90), null);
});

test("autoTransitionAfterTest - 入库 score>=85 returns test", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 0 }] });
  assertEq(autoTransitionAfterTest(item, 90), "test");
});

test("autoTransitionAfterTest - 入库 70<=score<85 returns markWatching", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 0 }] });
  assertEq(autoTransitionAfterTest(item, 79), "markWatching");
});

test("autoTransitionAfterTest - 入库 score<70 returns retest", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 0 }] });
  assertEq(autoTransitionAfterTest(item, 60), "retest");
});

test("autoTransitionAfterTest - 复测 score>=85 returns passRetest", () => {
  const item = makeItem({ lifecycleState: "复测", tests: [{ score: 60 }] });
  assertEq(autoTransitionAfterTest(item, 90), "passRetest");
});

test("autoTransitionAfterTest - 复测 score<85 returns failRetest", () => {
  const item = makeItem({ lifecycleState: "复测", tests: [{ score: 60 }] });
  assertEq(autoTransitionAfterTest(item, 70), "failRetest");
});

test("autoTransitionAfterTest - 已试磨 70<=score<85 returns markWatching", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  assertEq(autoTransitionAfterTest(item, 79), "markWatching");
});

test("autoTransitionAfterTest - 已试磨 score<70 returns retest", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  assertEq(autoTransitionAfterTest(item, 60), "retest");
});

test("autoTransitionAfterTest - 已试磨 score>=85 returns null", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  assertEq(autoTransitionAfterTest(item, 95), null);
});

test("autoTransitionAfterTest - 归档 returns null", () => {
  const item = makeItem({ lifecycleState: "归档", tests: [{ score: 90 }] });
  assertEq(autoTransitionAfterTest(item, 90), null);
});

test("canTransition - STORED->RETEST requires test record", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A" });
  const result = canTransition(item, "retest");
  assertEq(result.allowed, false);
  assertTrue(result.reason.includes("试磨记录"));
});

test("canTransition - STORED->RETEST with test record", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 60 }] });
  const result = canTransition(item, "retest");
  assertEq(result.allowed, true);
});

test("canTransition - TESTED->RETEST always allowed", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  const result = canTransition(item, "retest");
  assertEq(result.allowed, true);
});

test("executeTransition - STORED->RETEST path", () => {
  const item = makeItem({ lifecycleState: "入库", storage: "恒湿柜A", tests: [{ score: 60 }] });
  const r = executeTransition(item, "retest");
  assertEq(r.success, true);
  assertEq(r.newState, "复测");
  assertEq(item.lifecycleState, "复测");
});

test("executeTransition - TESTED->RETEST path", () => {
  const item = makeItem({ lifecycleState: "已试磨", tests: [{ score: 90 }] });
  const r = executeTransition(item, "retest");
  assertEq(r.success, true);
  assertEq(r.newState, "复测");
  assertEq(item.lifecycleState, "复测");
});

console.log("\n生命周期状态机测试结果：" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
