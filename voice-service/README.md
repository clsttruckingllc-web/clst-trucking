# CLST Trucking AI — Voice Service

This is a long-running Node.js SIP voice service. It is separate from Cloudflare Pages because the RingCentral Softphone SDK needs persistent SIP signaling and real-time audio.

## What this version does

- Registers an authorized RingCentral **Existing Phone / OtherPhone** SIP endpoint.
- Exposes `GET /health` for a safe status check.
- Exposes authenticated `POST /test-call` that calls only the preconfigured `TEST_CALL_TO` number.
- Uses Gemini TTS to speak a short, professional female-voice CLST greeting, then ends the test call.
- Does **not** change company-number routing and does not yet conduct a two-way AI conversation. This is a first outbound audio test.

## Required environment variables

Set these in the hosting provider's private environment/secret settings. Never commit actual values.

- `SIP_INFO_DOMAIN`: usually `sip.ringcentral.com` (no port)
- `SIP_INFO_OUTBOUND_PROXY`: the regional `proxyTLS` value from RingCentral SIP info, including port (often port 5096)
- `SIP_INFO_USERNAME`
- `SIP_INFO_PASSWORD`
- `SIP_INFO_AUTHORIZATION_ID`
- `GEMINI_API_KEY`: the Gemini API key already used by the project
- `VOICE_API_KEY`: a new long random API key to protect `POST /test-call`
- `TEST_CALL_TO`: the test recipient in E.164 format, e.g. `+17205550123` (use your own test phone)
- `GEMINI_TTS_MODEL`: optional; defaults to `gemini-2.5-flash-preview-tts`
- `TEST_GREETING`: optional greeting text

Use a **separate AI Existing Phone/OtherPhone device**. Do not run the AI service with the same SIP credentials as the physical Yealink, because RingCentral delivers inbound calls to the most recently registered instance for shared credentials.

## Deploy

Build with the included `Dockerfile` or `voice-service/Dockerfile`. The host must support a persistent Node.js process, outbound TLS SIP signaling, and the UDP/SRTP media traffic required by RingCentral. Ordinary Cloudflare Pages Functions are not a substitute for this long-running SIP service.

The service reports `"sipRegistered": true` at `/health` only after SIP registration succeeds.

## First test call

After deployment and SIP registration, send an authenticated request from a private terminal or API client:

```bash
curl -X POST "https://YOUR-VOICE-SERVICE.example/test-call" \
  -H "Authorization: Bearer YOUR_VOICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

The endpoint does not accept a destination in the request body; it calls only `TEST_CALL_TO` configured on the server. Do not put the API key in browser code or a public webpage.

## Scope still to build

This first test is one-way spoken audio. The next stage is streaming caller audio into speech recognition, conversational response generation, and speech output, with interruption handling, transfer to a human, privacy controls, and end-to-end tests. Do not route the main company number to this test service.
