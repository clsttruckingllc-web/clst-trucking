# Mare voice readiness check

This change adds a read-only dashboard check at `GET /api/voice/status`.

## Cloudflare Pages configuration

After the voice service is deployed to a public HTTPS URL, configure these Pages environment variables/secrets for the **clst-trucking** project:

- `CLST_VOICE_SERVICE_URL`: HTTPS base URL of the running voice service (the endpoint appends `/health`).
- `CLST_VOICE_SERVICE_TOKEN` (optional): bearer token, if the voice service protects its health endpoint.

Do not put tokens, API keys, or SIP credentials in browser JavaScript or commit them to GitHub.

## What this does — and does not do

- The endpoint checks whether the separately deployed voice service responds to its health endpoint.
- The dashboard adds **Check Mare voice** beside the RingCentral connection test.
- The check is read-only: it does not create, enable, or modify call forwarding.
- A reachable health endpoint does **not** prove RingCentral inbound calls are routed to Mare. Before forwarding business calls, configure the supported RingCentral call-control/webhook path and complete an end-to-end test call.

If the service URL is absent, the endpoint returns `voice_service_not_configured`. That is expected until the voice service is deployed and configured.
