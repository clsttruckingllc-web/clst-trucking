
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
    const accessToken = tokenData.access_token;

    const apiHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    };

    const extensionResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~",
      { headers: apiHeaders }
    );

    if (!extensionResponse.ok) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "extension_lookup_failed",
        ringcentral_status: extensionResponse.status,
        message: "Could not retrieve the authorized extension."
      }, 502);
    }

    const extension = await extensionResponse.json();

    const devicesResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/device?page=1&perPage=100",
      { headers: apiHeaders }
    );

    if (!devicesResponse.ok) {
      let errorCode = null;
      let errorMessage = null;

      try {
        const errorData = await devicesResponse.json();
        errorCode = errorData.error || null;
        errorMessage = errorData.message || null;
      } catch {
        // Do not expose raw error responses.
      }

      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "connected_devices_lookup_failed",
        message: "RingCentral authentication succeeded, but the device list could not be retrieved.",
        extension_id: extension.id,
        extension_name: extension.name,
        ringcentral_status: devicesResponse.status,
        ringcentral_error: {
          code: errorCode,
          message: errorMessage
        }
      });
    }

    const deviceData = await devicesResponse.json();

    const devices = (deviceData.records || []).map(device => ({
      id: device.id ?? null,
      name: device.name ?? device.model?.name ?? "Unnamed device",
      type: device.type ?? "Unknown",
      status: device.status ?? "Unknown",
      extension_number: device.extension?.extensionNumber ?? null,
      line_type: (device.phoneLines || [])
        .map(line => line.lineType)
        .filter(Boolean)
    }));

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "connected",
      message: "RingCentral API connection successful.",
      extension_id: extension.id,
      extension_name: extension.name,
      device_count: devices.length,
      devices
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not connect to RingCentral."
    }, 502);
  }
}
