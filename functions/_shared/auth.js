const SESSION_COOKIE = "mare_session";
const SESSION_SECONDS = 8 * 60 * 60;
const PBKDF2_ITERATIONS = 310000;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function safeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] || 0) ^ (b[i] || 0);
  }
  return diff === 0;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export function safeEqualText(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

export async function hashPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: saltBytes,
    iterations: PBKDF2_ITERATIONS,
    hash: "SHA-256"
  }, key, 256);
  return toBase64Url(new Uint8Array(bits));
}

export async function newPasswordSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionCookie(user, secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  })));
  const token = payload + "." + await sign(payload, secret);
  return SESSION_COOKIE + "=" + encodeURIComponent(token) +
    "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + SESSION_SECONDS;
}

export function clearSessionCookie() {
  return SESSION_COOKIE + "=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

export async function getSessionUser(request, env) {
  if (!env.AUTH_DB || !env.AUTH_SESSION_SECRET) return null;
  try {
    const part = (request.headers.get("Cookie") || "").split(";").map(x => x.trim())
      .find(x => x.startsWith(SESSION_COOKIE + "="));
    if (!part) return null;
    const token = decodeURIComponent(part.slice(SESSION_COOKIE.length + 1));
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) return null;
    const expected = await sign(payloadPart, env.AUTH_SESSION_SECRET);
    if (!safeEqual(signaturePart, expected)) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart)));
    if (!payload.sub || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return await env.AUTH_DB.prepare(
      "SELECT id, username, role FROM users WHERE id = ? LIMIT 1"
    ).bind(payload.sub).first();
  } catch {
    return null;
  }
}

export async function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = await hashPassword(password, fromBase64Url(salt));
    return safeEqual(actual, expectedHash);
  } catch {
    return false;
  }
}

export { toBase64Url };
