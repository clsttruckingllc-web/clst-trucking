# CLST Trucking AI — Voice Service

This is a long-running Node.js SIP voice service. It is separate from Cloudflare Pages because the RingCentral Softphone SDK needs persistent SIP signaling and real-time audio.

## What this version does

- Registers an authorized RingCentral **Existing Phone / OtherPhone** SIP endpoint.
- Exposes `GET /health` for a safe status check.
- Exposes authenticated `POST /test-call` that calls only the preconfigured `TEST_CALL_TO` number.
- Can answer inbound calls delivered to a **dedicated AI SIP endpoint**, play a transparent temporary greeting, then end the call.
- Uses Gemini TTS for the female-voice greeting.
- Does **not** change company-number routing and does not yet conduct a two-way AI conversation. Inbound mode is only a greeting-and-hangup fallback, not a receptionist that understands caller replies.

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
- `GEMINI_TTS_MODEL`: optional; the code maps legacy 2.5 TTS names to `gemini-3.8-flash-lite-tts`
- `TEST_GREETING`: optional greeting text for the outbound test call
- `INBOUND_GREETING`: optional temporary inbound greeting; the current fallback tells callers the system cannot understand replies yet

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


## Free ETA estimator (no API call)

The `eta.js` module is a deterministic, local calculation and does not call Gemini, OpenAI, or any paid service.

Run its tests from this directory with:

```bash
npm test
```

Example use:

```js
import { estimateEta } from "./eta.js";

const eta = estimateEta({
  remainingMiles: 250,
  startAt: new Date(),
  deliveryAppointmentAt: "2026-10-22T18:00:00-05:00"
});
console.log(eta);
```

Important limits:
- Supply **remaining miles from a known current location**, not total route miles copied from a Rate Confirmation.
- If remaining miles are unknown, the function returns `status: "unknown"` rather than inventing an ETA.
- The default planning assumptions are 50 mph, 10 driving hours per day, and 10 hours of rest between driving days; they are configurable and are not a substitute for driver-specific hours-of-service checks.
- The estimate does not include live GPS, traffic, weather, loading delays, or driver status. It is not a guaranteed arrival time.
- This helper is not yet connected to the RingCentral call flow or the Gmail dashboard; integration and end-to-end tests are still required.
