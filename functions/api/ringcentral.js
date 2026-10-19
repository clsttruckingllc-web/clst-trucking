
export async function onRequest({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed. Use POST." },
      { status: 405, headers }
    );
  }

  if (!env.RINGCENTRAL_TEST_KEY ||
      request.headers.get("X-Test-Key") !== env.RINGCENTRAL_TEST_KEY) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  }

  const { RINGCENTRAL_JWT, RINGCENTRAL_CLIENT_ID,
          RINGCENTRAL_CLIENT_SECRET } = env;

  if (!RINGCENTRAL_JWT ||
      !RINGCENTRAL_CLIENT_ID ||
      !RINGCENTRAL_CLIENT_SECRET) {
    return Response.json(
      { error: "Missing RingCentral environment secrets." },
      { status: 500, headers }
    );
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
          "Authorization": `Basic ${credentials}`,
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
      return Response.json(
        {
          service: "CLST Trucking AI - RingCentral",
          status: "authentication_failed",
          ringcentral_status: tokenResponse.status,
          message: "RingCentral authentication failed. Check the configured credentials."
        },
        { status: 502, headers }
      );
    }

    const tokenData = await tokenResponse.json();

    const apiResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~",
      {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Accept": "application/json"
        }
      }
    );

    if (!apiResponse.ok) {
      return Response.json(
        {
          service: "CLST Trucking AI - RingCentral",
          status: "api_test_failed",
          ringcentral_status: apiResponse.status,
          message: "Authentication succeeded, but the API test failed."
        },
        { status: 502, headers }
      );
    }

    const account = await apiResponse.json();

    return Response.json(
      {
        service: "CLST Trucking AI - RingCentral",
        status: "connected",
        message: "RingCentral API connection successful.",
        extension_id: account.id,
        extension_name: account.name
      },
      { status: 200, headers }
    );
  } catch {
    return Response.json(
      {
        service: "CLST Trucking AI - RingCentral",
        status: "error",
        message: "Could not connect to RingCentral."
      },
      { status: 502, headers }
    );
  }
}
