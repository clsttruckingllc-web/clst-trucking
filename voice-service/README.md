# CLST Trucking AI — Voice Service (scaffold)

This is a **separate Node.js service**, not a Cloudflare Pages Function. RingCentral SIP signaling and real-time audio need a long-running process; the existing Pages/Functions endpoints are read-only diagnostics and do not carry call audio.

## Current scope

- Registers a RingCentral Softphone SDK endpoint using SIP credentials.
- Can answer an inbound invite when `AUTO_ANSWER=true`.
- Can play a configured raw PCM greeting.
- Logs whether inbound audio and DTMF events reach the service.
- Does **not** yet perform speech-to-text, conversational reasoning, text-to-speech, or call transfer. Do not route the main company number to this service as a finished AI receptionist.

## Requirements

- Node.js 20 or newer.
- A RingCentral **Existing Phone / OtherPhone** device that supports SIP credentials.
- A server that stays running and allows outbound TLS SIP connectivity and the SDK's required WebRTC/media traffic.
- The company's RingCentral admin must authorize the SIP endpoint and test routing safely.

## Get SIP credentials

In RingCentral, open the intended extension/device, then **Devices & Numbers → Existing Phone → Set Up and Provision → Set up manually using SIP**. Record the SIP domain, TLS outbound proxy, username, password, and authorization ID.

Do not use the RingCentral desktop/mobile app's SoftPhone device type as SIP credentials. Never put SIP values in GitHub, browser code, a public Pages variable, or a chat message.

## Configure and run

1. On the server, copy `.env.example` to `.env`.
2. Enter the SIP values into `.env` locally on that server.
3. Install dependencies with `npm install`.
4. Initially set `AUTO_ANSWER=false` to verify registration without answering calls.
5. After a controlled test extension is routed to the SIP endpoint, set `AUTO_ANSWER=true` and restart the service.
6. Optionally create a raw greeting file in the format expected by the SDK's default `OPUS/16000` codec: signed 16-bit little-endian PCM, 16 kHz, mono. For example, convert a WAV file with FFmpeg:
   `ffmpeg -i greeting.wav -f s16le -acodec pcm_s16le -ar 16000 -ac 1 greeting.raw`

## Next implementation stage

Connect inbound audio to a streaming speech recognition service and the chosen conversational AI, then stream generated 16 kHz PCM speech back to the call. Add timeouts, interruption/barge-in, call transfer, privacy announcements, structured logging without audio retention, and an end-to-end test suite before changing the production company-number route.

## Security

- Never commit `.env`, SIP passwords, JWTs, API keys, caller audio, or call transcripts.
- Do not expose a public endpoint that can answer/control calls without authentication.
- Keep production call routing unchanged until registration, audio in/out, and failover have been tested on a dedicated extension.
