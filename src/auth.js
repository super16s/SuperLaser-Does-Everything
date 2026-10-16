// Single-password login with a signed session cookie. No dependencies.
// APP_PASSWORD gates the whole app. If it is unset, the image endpoint
// fails closed (GPU time is the one costly thing here), and everything
// else behaves as before.

import crypto from "node:crypto";

const COOKIE = "session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Resolved lazily: server.js loads .env after its imports are evaluated.
let secret;
function getSecret() {
  secret ??= process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  return secret;
}
const fails = new Map(); // ip -> { count, until }

export function authEnabled() {
  return Boolean(process.env.APP_PASSWORD);
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function isLoggedIn(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || !safeEqual(sig, sign(expires))) return false;
  return Number(expires) > Date.now();
}

function cookieHeader(value, maxAgeSec, req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

export function loginPage(error = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Log in</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f6f6f7;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#121212;color:#eee}input{background:#1e1e1f;color:#eee;border-color:#3a3a3a}}
form{display:flex;flex-direction:column;gap:10px;width:min(320px,90vw)}
input{padding:10px 12px;border:1px solid #ccc;border-radius:8px;font-size:1rem}
button{padding:10px;border:0;border-radius:8px;background:#2f6fed;color:#fff;font-size:1rem}
.err{color:#d0453d;font-size:.85rem;min-height:1em}
</style></head><body>
<form method="POST" action="/login"><h1 style="font-size:1.25rem;margin:0">SuperLaser Social App</h1>
<input type="password" name="password" placeholder="Password" autofocus required />
<button type="submit">Log in</button><div class="err">${error}</div></form></body></html>`;
}

// Returns { status, headers?, body } for POST /login.
export async function handleLogin(req, readBody) {
  const ip = req.socket.remoteAddress || "unknown";
  const rec = fails.get(ip);
  if (rec && rec.until > Date.now()) {
    return { status: 429, body: loginPage("Too many attempts. Try again later.") };
  }

  const raw = await readBody(req);
  const password = new URLSearchParams(raw).get("password") || "";

  if (!authEnabled() || !safeEqual(password, process.env.APP_PASSWORD)) {
    const count = (rec?.count || 0) + 1;
    fails.set(ip, { count, until: count >= MAX_FAILS ? Date.now() + LOCKOUT_MS : 0 });
    return { status: 401, body: loginPage("Wrong password.") };
  }

  fails.delete(ip);
  const expires = String(Date.now() + SESSION_MS);
  return {
    status: 302,
    headers: { Location: "/", "Set-Cookie": cookieHeader(`${expires}.${sign(expires)}`, SESSION_MS / 1000, req) },
    body: "",
  };
}

export function logoutHeaders(req) {
  return { Location: "/login", "Set-Cookie": cookieHeader("", 0, req) };
}
