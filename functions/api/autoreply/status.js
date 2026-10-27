export async function onRequest({ request, env }) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "https://clst-trucking.pages.dev",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  if (!env.API_KEY) return Response.json({ error: "API_KEY is not configured in Pages." }, { status: 500, headers });
  try {
    const upstream = await fetch("https://clst-gmail-backend.clsttruckingllc.workers.dev/api/autoreply/status", {
      headers: { Authorization: `Bearer ${env.API_KEY}`, Accept: "application/json" },
      cache: "no-store"
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return Response.json({ error: data.error || "Gmail backend status request failed", upstreamStatus: upstream.status }, { status: upstream.status, headers });
    const run = data.lastRun || null;
    return Response.json({
      success: data.success === true,
      configured: data.configured === true,
      gmailConnected: data.gmailConnected === true,
      aiProvider: data.aiProvider || "unknown",
      model: data.model || "unknown",
      gmailScopes: data.gmailScopes ? {
        verified: data.gmailScopes.verified === true,
        readonly: data.gmailScopes.readonly === true,
        send: data.gmailScopes.send === true,
        compose: data.gmailScopes.compose === true,
        error: data.gmailScopes.error || null
      } : null,
      lastRun: run ? {
        success: run.success === true,
        startedAt: run.startedAt || null,
        finishedAt: run.finishedAt || null,
        checked: Number(run.checked || 0),
        eligible: Number(run.eligible || 0),
        note: run.note || null,
        error: run.error || null,
        results: Array.isArray(run.results) ? run.results.slice(0, 30).map(x => ({
          status: x.status || "unknown",
          reason: x.reason || null,
          error: x.error || null
        })) : []
      } : null,
      reconnectUrl: data.reconnectUrl || null
    }, { headers });
  } catch (error) {
    return Response.json({ error: "Could not reach Gmail backend.", details: String(error && error.message || error).slice(0, 250) }, { status: 502, headers });
  }
}