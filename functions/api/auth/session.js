import { createSessionCookie, getSessionUser, json, sameOrigin, verifyPassword } from "../../_shared/auth.js";

export async function onRequest({ request, env }) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  if (!env.AUTH_DB || !env.AUTH_SESSION_SECRET) {
    return json({ error: "Account service is not configured yet. The AUTH_DB database binding and AUTH_SESSION_SECRET are required." }, 503);
  }

  if (request.method === "GET") {
    const user = await getSessionUser(request, env);
    return json({ authenticated: Boolean(user), user: user ? { username: user.username, role: user.role } : null });
  }

  if (!sameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid sign-in request." }, 400); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 32 || password.length > 256) {
    return json({ error: "Enter your username and password." }, 400);
  }

  const user = await env.AUTH_DB.prepare(
    "SELECT id, username, password_salt, password_hash, role FROM users WHERE username = ? COLLATE NOCASE LIMIT 1"
  ).bind(username).first();
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    return json({ error: "Incorrect username or password." }, 401);
  }

  return json({ success: true, user: { username: user.username, role: user.role } }, 200, {
    "Set-Cookie": await createSessionCookie(user, env.AUTH_SESSION_SECRET)
  });
}
