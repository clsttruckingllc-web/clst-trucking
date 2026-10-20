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
      // Return only safe diagnostic fields from RingCentral's error payload.
      // Never return headers, access tokens, call records, phone numbers, or IDs.
      const errors = Array.isArray(activeData.errors) ? activeData.errors : [];
      const firstError = errors[0] && typeof errors[0] === "object" ? errors[0] : {};
      const safeErrorCode = typeof firstError.errorCode === "string"
        ? firstError.errorCode.slice(0, 120)
        : (typeof activeData.errorCode === "string" ? activeData.errorCode.slice(0, 120) : null);
      const safeErrorMessage = typeof firstError.message === "string"
        ? firstError.message.slice(0, 300)
        : (typeof activeData.message === "string" ? activeData.message.slice(0, 300) : null);

      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "active_calls_unavailable",
        ringcentral_status: activeResponse.status,
        ringcentral_error_code: safeErrorCode,
        ringcentral_error_message: safeErrorMessage,
        message: activeResponse.status === 403
          ? "RingCentral authenticated successfully but denied this endpoint. Check the Read Call Log app scope, app authorization, and the JWT user's extension/role permissions. The RingCentral error fields above should identify the exact cause."
          : "Could not retrieve active calls from RingCentral."
      }, 502);
    }

    // Do not expose phone numbers, call IDs, session IDs, or call records from a public dashboard endpoint.
    // Report only whether the account endpoint is reachable and the number of active calls.
    const activeCallCount = Array.isArray(activeData.records) ? activeData.records.length : 0;

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "active_calls_checked",
      success: true,
      read_only: true,
      active_call_count: activeCallCount,
      audio_bridge_ready: false,
      note: "This is a read-only status check. It does not expose caller details, access or stream audio, answer calls, or control calls."
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not complete the active-call check."
    }, 502);
  }
}
