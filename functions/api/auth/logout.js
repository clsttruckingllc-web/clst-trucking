import {clearAdminCookie, destroyAdminSession, json} from "../../_shared/admin-auth.js";
export async function onRequestPost({request,env}) {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Invalid request origin."},403);
  await destroyAdminSession(request,env);
  return json({success:true},200,{"Set-Cookie":clearAdminCookie()});
}
