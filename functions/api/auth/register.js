import {
  createSessionCookie, hashPassword, json, newPasswordSalt, sameOrigin, safeEqualText, toBase64Url
} from "../../_shared/auth.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403);
  if (!env.AUTH_DB || !env.AUTH_SESSION_SECRET) {
    return json({ error: "Account service is not configured yet. The AUTH_DB database binding and AUTH_SESSION_SECRET are required." }, 503);
  }
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const admin = await env.AUTH_DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (admin) return json({ error: "Sign-up is closed. Only the administrator can authorize future accounts." }, 403);
  const expectedSetupKey = String(env.AUTH_ADMIN_SETUP_KEY || "");
  const suppliedSetupKey = typeof body.adminSetupKey === "string" ? body.adminSetupKey : "";
  if (!expectedSetupKey) return json({ error: "The first-admin setup key has not been configured on the server." }, 503);
  if (!safeEqualText(suppliedSetupKey, expectedSetupKey)) return json({ error: "The first-admin setup key is incorrect." }, 403);
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return json({ error: "Username must be 3–32 characters and use letters, numbers, dot, underscore or hyphen." }, 400);
  }
  if (password.length < 12 || password.length > 256) {
    return json({ error: "Password must be at least 12 characters." }, 400);
  }

  const salt = await newPasswordSalt();
  const saltText = toBase64Url(salt);
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    // The first account is the sole administrator. The database unique index
    // prevents two concurrent first sign-ups from creating two admins.
    await env.AUTH_DB.prepare(
      "INSERT INTO users (id, username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)"
    ).bind(id, username, saltText, passwordHash, createdAt).run();
  } catch {
    return json({ error: "The first account was already claimed, or this username is unavailable." }, 409);
  }

  const user = await env.AUTH_DB.prepare(
    "SELECT id, username, role FROM users WHERE id = ? LIMIT 1"
  ).bind(id).first();
  if (!user) return json({ error: "Account created but could not be loaded. Please sign in." }, 500);

  return json({ success: true, user: { username: user.username, role: user.role } }, 201, {
    "Set-Cookie": await createSessionCookie(user, env.AUTH_SESSION_SECRET)
  });
}
