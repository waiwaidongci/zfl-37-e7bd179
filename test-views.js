import { loadDb, saveDb, newViewId, ensureDefaultViews } from "./db.js";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDbPath = join(__dirname, "data", "ink-stick-testing-test-views.json");

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

function asyncTest(name, fn) {
  return fn()
    .then(() => {
      passed++;
      console.log("✓ " + name);
    })
    .catch(e => {
      failed++;
      console.error("✗ " + name);
      console.error("  " + (e.message || e));
    });
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

function assertFalse(val, msg) {
  if (val) throw new Error(msg || "expected falsy");
}

async function setupTestDb() {
  if (existsSync(testDbPath)) await unlink(testDbPath);
  const seed = {
    batches: [{ id: "BAT-TEST-01", code: "B001", smokeSource: "黄山松烟", receiveDate: "2026-06-01", note: "测试批次" }],
    importBatches: [],
    items: [
      { id: "IS-TEST-001", code: "IS-TEST-001", batchId: "BAT-TEST-01", smokeSource: "黄山松烟", glueRatio: "7.5%", ageYears: 8, storage: "恒湿柜A", status: "已试磨", lifecycleState: "已试磨", lifecycleHistory: [], logs: [], tests: [] },
      { id: "IS-TEST-002", code: "IS-TEST-002", batchId: "BAT-TEST-01", smokeSource: "黄山松烟", glueRatio: "8%", ageYears: 3, storage: "试样盒C", status: "待试磨", lifecycleState: "入库", lifecycleHistory: [], logs: [], tests: [] },
      { id: "IS-TEST-003", code: "IS-TEST-003", batchId: "BAT-TEST-01", smokeSource: "桐油烟", glueRatio: "7%", ageYears: 5, storage: "恒湿柜B", status: "重点观察", lifecycleState: "重点观察", lifecycleHistory: [], logs: [], tests: [] }
    ],
    templates: [],
    scoringRules: [
      { id: "SCR-DEFAULT-HIGH", name: "优秀", minScore: 85, maxScore: 100, resultStatus: "已试磨", hintText: "优秀", order: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" }
    ],
    views: undefined
  };
  await writeFile(testDbPath, JSON.stringify(seed, null, 2));
}

async function runTests() {
  console.log("\n=== 常用视图功能测试 ===\n");

  await asyncTest("newViewId generates correct format", async () => {
    const id = newViewId();
    assertTrue(id.startsWith("VIEW-"), "ID should start with VIEW-");
    const id2 = newViewId();
    assertTrue(id !== id2, "IDs should be unique");
  });

  await asyncTest("ensureDefaultViews creates default views when views missing", async () => {
    const db = { items: [] };
    const changed = ensureDefaultViews(db);
    assertTrue(changed, "should report changed");
    assertTrue(Array.isArray(db.views), "views should be array");
    assertEq(db.views.length, 3, "should have 3 default views");
    assertEq(db.views[0].id, "VIEW-DEFAULT-ALL");
    assertEq(db.views[0].name, "全部墨锭");
    assertEq(db.views[0].filters, { status: "", batchId: "", keyword: "" });
    assertTrue(db.views[0].isSystem, "default view should be system view");
  });

  await asyncTest("ensureDefaultViews preserves existing views", async () => {
    const db = {
      items: [],
      views: [
        { id: "VIEW-CUSTOM-01", name: "自定义视图", filters: { status: "待试磨", batchId: "", keyword: "" }, order: 10, isSystem: false }
      ]
    };
    const changed = ensureDefaultViews(db);
    assertTrue(changed, "should report changed for adding missing defaults");
    assertEq(db.views.length, 4, "should have 4 views (1 custom + 3 defaults)");
    assertTrue(db.views.find(v => v.id === "VIEW-CUSTOM-01"), "custom view should be preserved");
    assertTrue(db.views.find(v => v.id === "VIEW-DEFAULT-ALL"), "default view should be added");
  });

  await asyncTest("ensureDefaultViews fills in missing fields", async () => {
    const db = {
      items: [],
      views: [
        { id: "VIEW-INCOMPLETE", name: "不完整视图" }
      ]
    };
    const changed = ensureDefaultViews(db);
    assertTrue(changed, "should report changed");
    const view = db.views.find(v => v.id === "VIEW-INCOMPLETE");
    assertEq(view.filters, { status: "", batchId: "", keyword: "" }, "should have default filters");
    assertEq(view.isSystem, false, "should default to not system");
    assertTrue(typeof view.order === "number", "should have order");
  });

  await asyncTest("ensureDefaultViews does not re-add existing defaults", async () => {
    const db = {
      items: [],
      views: [
        { id: "VIEW-DEFAULT-ALL", name: "全部墨锭（已修改）", filters: { status: "", batchId: "", keyword: "" }, order: 0, isSystem: true }
      ]
    };
    ensureDefaultViews(db);
    const allViews = db.views.filter(v => v.id === "VIEW-DEFAULT-ALL");
    assertEq(allViews.length, 1, "should not duplicate default view");
    assertEq(allViews[0].name, "全部墨锭（已修改）", "should preserve modified name");
  });

  await asyncTest("loadDb initializes views correctly", async () => {
    await setupTestDb();
    const fs = await import("node:fs/promises");
    const db = JSON.parse(await fs.readFile(testDbPath, "utf8"));
    assertFalse(!!db.views, "test db should start without views");

    const changed = ensureDefaultViews(db);
    assertTrue(changed, "ensureDefaultViews should report changed");
    assertEq(db.views.length, 3, "should have 3 default views after init");

    assertTrue(db.views[0].id.startsWith("VIEW-DEFAULT-"), "first default view ID");
    assertTrue(db.views[0].filters !== undefined, "should have filters object");
    assertTrue(typeof db.views[0].order === "number", "should have order number");
  });

  await asyncTest("view filters object structure is valid", async () => {
    const db = { items: [] };
    ensureDefaultViews(db);
    for (const view of db.views) {
      assertTrue(typeof view.filters === "object", "filters should be object");
      assertTrue("status" in view.filters, "should have status field");
      assertTrue("batchId" in view.filters, "should have batchId field");
      assertTrue("keyword" in view.filters, "should have keyword field");
    }
  });

  await asyncTest("custom view can be created and has right structure", async () => {
    const id = newViewId();
    const customView = {
      id,
      name: "待试磨·黄山松烟批次",
      filters: {
        status: "待试磨",
        batchId: "BAT-TEST-01",
        keyword: "松烟"
      },
      order: 5,
      isSystem: false
    };
    assertTrue(customView.id.startsWith("VIEW-"), "custom view id format");
    assertEq(customView.filters.status, "待试磨");
    assertEq(customView.filters.batchId, "BAT-TEST-01");
    assertEq(customView.filters.keyword, "松烟");
    assertFalse(customView.isSystem, "custom view is not system");
  });

  await asyncTest("default views order is correct", async () => {
    const db = { items: [] };
    ensureDefaultViews(db);
    const sorted = [...db.views].sort((a, b) => a.order - b.order);
    assertEq(sorted[0].name, "全部墨锭", "first order should be 全部墨锭");
    assertEq(sorted[1].name, "待试磨清单", "second order should be 待试磨清单");
    assertEq(sorted[2].name, "重点观察", "third order should be 重点观察");
  });

  await asyncTest("custom view deletion check works (system vs non-system)", async () => {
    const db = { items: [] };
    ensureDefaultViews(db);
    const customView = {
      id: newViewId(),
      name: "可删除视图",
      filters: { status: "", batchId: "", keyword: "" },
      order: 99,
      isSystem: false
    };
    db.views.push(customView);
    const allView = db.views.find(v => v.id === "VIEW-DEFAULT-ALL");
    assertTrue(allView.isSystem, "all view is system, cannot be deleted");
    assertFalse(customView.isSystem, "custom view is not system, can be deleted");
  });

  if (existsSync(testDbPath)) {
    await unlink(testDbPath);
  }

  console.log("\n常用视图测试结果：" + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
}

runTests();
