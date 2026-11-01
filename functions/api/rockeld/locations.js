const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    difference |= (left[i % (left.length || 1)] || 0) ^ (right[i % (right.length || 1)] || 0);
  }
  return difference === 0;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Allow": "GET, OPTIONS",
        "Cache-Control": "no-store"
      }
    });
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Require a short-lived, signed HttpOnly session created by /api/rockeld/session.
  const cookieHeader = request.headers.get("Cookie") || "";
  const sessionCookie = cookieHeader.split(";").map(part => part.trim())
    .find(part => part.startsWith("clst_gps_session="));
  const token = sessionCookie ? decodeURIComponent(sessionCookie.slice("clst_gps_session=".length)) : "";
  const sessionSecret = String(env.CLST_GPS_SESSION_SECRET || "");
  if (!sessionSecret) return json({ error: "Secure GPS session is not configured on the server." }, 503);

  let validSession = false;
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (payloadPart && signaturePart) {
      const decode = value => {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
        return Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
      };
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const payload = JSON.parse(new TextDecoder().decode(decode(payloadPart)));
      validSession = Number(payload.exp) > Math.floor(Date.now() / 1000) &&
        await crypto.subtle.verify("HMAC", key, decode(signaturePart), new TextEncoder().encode(payloadPart));
    }
  } catch { validSession = false; }
  if (!validSession) return json({ error: "Secure GPS sign-in required." }, 401);

  // The upstream ROCK ELD API key remains server-side in encrypted Pages Secrets.
  // Never expose ROCKELD_API_KEY to browser code or responses.
  if (!env.ROCKELD_API_KEY) {
    return json({ error: "ROCKELD_API_KEY is not configured." }, 503);
  }

  try {
    const upstream = await fetch("https://cloud.rockeld.us/api/v0/locations", {
      method: "GET",
      headers: {
        "X-Api-Key": env.ROCKELD_API_KEY,
        "Accept": "application/json"
      }
    });

    if (!upstream.ok) {
      return json({
        error: "ROCK ELD request failed.",
        upstreamStatus: upstream.status
      }, 502);
    }

    const data = await upstream.json();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    const now = Date.now();
    const staleAfterMs = 15 * 60 * 1000;

    const locations = vehicles.map((vehicle) => {
      const reportedAtMs = Number(vehicle.locationTime);
      const validTimestamp =
        vehicle.locationTime !== null &&
        vehicle.locationTime !== undefined &&
        vehicle.locationTime !== "" &&
        Number.isFinite(reportedAtMs) &&
        reportedAtMs > 0;
      const ageMs = validTimestamp ? Math.max(0, now - reportedAtMs) : null;
      const hasCoordinates =
        vehicle.latitude !== null &&
        vehicle.latitude !== undefined &&
        vehicle.longitude !== null &&
        vehicle.longitude !== undefined;
      const latitude = hasCoordinates ? Number(vehicle.latitude) : NaN;
      const longitude = hasCoordinates ? Number(vehicle.longitude) : NaN;
      const validCoordinates =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180;

      return {
        vehicleId: vehicle.vehicleId ?? null,
        id: vehicle.id ?? null,
        latitude: validCoordinates ? latitude : null,
        longitude: validCoordinates ? longitude : null,
        location: vehicle.geoCodedLocation ?? null,
        speed: vehicle.speed ?? null,
        bearing: vehicle.bearing ?? null,
        lastReport: validTimestamp ? new Date(reportedAtMs).toISOString() : null,
        ageMinutes: ageMs === null ? null : Math.round(ageMs / 60000),
        status: ageMs === null ? "unknown" : ageMs > staleAfterMs ? "stale" : "fresh"
      };
    });

    return json({
      success: true,
      source: "ROCK ELD",
      fetchedAt: new Date(now).toISOString(),
      staleAfterMinutes: 15,
      count: locations.length,
      locations
    });
  } catch {
    return json({ error: "Could not retrieve ROCK ELD locations." }, 502);
  }
}
