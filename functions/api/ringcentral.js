
export async function onRequest({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  const reply = (data, status = 200) =>
    Response.json(data, { status, headers });

  if (request.method !== "POST") {
    return reply({ error: "Method not allowed. Use POST." }, 405);
  }

  if (
    !env.RINGCENTRAL_TEST_KEY ||
    request.headers.get("X-Test-Key") !== env.RINGCENTRAL_TEST_KEY
  ) {
    return reply({ error: "Unauthorized" }, 401);
  }

  const {
    RINGCENTRAL_JWT,
    RINGCENTRAL_CLIENT_ID,
    RINGCENTRAL_CLIENT_SECRET
  } = env;

  if (
    !RINGCENTRAL_JWT ||
    !RINGCENTRAL_CLIENT_ID ||
    !RINGCENTRAL_CLIENT_SECRET
  ) {
    return reply({
      status: "configuration_error",
      message: "Required RingCentral secrets are missing."
    }, 500);
  }

  try {
    const credentials = btoa(
      `${RINGCENTRAL_CLIENT_ID}:${RINGCENTRAL_CLIENT_SECRET}`
    );

    const tokenResponse = await fetch(
      "https://platform.ringcentral.com/restapi/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type:
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: RINGCENTRAL_JWT
        })
      }
    );

    if (!tokenResponse.ok) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "authentication_failed",
        ringcentral_status: tokenResponse.status,
        message: "RingCentral token request failed."
      }, 502);
    }

    const tokenData = await tokenResponse.json();

    const apiResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json"
        }
      }
    );

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      let safeError;

      try {
        const parsed = JSON.parse(errorText);
        safeError = {
          error: parsed.error || null,
          errors: Array.isArray(parsed.errors)
            ? parsed.errors.map(item => ({
                errorCode: item.errorCode || null,
                message: item.message || null
              }))
            : [],
          message: parsed.message || null
        };
      } catch {
        safeError = {
          message: "RingCentral returned a non-JSON error response."
        };
      }

      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "api_test_failed",
        ringcentral_status: apiResponse.status,
        ringcentral_error: safeError
      }, 502);
    }

    const account = await apiResponse.json();

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "connected",
      message: "RingCentral API connection successful.",
      extension_id: account.id,
      extension_name: account.name
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not connect to RingCentral."
    }, 502);
  }
}
