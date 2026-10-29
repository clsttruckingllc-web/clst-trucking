/**
 * Read-only readiness check for the CLST Trucking AI voice service.
 *
 * Configure these Cloudflare Pages environment variables/secrets:
 *   CLST_VOICE_SERVICE_URL   HTTPS base URL of the deployed voice service
 *   CLST_VOICE_SERVICE_TOKEN (optional) shared bearer token for its /health endpoint
 *
 * This endpoint never starts forwarding or changes RingCentral call routing.
 */
export async function onRequest({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  const reply = (data, status = 200) =>
    Response.json(data, { status, headers });

  if (request.method !== "GET") {
    return reply({ error: "Method not allowed. Use GET." }, 405);
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ error: "Forbidden: same-origin dashboard request required." }, 403);
  }

  const configuredUrl = env.CLST_VOICE_SERVICE_URL;
  if (!configuredUrl) {
    return reply({
      service: "CLST Trucking AI - Mare Voice",
      status: "voice_service_not_configured",
      ai_calling_ready: false,
      message: "The voice service URL is not configured in Cloudflare Pages.",
      next_step: "Deploy the voice service, then set CLST_VOICE_SERVICE_URL to its HTTPS base URL."
    });
  }

  let healthUrl;
  try {
    healthUrl = new URL(configuredUrl);
    if (healthUrl.protocol !== "https:") {
      return reply({
        service: "CLST Trucking AI - Mare Voice",
        status: "invalid_configuration",
        ai_calling_ready: false,
        message: "The configured voice service must use HTTPS."
      }, 500);
    }
    healthUrl.pathname = healthUrl.pathname.replace(/\/$/, "") + "/health";
    healthUrl.search = "";
    healthUrl.hash = "";
  } catch {
    return reply({
      service: "CLST Trucking AI - Mare Voice",
      status: "invalid_configuration",
      ai_calling_ready: false,
      message: "CLST_VOICE_SERVICE_URL is not a valid HTTPS URL."
    }, 500);
  }

  try {
    const healthResponse = await fetch(healthUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(env.CLST_VOICE_SERVICE_TOKEN
          ? { Authorization: `Bearer ${env.CLST_VOICE_SERVICE_TOKEN}` }
          : {})
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });

    if (!healthResponse.ok) {
      return reply({
        service: "CLST Trucking AI - Mare Voice",
        status: "voice_service_unhealthy",
        ai_calling_ready: false,
        service_http_status: healthResponse.status,
        message: "The voice service health check did not succeed."
      }, 502);
    }

    const health = await healthResponse.json().catch(() => null);
    if (!health || typeof health !== "object") {
      return reply({
        service: "CLST Trucking AI - Mare Voice",
        status: "invalid_health_response",
        ai_calling_ready: false,
        message: "The voice service did not return a JSON health response."
      }, 502);
    }

    return reply({
      service: "CLST Trucking AI - Mare Voice",
      status: "voice_service_reachable",
      ai_calling_ready: false,
      health_status: typeof health.status === "string" ? health.status : "unknown",
      message: "The voice service is reachable. This check does not verify RingCentral inbound routing or a completed live call.",
      next_step: "Verify the RingCentral webhook/call-control configuration and complete an end-to-end test call."
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - Mare Voice",
      status: "voice_service_unreachable",
      ai_calling_ready: false,
      message: "The voice service could not be reached. Check its deployment URL, health endpoint, and optional shared token."
    }, 502);
  }
}
