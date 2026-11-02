import { clearSessionCookie, json, sameOrigin } from "../../_shared/auth.js";

export async function onRequest({ request }) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "Cross-origin request blocked." }, 403);
  return json({ success: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
