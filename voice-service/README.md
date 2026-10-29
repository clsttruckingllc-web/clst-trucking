# CLST Trucking AI — Voice Service

This folder contains the long-running RingCentral SIP voice service. It must run on a host that supports a persistent Node.js process and the SIP/RTP media network traffic RingCentral requires; Cloudflare Pages Functions cannot host the SIP audio process.

## OpenAI Realtime mode

The included Dockerfile starts `npm run start:ai`, using `sip-inbound-openai.mjs`:

- Registers the configured RingCentral SIP endpoint.
- Answers inbound calls delivered to that endpoint.
- Streams caller audio to OpenAI Realtime and plays generated speech back over SIP.
- Exposes `GET /health`; it reports `sipRegistered: true` only after SIP registration succeeds.
- Logs caller transcription and the AI's spoken response, but does not store call audio to disk.

Set these environment variables/secrets in the hosting provider:

- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL` (default in `.env.example`)
- `OPENAI_REALTIME_VOICE`
- `ENABLE_INBOUND_GREETING=true` to explicitly enable the SIP voice client
- `SIP_INFO_DOMAIN`, `SIP_INFO_OUTBOUND_PROXY`, `SIP_INFO_USERNAME`, `SIP_INFO_PASSWORD`, `SIP_INFO_AUTHORIZATION_ID`
- `COMPANY_NAME` and optionally `INBOUND_GREETING`

Never commit real secrets to GitHub. Use the provider's secret settings.

## Critical call-routing safeguards

Use SIP credentials assigned to a dedicated AI Existing Phone / OtherPhone endpoint. Do not reuse the physical Yealink's SIP credentials: RingCentral can deliver inbound calls to the most recently registered instance when credentials are shared.

This service does **not** change the main company number's routing. First deploy it with a dedicated AI extension, confirm `/health` reports successful SIP registration, then place a real test call and verify both sides of the conversation. Only after that succeeds should the main number be routed to the AI. Some application hosting platforms restrict SIP/RTP UDP traffic; if registration or audio fails, use a host with supported persistent SIP and UDP media connectivity.

## Legacy test-call mode

`server.js` remains available with `npm start`. It provides a basic prerecorded/generative greeting and an authenticated test-call endpoint, but it is not the two-way conversational service. It requires the legacy Gemini and test-call environment variables documented in `.env.example`.

## ETA helper

The `eta.js` module is a deterministic local calculation and has unit tests in `eta.test.js`. It is not yet connected to the live voice conversation, Gmail, or ELD location feed.
