
export async function onRequest(context) {
  const backend =
    "https://clst-gmail-backend.clsttruckingllc.workers.dev/api/models";

  const response = await fetch(backend, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${context.env.API_KEY}`,
      "Accept": "application/json"
    }
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
