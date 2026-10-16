import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authEnabled, isLoggedIn, handleLogin, loginPage, logoutHeaders } from "./auth.js";
import { generateImages } from "./sources/fooocus.js";

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

async function handleImage(req, res) {
  if (!authEnabled()) {
    sendJson(res, 503, { error: "Image generation is disabled until APP_PASSWORD is set in .env." });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    sendJson(res, 400, { error: "'prompt' is required." });
    return;
  }
  const result = await generateImages(prompt, { negativePrompt: String(body.negativePrompt || ""), count: body.count });
  sendJson(res, result.error ? 502 : 200, result);
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

const PUBLIC_PATHS = new Set(["/login", "/logout", "/manifest.json", "/sw.js"]);

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) break; // a password form is tiny
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleAuthRoutes(req, res, url) {
  if (url.pathname === "/login") {
    if (req.method === "POST") {
      const r = await handleLogin(req, readRaw);
      res.writeHead(r.status, { "Content-Type": "text/html; charset=utf-8", ...r.headers });
      res.end(r.body);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(loginPage());
    }
    return;
  }
  // logout
  res.writeHead(302, logoutHeaders(req));
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (authEnabled()) {
    if (url.pathname === "/login" || url.pathname === "/logout") {
      handleAuthRoutes(req, res, url);
      return;
    }
    const isPublic = PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith("/icons/");
    if (!isPublic && !isLoggedIn(req)) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, 401, { error: "Not logged in." });
      } else {
        res.writeHead(302, { Location: "/login" });
        res.end();
      }
      return;
    }
  }

  if (url.pathname === "/api/image") {
    handleImage(req, res);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Image studio running at http://localhost:${PORT}`);
});
