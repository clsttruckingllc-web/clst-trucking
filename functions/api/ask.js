export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed. Use POST." },
      { status: 405, headers: corsHeaders }
    );
  }

  if (!env.API_KEY) {
    return Response.json(
      { success: false, error: "API_KEY is not configured in Pages." },
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const upstream = await fetch(
      "https://clst-gmail-backend.clsttruckingllc.workers.dev/api/ask",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return Response.json(
        {
          success: false,
          error: "Gmail backend returned a non-JSON response.",
          upstreamStatus: upstream.status,
          details: raw.slice(0, 500)
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return Response.json(data, {
      status: upstream.status,
      headers: corsHeaders
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: "Could not reach Gmail backend.",
        details: String(error && error.message || error).slice(0, 300)
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
