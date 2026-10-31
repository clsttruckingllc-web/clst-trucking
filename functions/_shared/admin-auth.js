const COOKIE = "__Host-clst_admin";
const enc = new TextEncoder();
const dec = new TextDecoder();
const SESSION_TTL = 12 * 60 * 60;
const PBKDF2_ITERATIONS = 310000;

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64(value) {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", typeof value === "string" ? enc.encode(value) : value);
  return b64(new Uint8Array(digest));
}
function randomToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
function equal(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:PBKDF2_ITERATIONS}, key, 256);
  return new Uint8Array(bits);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return {salt:b64(salt), hash:b64(hash), iterations:PBKDF2_ITERATIONS};
}
async function passwordMatches(password, record) {
  try {
    const actual = await derive(password, unb64(record.salt));
    return equal(b64(actual), record.hash);
  } catch { return false; }
}
export async function verifyAdminPassword(password, env) {
  const stored = await env.CLST_AUTH_KV.get("admin:password", "json");
  if (stored) return passwordMatches(password, stored);
  return typeof env.CLST_ADMIN_PASSWORD === "string" && equal(password, env.CLST_ADMIN_PASSWORD);
}
export async function migrateBootstrapPassword(env) {
  if (await env.CLST_AUTH_KV.get("admin:password")) return;
  if (typeof env.CLST_ADMIN_PASSWORD !== "string" || !env.CLST_ADMIN_PASSWORD) throw new Error("Initial admin password is not configured.");
  const record = await hashPassword(env.CLST_ADMIN_PASSWORD);
  await env.CLST_AUTH_KV.put("admin:password", JSON.stringify(record));
}
export async function createAdminSession(env) {
  const token = randomToken();
  const key = "session:" + await sha256(token);
  await env.CLST_AUTH_KV.put(key, JSON.stringify({user:env.CLST_ADMIN_USERNAME, createdAt:Date.now()}), {expirationTtl:SESSION_TTL});
  return token;
}
export async function verifyAdminSession(request, env) {
  if (!env.CLST_AUTH_KV) return false;
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|;\\s*)" + COOKIE.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "=([^;]+)"));
  if (!match) return false;
  try {
    const key = "session:" + await sha256(decodeURIComponent(match[1]));
    return !!(await env.CLST_AUTH_KV.get(key));
  } catch { return false; }
}
export async function destroyAdminSession(request, env) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(/(?:^|;\\s*)__Host-clst_admin=([^;]+)/);
  if (match && env.CLST_AUTH_KV) {
    try { await env.CLST_AUTH_KV.delete("session:" + await sha256(decodeURIComponent(match[1]))); } catch {}
  }
}
export function adminCookie(token) {
  return COOKIE + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + SESSION_TTL;
}
export function clearAdminCookie() {
  return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}
export function json(body, status=200, headers={}) {
  return new Response(JSON.stringify(body), {status, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
}
export async function ipRateKey(request) {
  return "login-attempt:" + await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
}
