import { getSessionUser, json } from "./_shared/auth.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // The login page and authentication endpoints must remain reachable
  // before a session exists; all workspace pages and APIs stay protected.
  if (url.pathname === "/login.html" || url.pathname.startsWith("/api/auth/")) {
    return next();
  }

  const user = await getSessionUser(request, env);
  if (user) return next();

  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Sign in is required." }, 401);
  }

  const returnPath = url.pathname + url.search;
  return Response.redirect(
    new URL("/login.html?return=" + encodeURIComponent(returnPath), url.origin),
    302
  );
}
