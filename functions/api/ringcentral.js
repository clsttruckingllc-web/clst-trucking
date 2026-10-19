
export async function onRequest({ request }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers }
    );
  }

  return Response.json(
    {
      service: "CLST Trucking AI - RingCentral",
      status: "setup",
      message: "RingCentral endpoint is ready for configuration."
    },
    { status: 200, headers }
  );
}
