# ROCK ELD GPS → ETA setup

The dashboard and ETA page call the server-side Cloudflare Pages Function at `/api/rockeld/locations`. The ROCK ELD API key is read only from the encrypted Pages secret `ROCKELD_API_KEY`; it is never sent to the browser.

## Company sign-in

The GPS panel uses a simple CLST username and password instead of asking the operator to enter an API token.

In Cloudflare Dashboard → Workers & Pages → `clst-trucking` → Settings → Variables and Secrets, configure these encrypted secrets:

- `ROCKELD_GPS_USERNAME`
- `ROCKELD_GPS_PASSWORD`
- `ROCKELD_API_KEY` (the separate upstream ROCK ELD API key)

Do not put any of these values in GitHub or HTML. After changing the secrets, redeploy the Pages project so the values are active.

Open `https://clst-trucking.pages.dev/ai/`, enter the CLST username and password in the ROCK ELD section, then tap **Sign in**. The credentials are held in the current browser tab's session storage and sent only over HTTPS. The server validates them and uses its own `ROCKELD_API_KEY` to call ROCK ELD. The password is not the upstream API key.

## What the endpoint returns

- Reads `GET https://cloud.rockeld.us/api/v0/locations` from the server.
- Returns sanitized truck location fields only.
- Marks GPS reports as `fresh` only when they are no older than 15 minutes; older reports are `stale`.
- The ETA page can select a fresh truck location. A stale/unknown report cannot be selected; manual ETA remains available if GPS is not configured.

## Safety and ETA limitations

- The endpoint requires company sign-in or a verified Cloudflare Access JWT; it must not be made public.
- Keep the ROCK ELD API key and login credentials out of source control.
- The endpoint uses `Cache-Control: no-store` and does not enable cross-origin access.
- A report older than 15 minutes is not eligible to fill the ETA origin. A fresh report still needs human review.
- ETA excludes live traffic, weather, border delays, loading delays, and verified driver hours-of-service. Do not promise an arrival time based solely on this estimate.
