# Run CLST Trucking AI voice test on your Windows PC

This is a temporary local test, not a production phone system. Keep the PC awake and connected to the internet while the service is running.

## Before starting

1. Install Node.js 20 LTS or newer from https://nodejs.org/ and restart PowerShell.
2. In RingCentral, obtain a **separate AI Existing Phone / OtherPhone SIP endpoint** and its SIP details. Do not reuse the Yealink desk phone's SIP credentials; registering both with the same credentials can interrupt the desk phone.
3. Have your Gemini API key ready and choose your own phone number as the test destination in international format, e.g. +17205550123.

## Set up the service

Open PowerShell and run:

```powershell
git clone https://github.com/clsttruckingllc-web/clst-trucking.git
cd clst-trucking\voice-service
Copy-Item .env.example .env
notepad .env
```

In Notepad, fill in the blank values in `.env` with the SIP details from the dedicated AI endpoint, your Gemini API key, a long private random `VOICE_API_KEY`, and your own test destination in `TEST_CALL_TO`. Do not paste secrets into GitHub, a browser page, or a public chat. Save and close Notepad.

Install dependencies and start the service:

```powershell
npm install
npm start
```

Keep this PowerShell window open. The service attempts to register with RingCentral and prints status/errors in this window. Do not proceed until the registration succeeds. The local health check can be opened at http://127.0.0.1:8080/health.

## Trigger one test call

Open a **second** PowerShell window. Replace `PUT_YOUR_VOICE_API_KEY_HERE` with the exact local `VOICE_API_KEY` value from your private `.env` file, then run:

```powershell
$headers = @{ Authorization = "Bearer PUT_YOUR_VOICE_API_KEY_HERE" }
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8080/test-call" -Headers $headers -ContentType "application/json" -Body "{}"
```

This calls only the preconfigured `TEST_CALL_TO`, plays a short female-voice CLST greeting, and ends the call. It does not change the main company number's routing.

## Stop the service

Press `Ctrl+C` in the first PowerShell window.

## Important

- Do not disable Jessica or change the main company number's routing until the test call is confirmed successful and the next inbound-call setup has been tested.
- This version is a one-way spoken greeting test, not a full two-way AI receptionist yet.
- Do not expose port 8080 to the public internet.
- The PC must stay awake and online. Home/office router and Windows firewall settings can affect SIP/media connectivity.
- If health reports `sipRegistered: false`, share the error text only after removing phone numbers, usernames, and any credentials. Never share the contents of `.env`.
