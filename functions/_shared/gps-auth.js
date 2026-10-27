const COOKIE = "clst_gps_session";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

export async function createGpsSession(env) {
  if (!env.CLST_GPS_SESSION_SECRET || !env.CLST_GPS_LOGIN_PASSWORD) {
    throw new Error("CLST GPS login secrets are not configured.");
  }

  const payload = toBase64Url(encoder.encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  })));

  const key = await importKey(env.CLST_GPS_SESSION_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGpsSession(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)clst_gps_session=([^;]+)/);
  if (!match || !env.CLST_GPS_SESSION_SECRET) return false;

  try {
    const parts = match[1].split(".");
    if (parts.length !== 2) return false;

    const key = await importKey(env.CLST_GPS_SESSION_SECRET);
    const valid = await crypto.subtle.verify(
      "HMAC", key, fromBase64Url(parts[1]), encoder.encode(parts[0])
    );
    if (!valid) return false;

    const payload = JSON.parse(decoder.decode(fromBase64Url(parts[0])));
    return Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(token, maxAge = 28800) {
  return `${COOKIE}=${token}; Path=/api/rockeld; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/api/rockeld; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
