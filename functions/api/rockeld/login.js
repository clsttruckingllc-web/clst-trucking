import { createGpsSession, sessionCookie } from "../../_shared/gps-auth.js";

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });

async function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}

async function rateLimitKey(ip) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip)
  );
  return "gps-login:" + Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) {
    return json({ error: "Invalid request origin." }, 403);
  }

  if (!env.CLST_GPS_LOGIN_LIMITS ||
      !env.CLST_GPS_LOGIN_PASSWORD ||
      !env.CLST_GPS_SESSION_SECRET) {
    return json({ error: "GPS login is not configured." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await rateLimitKey(ip);
  const stored = await env.CLST_GPS_LOGIN_LIMITS.get(key);
  const attempts = Number.parseInt(stored || "0", 10) || 0;

  if (attempts >= 5) {
    return json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      429,
      { "Retry-After": "900" }
    );
  }

  let body;
  try {
    if (Number(request.headers.get("Content-Length") || "0") > 4096) {
      return json({ error: "Request too large." }, 413);
    }
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (!body || typeof body.password !== "string" ||
      body.password.length > 1024) {
    return json({ error: "Invalid password." }, 401);
  }

  const valid = await constantTimeEqual(
    body.password,
    env.CLST_GPS_LOGIN_PASSWORD
  );

  if (!valid) {
    await env.CLST_GPS_LOGIN_LIMITS.put(
      key,
      String(attempts + 1),
      { expirationTtl: 900 }
    );
    return json({ error: "Invalid password." }, 401);
  }

  await env.CLST_GPS_LOGIN_LIMITS.delete(key);

  const token = await createGpsSession(env);
  return json(
    { success: true },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
