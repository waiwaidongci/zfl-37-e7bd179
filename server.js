import http from "node:http";
import { page } from "./renderer.js";
import {
  getItems, createItem, patchItem, addLog, addAction,
  getBatches, createBatch, getBatch, getStats, send
} from "./routes.js";

const port = Number(process.env.PORT || 3037);

function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") return html(res, page());

    if (req.method === "GET" && url.pathname === "/api/items") return getItems(req, res);
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

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
