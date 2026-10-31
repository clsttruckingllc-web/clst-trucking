import {adminCookie, createAdminSession, ipRateKey, json, migrateBootstrapPassword, verifyAdminPassword} from "../../_shared/admin-auth.js";

export async function onRequestPost({request, env}) {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Invalid request origin."},403);
  if (!env.CLST_GPS_LOGIN_LIMITS || !env.CLST_ADMIN_USERNAME || !env.CLST_ADMIN_PASSWORD) return json({error:"Admin login is not configured in Cloudflare Pages."},503);
  const key = await ipRateKey(request);
  const attempts = Number.parseInt(await env.CLST_GPS_LOGIN_LIMITS.get(key) || "0",10) || 0;
  if (attempts >= 5) return json({error:"Премногу обиди. Обиди се повторно за 15 минути."},429,{"Retry-After":"900"});
  let body;
  try {
    if (Number(request.headers.get("Content-Length") || "0") > 4096) return json({error:"Request too large."},413);
    body = await request.json();
  } catch { return json({error:"Невалидно барање."},400); }
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (username !== env.CLST_ADMIN_USERNAME || !password || password.length > 1024 || !(await verifyAdminPassword(password,env))) {
    await env.CLST_GPS_LOGIN_LIMITS.put(key,String(attempts+1),{expirationTtl:900});
    return json({error:"Погрешно корисничко име или лозинка."},401);
  }
  await env.CLST_GPS_LOGIN_LIMITS.delete(key);
  await migrateBootstrapPassword(env);
  const token = await createAdminSession(env);
  return json({success:true},200,{"Set-Cookie":adminCookie(token)});
}
