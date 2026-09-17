import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, ALL_SOURCES } from "./aggregate.js";
import { discoverSubstack } from "./sources/substackDiscover.js";
import { listCategories as listSubstackCategories } from "./sources/substack.js";
import { listCategories as listRedditCategories } from "./sources/reddit.js";
import { listFollowing, followPublication, unfollowPublication } from "./substackStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT) || 3000;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function handleFeed(req, res, url) {
  const topic = (url.searchParams.get("topic") || "").trim();
  const sourcesParam = url.searchParams.get("sources");
  const sources = sourcesParam ? sourcesParam.split(",").map((s) => s.trim()) : ALL_SOURCES;
  const category = (url.searchParams.get("category") || "").trim() || null;

  if (!topic) {
    sendJson(res, 400, { error: "Query parameter 'topic' is required." });
    return;
  }

  try {
    const result = await aggregate(topic, sources, { category });
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleDiscover(req, res, url) {
  const topic = (url.searchParams.get("topic") || "").trim();
  if (!topic) {
    sendJson(res, 400, { error: "Query parameter 'topic' is required." });
    return;
  }
  const result = await discoverSubstack(topic);
  sendJson(res, 200, result);
}

async function handleFollowing(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, { publications: listFollowing() });
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const list = await followPublication(body);
      sendJson(res, 200, { publications: list });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const body = await readJsonBody(req);
      if (!body.feedUrl) throw new Error("feedUrl is required");
      const list = unfollowPublication(body.feedUrl);
      sendJson(res, 200, { publications: list });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function handleCategories(req, res) {
  const categories = [...new Set([...listSubstackCategories(), ...listRedditCategories()])].sort();
  sendJson(res, 200, { categories });
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = relativePath === "manifest.json" ? "application/manifest+json" : CONTENT_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/feed") {
    handleFeed(req, res, url);
    return;
  }

  if (url.pathname === "/api/substack/discover") {
    handleDiscover(req, res, url);
    return;
  }

  if (url.pathname === "/api/substack/following") {
    handleFollowing(req, res);
    return;
  }

  if (url.pathname === "/api/categories") {
    handleCategories(req, res);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Content aggregator running at http://localhost:${PORT}`);
});
