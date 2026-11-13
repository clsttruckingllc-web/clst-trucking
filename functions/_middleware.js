const COOKIE = "clst_gps_session";

function fromHex(value) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error("Invalid token");
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
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
  const part = (request.headers.get("Cookie") || "").split(";").map(v => v.trim())
    .find(v => v.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : "";
}
async function sign(payloadPart, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function authenticated(request, secret) {
  try {
    const [payloadPart, signaturePart] = getCookie(request).split(".");
    if (!payloadPart || !signaturePart) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromHex(payloadPart)));
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return false;
    return constantTimeEqual(signaturePart, await sign(payloadPart, secret));
  } catch { return false; }
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;

  // The password form and the endpoint that verifies it must remain reachable.
  if (path === "/gps-login" || path === "/gps-login.html" ||
      path === "/api/rockeld/session") return next();

  const isApi = path.startsWith("/api/");
  const isPage = (request.headers.get("Accept") || "").includes("text/html") &&
    path !== "/manifest.json" && path !== "/sw.js";

  if (!isApi && !isPage) return next();

  const secret = String(env.CLST_GPS_SESSION_SECRET || "");
  const ok = !!secret && await authenticated(request, secret);
  if (ok) return next();

  if (isApi) {
    return new Response(JSON.stringify({ error: "Password sign-in required." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const returnTo = path + url.search;
  return Response.redirect(new URL("/gps-login.html?return=" + encodeURIComponent(returnTo), url.origin), 302);
}
