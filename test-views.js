import { loadDb, saveDb, newViewId, ensureDefaultViews } from "./db.js";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDbPath = join(__dirname, "data", "ink-stick-testing-test-views.json");
const BASE = "http://localhost:3039";

let passed = 0;
let failed = 0;

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || "") + " expected " + e + " got " + a);
}
function assertTrue(val, msg) { if (!val) throw new Error(msg || "expected truthy"); }
function assertFalse(val, msg) { if (val) throw new Error(msg || "expected falsy"); }

async function api(path, options = {}) {
  const url = BASE + path;
  const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error("API " + path + " returned " + res.status + ": " + JSON.stringify(data));
  return data;
}

function log(name, ok) {
  if (ok) { passed++; console.log("✓ " + name); }
  else { failed++; console.error("✗ " + name); }
}

async function assertTest(name, fn) {
  try { await fn(); log(name, true); }
  catch (e) { log(name, false); console.error("  " + (e.message || e)); }
}

async function startServer() {
  const server = spawn("node", ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: "3039", DB_PATH: testDbPath },
    stdio: ["pipe", "pipe", "pipe"]
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 8000);
    server.stdout.on("data", (data) => {
      if (data.toString().includes("listening")) { clearTimeout(timeout); resolve(); }
    });
    server.stderr.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("EADDRINUSE")) { clearTimeout(timeout); reject(new Error("Port 3039 in use")); }
    });
  });
  return server;
}

async function setupTestDb() {
  if (existsSync(testDbPath)) await unlink(testDbPath);
  const seed = {
    batches: [
      { id: "BAT-E2E-01", code: "B001", smokeSource: "黄山松烟", receiveDate: "2026-06-01", note: "e2e测试批次1" },
      { id: "BAT-E2E-02", code: "B002", smokeSource: "桐油烟", receiveDate: "2026-06-02", note: "e2e测试批次2" }
    ],
    importBatches: [],
    items: [
      { id: "IS-E2E-001", code: "IS-E2E-001", batchId: "BAT-E2E-01", smokeSource: "黄山松烟", glueRatio: "7.5%", ageYears: 8, storage: "恒湿柜A", status: "已试磨", lifecycleState: "已试磨", lifecycleHistory: [], logs: [], tests: [] },
      { id: "IS-E2E-002", code: "IS-E2E-002", batchId: "BAT-E2E-01", smokeSource: "黄山松烟", glueRatio: "8%", ageYears: 3, storage: "试样盒C", status: "待试磨", lifecycleState: "入库", lifecycleHistory: [], logs: [], tests: [] },
      { id: "IS-E2E-003", code: "IS-E2E-003", batchId: "BAT-E2E-02", smokeSource: "桐油烟", glueRatio: "7%", ageYears: 5, storage: "恒湿柜B", status: "重点观察", lifecycleState: "重点观察", lifecycleHistory: [], logs: [], tests: [] }
    ],
    templates: [],
    scoringRules: [
      { id: "SCR-DEFAULT-HIGH", name: "优秀", minScore: 85, maxScore: 100, resultStatus: "已试磨", hintText: "优秀", order: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" }
    ],
    views: undefined
  };
  await writeFile(testDbPath, JSON.stringify(seed, null, 2));
}

async function runUnitTests() {
  console.log("\n--- 单元测试 ---\n");

  await assertTest("newViewId: VIEW- 前缀且唯一", async () => {
    const id1 = newViewId();
    const id2 = newViewId();
    assertTrue(id1.startsWith("VIEW-"));
    assertTrue(id1 !== id2);
  });

  await assertTest("ensureDefaultViews: 创建3个默认视图", async () => {
    const db = { items: [] };
    const changed = ensureDefaultViews(db);
    assertTrue(changed);
    assertEq(db.views.length, 3);
    assertEq(db.views[0].id, "VIEW-DEFAULT-ALL");
    assertTrue(db.views[0].isSystem);
    assertEq(db.views[0].filters, { status: "", batchId: "", keyword: "" });
  });

  await assertTest("ensureDefaultViews: 保留已有自定义视图", async () => {
    const db = { items: [], views: [{ id: "VIEW-CUSTOM-01", name: "自定义", filters: { status: "待试磨", batchId: "BAT-E2E-01", keyword: "" }, order: 10, isSystem: false }] };
    const changed = ensureDefaultViews(db);
    assertTrue(changed);
    assertEq(db.views.length, 4);
    assertTrue(db.views.find(v => v.id === "VIEW-CUSTOM-01"));
  });

  await assertTest("ensureDefaultViews: 补全缺失字段", async () => {
    const db = { items: [], views: [{ id: "VIEW-INCOMPLETE", name: "不完整" }] };
    ensureDefaultViews(db);
    const view = db.views.find(v => v.id === "VIEW-INCOMPLETE");
    assertEq(view.filters, { status: "", batchId: "", keyword: "" });
    assertFalse(view.isSystem);
  });

  await assertTest("ensureDefaultViews: 不重复添加已存在默认视图", async () => {
    const db = { items: [], views: [{ id: "VIEW-DEFAULT-ALL", name: "已修改名", filters: { status: "", batchId: "", keyword: "" }, order: 0, isSystem: true }] };
    ensureDefaultViews(db);
    const allViews = db.views.filter(v => v.id === "VIEW-DEFAULT-ALL");
    assertEq(allViews.length, 1);
    assertEq(allViews[0].name, "已修改名");
  });
}

async function runE2ETests() {
  console.log("\n--- 端到端 API 闭环验证 ---\n");

  let server;
  await assertTest("启动测试服务器", async () => {
    await setupTestDb();
    server = await startServer();
  });

  if (failed > 0) {
    console.error("\n服务器启动失败，跳过API测试");
    return;
  }

  await assertTest("GET /api/views: 默认3个系统视图", async () => {
    const views = await api("/api/views");
    assertEq(views.length, 3);
    assertTrue(views.every(v => v.isSystem));
    assertEq(views[0].name, "全部墨锭");
    assertEq(views[1].name, "待试磨清单");
    assertEq(views[2].name, "重点观察");
  });

  await assertTest("POST /api/views: 保存带批次筛选的视图", async () => {
    const res = await api("/api/views", {
      method: "POST",
      body: JSON.stringify({ name: "待试磨+黄山松烟", filters: { status: "待试磨", batchId: "BAT-E2E-01", keyword: "松烟" }, createdBy: "e2e测试" })
    });
    assertTrue(res.ok);
    assertEq(res.data.name, "待试磨+黄山松烟");
    assertEq(res.data.filters.status, "待试磨");
    assertEq(res.data.filters.batchId, "BAT-E2E-01");
    assertEq(res.data.filters.keyword, "松烟");
    assertFalse(res.data.isSystem);
  });

  let customViewId;
  await assertTest("GET /api/views: 保存后4个视图，自定义视图含batchId", async () => {
    const views = await api("/api/views");
    assertEq(views.length, 4);
    const custom = views.find(v => !v.isSystem);
    assertTrue(custom);
    assertEq(custom.filters.batchId, "BAT-E2E-01");
    assertEq(custom.filters.status, "待试磨");
    assertEq(custom.filters.keyword, "松烟");
    customViewId = custom.id;
  });

  await assertTest("PATCH /api/views/:id: 更新视图的batchId和status", async () => {
    const views = await api("/api/views");
    const custom = views.find(v => v.id === customViewId);
    const res = await api("/api/views/" + customViewId, {
      method: "PATCH",
      body: JSON.stringify({
        filters: { status: "重点观察", batchId: "BAT-E2E-02", keyword: "桐油" },
        _baseVersion: custom._version
      })
    });
    assertTrue(res.ok);
    assertEq(res.data.filters.status, "重点观察");
    assertEq(res.data.filters.batchId, "BAT-E2E-02");
    assertEq(res.data.filters.keyword, "桐油");
  });

  await assertTest("GET /api/views: 更新后batchId已变更", async () => {
    const views = await api("/api/views");
    const custom = views.find(v => v.id === customViewId);
    assertEq(custom.filters.batchId, "BAT-E2E-02");
    assertEq(custom.filters.status, "重点观察");
  });

  await assertTest("DELETE /api/views/:id: 删除自定义视图", async () => {
    const views = await api("/api/views");
    const custom = views.find(v => v.id === customViewId);
    const res = await api("/api/views/" + customViewId, {
      method: "DELETE",
      body: JSON.stringify({ _version: custom._version })
    });
    assertTrue(res.ok);
  });

  await assertTest("GET /api/views: 删除后只剩3个系统视图", async () => {
    const views = await api("/api/views");
    assertEq(views.length, 3);
    assertTrue(views.every(v => v.isSystem));
  });

  await assertTest("DELETE /api/views/:id: 系统视图禁止删除", async () => {
    try {
      await api("/api/views/VIEW-DEFAULT-ALL", { method: "DELETE", body: JSON.stringify({ _version: 1 }) });
      throw new Error("should have been rejected");
    } catch (e) {
      assertTrue(e.message.includes("400") || e.message.includes("view_is_system"));
    }
  });

  await assertTest("POST /api/views: 空名称拒绝创建", async () => {
    try {
      await api("/api/views", { method: "POST", body: JSON.stringify({ name: "", filters: { status: "", batchId: "", keyword: "" } }) });
      throw new Error("should have been rejected");
    } catch (e) {
      assertTrue(e.message.includes("400") || e.message.includes("name_required"));
    }
  });

  await assertTest("完整闭环: 创建→读取→切换验证→更新→删除", async () => {
    const res1 = await api("/api/views", {
      method: "POST",
      body: JSON.stringify({ name: "闭环视图", filters: { status: "已试磨", batchId: "BAT-E2E-01", keyword: "e2e" }, createdBy: "闭环测试" })
    });
    assertTrue(res1.ok);
    const viewId = res1.data.id;
    assertEq(res1.data.filters.batchId, "BAT-E2E-01");
    assertEq(res1.data.filters.status, "已试磨");
    assertEq(res1.data.filters.keyword, "e2e");

    const views2 = await api("/api/views");
    const found = views2.find(v => v.id === viewId);
    assertTrue(found);
    assertEq(found.filters.batchId, "BAT-E2E-01");

    const res3 = await api("/api/views/" + viewId, {
      method: "PATCH",
      body: JSON.stringify({ filters: { status: "待试磨", batchId: "BAT-E2E-02", keyword: "更新后" }, _baseVersion: found._version })
    });
    assertTrue(res3.ok);
    assertEq(res3.data.filters.batchId, "BAT-E2E-02");
    assertEq(res3.data.filters.status, "待试磨");

    const views4 = await api("/api/views");
    const found4 = views4.find(v => v.id === viewId);
    assertEq(found4.filters.batchId, "BAT-E2E-02");
    assertEq(found4.filters.keyword, "更新后");

    const res5 = await api("/api/views/" + viewId, {
      method: "DELETE",
      body: JSON.stringify({ _version: found4._version })
    });
    assertTrue(res5.ok);

    const views6 = await api("/api/views");
    assertFalse(views6.some(v => v.id === viewId));
  });

  if (server) {
    server.kill();
  }
  if (existsSync(testDbPath)) {
    await unlink(testDbPath);
  }
}

async function runAll() {
  console.log("\n====== 常用视图功能测试 ======");

  await runUnitTests();
  await runE2ETests();

  console.log("\n====== 测试结果 ======");
  console.log("通过: " + passed + " / " + (passed + failed));
  console.log("失败: " + failed);
  if (failed > 0) process.exit(1);
}

runAll();
