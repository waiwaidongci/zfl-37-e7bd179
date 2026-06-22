import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { page, comparePage, importPage } from "./renderer.js";
import {
  getItems, createItem, patchItem, addLog, addAction, deleteItem,
  getBatches, createBatch, getBatch, createBatchTasks, getStats, send,
  getTemplates, createTemplate, updateTemplate, deleteTemplate, setDefaultTemplate,
  getStorageKanban, getItemsByStorage,
  getTasks, createTask, updateTask, deleteTask, completeTask, getTodayTasks, getItemTasks,
  getComparisonReport, getItemVersions, getVersionDetail, createRevision, restoreItemVersion, compareTwoVersions,
  previewCSVImport, confirmCSVImport, getImportBatches, getImportBatch,
  getScoringRules, createScoringRule, updateScoringRule, deleteScoringRule, reorderScoringRules, previewRuleMatch,
  getItemLifecycle, transitionLifecycle, getLifecycleStates,
  getViews, createView, updateView, deleteView,
  streamEvents
} from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3037);

function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

async function serveStatic(req, res, pathname) {
  if (!pathname.startsWith("/public/")) return false;
  try {
    const filePath = join(__dirname, pathname);
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  req.on("error", (err) => {
    if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED") {
      console.error("Request error:", err.message);
    }
  });
  res.on("error", (err) => {
    if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED") {
      console.error("Response error:", err.message);
    }
  });
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && await serveStatic(req, res, url.pathname)) return;
    if (req.method === "GET" && url.pathname === "/") return html(res, page());
    if (req.method === "GET" && url.pathname === "/compare") return html(res, comparePage());
    if (req.method === "GET" && url.pathname === "/import") return html(res, importPage());

    if (req.method === "GET" && url.pathname === "/api/items") return getItems(req, res);
    if (req.method === "GET" && url.pathname === "/api/comparison") return getComparisonReport(req, res);
    if (req.method === "POST" && url.pathname === "/api/items") return createItem(req, res);
    if (req.method === "GET" && url.pathname === "/api/stats") return getStats(req, res);

    const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (patch && req.method === "PATCH") return patchItem(req, res, patch[1]);

    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") return addLog(req, res, log[1]);

    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") return addAction(req, res, action[1]);

    if (req.method === "GET" && url.pathname === "/api/batches") return getBatches(req, res);
    if (req.method === "POST" && url.pathname === "/api/batches") return createBatch(req, res);

    const batchDetail = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
    if (batchDetail && req.method === "GET") return getBatch(req, res, batchDetail[1]);

    const batchTasks = url.pathname.match(/^\/api\/batches\/([^/]+)\/tasks$/);
    if (batchTasks && req.method === "POST") return createBatchTasks(req, res, batchTasks[1]);

    if (req.method === "GET" && url.pathname === "/api/templates") return getTemplates(req, res);
    if (req.method === "POST" && url.pathname === "/api/templates") return createTemplate(req, res);

    const templateId = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (templateId && req.method === "PATCH") return updateTemplate(req, res, templateId[1]);
    if (templateId && req.method === "DELETE") return deleteTemplate(req, res, templateId[1]);

    const setDefault = url.pathname.match(/^\/api\/templates\/([^/]+)\/default$/);
    if (setDefault && req.method === "POST") return setDefaultTemplate(req, res, setDefault[1]);

    if (req.method === "GET" && url.pathname === "/api/storage") return getStorageKanban(req, res);

    const storageDetail = url.pathname.match(/^\/api\/storage\/(.+)$/);
    if (storageDetail && req.method === "GET") return getItemsByStorage(req, res, storageDetail[1]);

    if (req.method === "GET" && url.pathname === "/api/tasks") return getTasks(req, res);
    if (req.method === "POST" && url.pathname === "/api/tasks") return createTask(req, res);
    if (req.method === "GET" && url.pathname === "/api/tasks/today") return getTodayTasks(req, res);

    const taskId = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskId && req.method === "PATCH") return updateTask(req, res, taskId[1]);
    if (taskId && req.method === "DELETE") return deleteTask(req, res, taskId[1]);

    const taskComplete = url.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
    if (taskComplete && req.method === "POST") return completeTask(req, res, taskComplete[1]);

    const itemTasks = url.pathname.match(/^\/api\/items\/([^/]+)\/tasks$/);
    if (itemTasks && req.method === "GET") return getItemTasks(req, res, itemTasks[1]);

    const itemDelete = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemDelete && req.method === "DELETE") return deleteItem(req, res, itemDelete[1]);

    const versionCompare = url.pathname.match(/^\/api\/items\/([^/]+)\/versions\/compare$/);
    if (versionCompare && req.method === "GET") return compareTwoVersions(req, res, versionCompare[1]);

    const versions = url.pathname.match(/^\/api\/items\/([^/]+)\/versions$/);
    if (versions && req.method === "GET") return getItemVersions(req, res, versions[1]);
    if (versions && req.method === "POST") return createRevision(req, res, versions[1]);

    const versionRestore = url.pathname.match(/^\/api\/items\/([^/]+)\/versions\/([^/]+)\/restore$/);
    if (versionRestore && req.method === "POST") return restoreItemVersion(req, res, versionRestore[1], versionRestore[2]);

    const versionDetail = url.pathname.match(/^\/api\/items\/([^/]+)\/versions\/([^/]+)$/);
    if (versionDetail && req.method === "GET") return getVersionDetail(req, res, versionDetail[1], versionDetail[2]);

    if (req.method === "POST" && url.pathname === "/api/import/preview") return previewCSVImport(req, res);
    if (req.method === "POST" && url.pathname === "/api/import/confirm") return confirmCSVImport(req, res);
    if (req.method === "GET" && url.pathname === "/api/import/batches") return getImportBatches(req, res);

    const importBatchDetail = url.pathname.match(/^\/api\/import\/batches\/([^/]+)$/);
    if (importBatchDetail && req.method === "GET") return getImportBatch(req, res, importBatchDetail[1]);

    if (req.method === "GET" && url.pathname === "/api/scoring-rules") return getScoringRules(req, res);
    if (req.method === "POST" && url.pathname === "/api/scoring-rules") return createScoringRule(req, res);
    if (req.method === "POST" && url.pathname === "/api/scoring-rules/reorder") return reorderScoringRules(req, res);
    if (req.method === "GET" && url.pathname === "/api/scoring-rules/preview") return previewRuleMatch(req, res);

    const scoringRuleId = url.pathname.match(/^\/api\/scoring-rules\/([^/]+)$/);
    if (scoringRuleId && req.method === "PATCH") return updateScoringRule(req, res, scoringRuleId[1]);
    if (scoringRuleId && req.method === "DELETE") return deleteScoringRule(req, res, scoringRuleId[1]);

    if (req.method === "GET" && url.pathname === "/api/events/stream") return streamEvents(req, res);

    if (req.method === "GET" && url.pathname === "/api/lifecycle/states") return getLifecycleStates(req, res);

    const lifecycleItem = url.pathname.match(/^\/api\/items\/([^/]+)\/lifecycle$/);
    if (lifecycleItem && req.method === "GET") return getItemLifecycle(req, res, lifecycleItem[1]);
    if (lifecycleItem && req.method === "POST") return transitionLifecycle(req, res, lifecycleItem[1]);

    if (req.method === "GET" && url.pathname === "/api/views") return getViews(req, res);
    if (req.method === "POST" && url.pathname === "/api/views") return createView(req, res);

    const viewId = url.pathname.match(/^\/api\/views\/([^/]+)$/);
    if (viewId && req.method === "PATCH") return updateView(req, res, viewId[1]);
    if (viewId && req.method === "DELETE") return deleteView(req, res, viewId[1]);

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.on("connection", (socket) => {
  socket.on("error", (err) => {
    if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED") {
      console.error("Socket error:", err.message);
    }
  });
});

server.on("error", (err) => {
  if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED") {
    console.error("Server error:", err.message);
  }
});

server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
