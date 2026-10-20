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

    const apiHeaders = {
      Authorization: "Bearer " + tokenData.access_token,
      Accept: "application/json"
    };

    async function getRules(path) {
      const response = await fetch("https://platform.ringcentral.com/restapi/v1.0" + path, {
        headers: apiHeaders
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const first = Array.isArray(data.errors) ? data.errors[0] : null;
        return {
          ok: false,
          status: response.status,
          errorCode: typeof first?.errorCode === "string" ? first.errorCode : null,
          message: typeof first?.message === "string" ? first.message : "RingCentral denied access to this rule list."
        };
      }
      return {
        ok: true,
        rules: (Array.isArray(data.records) ? data.records : []).map(rule => ({
          id: rule.id ?? null,
          name: rule.name ?? rule.type ?? "Unnamed rule",
          type: rule.type ?? "Unknown",
          enabled: rule.enabled ?? null,
          callHandlingAction: rule.callHandlingAction ?? null
        }))
      };
    }

    const [company, extension] = await Promise.all([
      getRules("/account/~/answering-rule"),
      getRules("/account/~/extension/~/answering-rule")
    ]);

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "call_routing_read",
      read_only: true,
      message: "Read-only call-routing inspection. No rules were changed or deleted.",
      company_rules: company,
      extension_rules: extension,
      next_step: "Find any rule or destination clearly associated with Jessica. This diagnostic does not expose forwarding phone numbers or greetings."
    });
  } catch {
    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "error",
      message: "Could not inspect RingCentral call-routing rules."
    }, 502);
  }
}
