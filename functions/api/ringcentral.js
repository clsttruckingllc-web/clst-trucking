
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

  // Read-only diagnostic endpoint. Accept requests only from this Pages origin.
  // RingCentral credentials stay server-side and are never returned to the browser.
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply({ error: "Forbidden: same-origin dashboard request required." }, 403);
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
      service: "CLST Trucking AI - RingCentral",
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
        message: "RingCentral authentication failed."
      }, 502);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return reply({
        status: "authentication_failed",
        message: "RingCentral did not return an access token."
      }, 502);
    }

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
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "device_lookup_failed",
        ringcentral_status: devicesResponse.status,
        message: "Authentication succeeded, but devices could not be listed.",
        extension_id: extension.id,
        extension_name: extension.name
      }, 502);
    }

    const deviceData = await devicesResponse.json();
    const records = deviceData.records || [];

    const devices = records.map(device => ({
      id: device.id ?? null,
      name: device.name ?? device.model?.name ?? "Unnamed device",
      type: device.type ?? "Unknown",
      status: device.status ?? "Unknown",
      extension_number:
        device.extension?.extensionNumber ?? null
    }));

    // Only test SIP information for an Existing Phone / OtherPhone.
    // Do not treat a physical desk phone as the AI phone.
    const sipDevice = records.find(
      device =>
        String(device.type || "").toLowerCase() === "otherphone"
    );

    if (!sipDevice) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "connected_no_sip_device",
        message:
          "RingCentral API works, but no OtherPhone device is assigned to this extension. Add or assign a compatible Existing Phone before testing SIP.",
        extension_id: extension.id,
        extension_name: extension.name,
        device_count: devices.length,
        devices,
        sip_info_checked: false,
        next_step:
          "Create or assign an Existing Phone / OtherPhone in RingCentral, then run this check again."
      });
    }

    const sipResponse = await fetch(
      "https://platform.ringcentral.com/restapi/v1.0/account/~/device/" +
        encodeURIComponent(sipDevice.id) +
        "/sip-info",
      { headers: apiHeaders }
    );

    if (!sipResponse.ok) {
      return reply({
        service: "CLST Trucking AI - RingCentral",
        status: "sip_info_unavailable",
        message:
          "The device was found, but RingCentral did not provide SIP information.",
        extension_id: extension.id,
        extension_name: extension.name,
        device_id: sipDevice.id,
        device_type: sipDevice.type,
        ringcentral_status: sipResponse.status,
        sip_info_checked: true,
        sip_credentials_exposed: false,
        next_step:
          "Check the app scope ReadAccounts and the user's ReadCompanyDevices permission."
      });
    }

    // Read the response only on the server. Never return SIP credentials.
    await sipResponse.json();

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "sip_info_available",
      message:
        "RingCentral returned SIP information for the compatible device.",
      extension_id: extension.id,
      extension_name: extension.name,
      device_id: sipDevice.id,
      device_type: sipDevice.type,
      sip_info_checked: true,
      sip_credentials_exposed: false,
      ai_calling_ready: false,
      next_step:
        "SIP information is available. A separate running voice service and an end-to-end call test are still required."
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not complete the RingCentral check."
    }, 502);
  }
}
