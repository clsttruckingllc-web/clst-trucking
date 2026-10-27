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

async function verifyCloudflareAccessJwt(token, env) {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  const audience = String(env.CF_ACCESS_AUD || "").trim();

  if (!teamDomain || !audience) {
    return { ok: false, status: 503, error: "Cloudflare Access is not configured for this endpoint." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, error: "Invalid Cloudflare Access token." };
  }

  try {
    const header = decodeJsonPart(parts[0]);
    const claims = decodeJsonPart(parts[1]);
    if (header.alg !== "RS256" || !header.kid) {
      return { ok: false, status: 401, error: "Invalid Cloudflare Access token." };
    }

    const now = Math.floor(Date.now() / 1000);
    const issuer = "https://" + teamDomain;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

    if (
      claims.iss !== issuer ||
      !aud.includes(audience) ||
      !Number.isFinite(Number(claims.exp)) ||
      Number(claims.exp) <= now ||
      (claims.nbf !== undefined && Number(claims.nbf) > now + 60) ||
      (claims.iat !== undefined && Number(claims.iat) > now + 60)
    ) {
      return { ok: false, status: 401, error: "Cloudflare Access token is expired or invalid for this application." };
    }

    const certsResponse = await fetch(issuer + "/cdn-cgi/access/certs", {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!certsResponse.ok) {
      return { ok: false, status: 503, error: "Could not verify Cloudflare Access token." };
    }

    const certs = await certsResponse.json();
    const jwk = Array.isArray(certs.keys) ? certs.keys.find((key) => key.kid === header.kid) : null;
    if (!jwk) {
      return { ok: false, status: 401, error: "Cloudflare Access signing key was not found." };
    }

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signedData = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const validSignature = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      decodeBase64Url(parts[2]),
      signedData
    );

    return validSignature
      ? { ok: true }
      : { ok: false, status: 401, error: "Cloudflare Access token signature is invalid." };
  } catch {
    return { ok: false, status: 401, error: "Could not validate Cloudflare Access token." };
  }
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

  // ROCK ELD credentials stay server-side in encrypted Cloudflare Pages Secrets.
  // This endpoint is intentionally available without an interactive login for the current integration phase.
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
