
export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  if (!env.API_KEY) {
    return Response.json(
      { error: "API_KEY is not configured in Pages" },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const incomingUrl = new URL(request.url);
    const upstreamUrl =
      "https://clst-gmail-backend.clsttruckingllc.workers.dev/api/rates" +
      incomingUrl.search;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${env.API_KEY}`,
        "Accept": "application/json"
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json"
      }
    });
  } catch {
    return Response.json(
      { error: "Could not reach Gmail backend" },
      { status: 502, headers: corsHeaders }
    );
  }
}
