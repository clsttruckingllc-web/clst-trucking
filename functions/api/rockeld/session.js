const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};
const COOKIE = "clst_gps_session";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function getCookie(request) {
  const part = (request.headers.get("Cookie") || "").split(";")
    .map(value => value.trim()).find(value => value.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : "";
}

async function sign(payloadPart, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  return base64url(new Uint8Array(signature));
}

async function validSession(request, secret) {
  try {
    const [payloadPart, signaturePart] = getCookie(request).split(".");
    if (!payloadPart || !signaturePart) return false;
    const payloadBytes = Uint8Array.from(
      atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payloadPart.length % 4) % 4)),
      ch => ch.charCodeAt(0)
    );
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return false;
    return constantTimeEqual(signaturePart, await sign(payloadPart, secret));
  } catch {
    return false;
  }
}

export async function onRequest({ request, env }) {
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed." }, 405, { "Allow": "GET, POST, DELETE" });
  }

  const password = String(env.CLST_GPS_LOGIN_PASSWORD || "");
  const secret = String(env.CLST_GPS_SESSION_SECRET || "");
  if (!password || !secret) {
    return json({ error: "Secure GPS login is not configured. Set CLST_GPS_LOGIN_PASSWORD and CLST_GPS_SESSION_SECRET as encrypted Pages secrets." }, 503);
  }

  if (request.method === "GET") {
    const authenticated = await validSession(request, secret);
    return json({ authenticated });
  }

  if (request.method === "DELETE") {
    return json({ success: true }, 200, {
      "Set-Cookie": COOKIE + "=; HttpOnly; Secure; SameSite=Lax; Path=/api/rockeld; Max-Age=0"
    });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid login request." }, 400);
  }

  const supplied = typeof body.password === "string" ? body.password : "";
  if (!supplied || supplied.length > 512 || !constantTimeEqual(supplied, password)) {
    return json({ error: "Incorrect GPS access password." }, 401);
  }

  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  })));
  const signature = await sign(payload, secret);
  const token = payload + "." + signature;
  return json({ success: true, expiresIn: SESSION_SECONDS }, 200, {
    "Set-Cookie": COOKIE + "=" + encodeURIComponent(token) +
      "; HttpOnly; Secure; SameSite=Lax; Path=/api/rockeld; Max-Age=" + SESSION_SECONDS
  });
}
