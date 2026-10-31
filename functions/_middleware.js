import { verifyAdminSession } from "./_shared/admin-auth.js";

const PUBLIC_PATHS = new Set(["/login.html", "/api/auth/login", "/api/auth/logout", "/favicon.ico"]);
export async function onRequest({request, env, next}) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith("/assets/login/")) return next();
  if (!env.CLST_GPS_LOGIN_LIMITS || !env.CLST_ADMIN_USERNAME || !env.CLST_ADMIN_PASSWORD) {
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({error:"CLST admin login is not configured."}), {status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    return new Response("CLST Admin login setup is incomplete. Configure CLST_ADMIN_USERNAME and CLST_ADMIN_PASSWORD in Cloudflare Pages.", {status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
  }
  if (await verifyAdminSession(request, env)) return next();
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({error:"Unauthorized"}), {status:401,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  }
  return Response.redirect(new URL("/login.html", url), 302);
}
