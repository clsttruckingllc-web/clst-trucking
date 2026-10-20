export async function onRequest({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  const reply = (data, status = 200) => Response.json(data, { status, headers });

  if (request.method !== "POST") {
    return reply({ error: "Method not allowed. Use POST." }, 405);
  }

  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply({ error: "Forbidden: same-origin dashboard request required." }, 403);
  }

  const { RINGCENTRAL_JWT, RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET } = env;
  if (!RINGCENTRAL_JWT || !RINGCENTRAL_CLIENT_ID || !RINGCENTRAL_CLIENT_SECRET) {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "configuration_error",
      message: "Required RingCentral secrets are missing."
    }, 500);
  }

  try {
    const tokenResponse = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(RINGCENTRAL_CLIENT_ID + ":" + RINGCENTRAL_CLIENT_SECRET),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: RINGCENTRAL_JWT
      })
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "authentication_failed",
        ringcentral_status: tokenResponse.status,
        message: "RingCentral authentication failed."
      }, 502);
    }

    const activeResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/active-calls?view=Simple",
      {
        headers: {
          Authorization: "Bearer " + tokenData.access_token,
          Accept: "application/json"
        }
      }
    );

    const activeData = await activeResponse.json().catch(() => ({}));
    if (!activeResponse.ok) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "active_calls_unavailable",
        ringcentral_status: activeResponse.status,
        message: activeResponse.status === 403
          ? "Authentication succeeded, but RingCentral denied access to active calls. Confirm Call Control is approved for this app and extension."
          : "Could not retrieve active calls from RingCentral."
      }, 502);
    }

    const calls = (activeData.records || []).map(call => ({
      id: call.id ?? null,
      direction: call.direction ?? null,
      from: call.from?.phoneNumber ?? call.from?.name ?? null,
      to: call.to?.phoneNumber ?? call.to?.name ?? null,
      result: call.result ?? null,
      startTime: call.startTime ?? null,
      duration: call.duration ?? null,
      telephonyStatus: call.telephonyStatus ?? null,
      sessionId: call.sessionId ?? null
    }));

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "active_calls_checked",
      success: true,
      read_only: true,
      count: calls.length,
      calls,
      audio_bridge_ready: false,
      note: "This endpoint reads call metadata only. It does not access or stream call audio and does not answer or control calls."
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not complete the active-call check."
    }, 502);
  }
}
