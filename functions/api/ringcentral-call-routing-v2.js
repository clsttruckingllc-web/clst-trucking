export async function onRequest({ request, env }) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const reply = (data, status = 200) => Response.json(data, { status, headers });

  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return reply({ error: "Same-origin request required." }, 403);

  const { RINGCENTRAL_JWT, RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET } = env;
  if (!RINGCENTRAL_JWT || !RINGCENTRAL_CLIENT_ID || !RINGCENTRAL_CLIENT_SECRET) {
    return reply({ service: "CLST Trucking AI - RingCentral", status: "configuration_error", message: "Required RingCentral secrets are missing." }, 500);
  }

  try {
    const auth = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
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
    const authData = await auth.json().catch(() => ({}));
    if (!auth.ok || !authData.access_token) {
      return reply({ service: "CLST Trucking AI - RingCentral", status: "authentication_failed", ringcentral_status: auth.status, message: "RingCentral authentication failed." }, 502);
    }

    async function get(path) {
      const response = await fetch("https://platform.ringcentral.com/restapi/v2" + path, {
        headers: { Authorization: "Bearer " + authData.access_token, Accept: "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = Array.isArray(data.errors) ? data.errors[0] : null;
        return { ok: false, status: response.status, errorCode: error?.errorCode ?? null, message: error?.message ?? "RingCentral API request failed." };
      }
      const items = Array.isArray(data) ? data : Array.isArray(data.records) ? data.records : Array.isArray(data.items) ? data.items : [];
      return {
        ok: true,
        items: items.map(item => ({
          id: item.id ?? null,
          name: item.name ?? item.displayName ?? item.label ?? item.type ?? "Unnamed",
          type: item.type ?? item.ruleType ?? item.state ?? "Unknown",
          enabled: item.enabled ?? item.active ?? null
        }))
      };
    }

    const base = "/accounts/~/extensions/~/comm-handling";
    const [states, stateRules, interactionRules] = await Promise.all([
      get(base + "/states"),
      get(base + "/voice/state-rules"),
      get(base + "/voice/interaction-rules")
    ]);

    return reply({
      service: "CLST Trucking AI - RingCentral",
      status: "call_routing_v2_read",
      read_only: true,
      message: "Read-only inspection via current RingCentral v2 call-handling APIs. No rules were changed or deleted.",
      extension_states: states,
      state_rules: stateRules,
      custom_interaction_rules: interactionRules,
      note: "Phone numbers, destinations, greetings, and credentials are deliberately omitted."
    });
  } catch {
    return reply({ service: "CLST Trucking AI - RingCentral", status: "error", message: "Could not inspect current RingCentral call-handling rules." }, 502);
  }
}