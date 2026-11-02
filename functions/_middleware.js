import { getSessionUser, json } from "./_shared/auth.js";

export async function onRequest({ request, env, next }) {
  const user = await getSessionUser(request, env);
  if (user) return next();

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Sign in is required." }, 401);
  }

  const returnPath = url.pathname + url.search;
  return Response.redirect(new URL("/login.html?return=" + encodeURIComponent(returnPath), url.origin), 302);
}
