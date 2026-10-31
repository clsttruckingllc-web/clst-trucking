import {hashPassword, json, verifyAdminPassword} from "../../_shared/admin-auth.js";
export async function onRequestPost({request,env}) {
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) return json({error:"Invalid request origin."},403);
  let body;
  try { body = await request.json(); } catch { return json({error:"Невалидно барање."},400); }
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!(await verifyAdminPassword(currentPassword,env))) return json({error:"Тековната лозинка не е точна."},401);
  if (newPassword.length < 12 || newPassword.length > 1024) return json({error:"Новата лозинка мора да има најмалку 12 знаци."},400);
  const record = await hashPassword(newPassword);
  await env.CLST_AUTH_KV.put("admin:password",JSON.stringify(record));
  return json({success:true,message:"Лозинката е успешно променета."});
}
