# ROCK ELD GPS → ETA setup

The dashboard and ETA page call the server-side Cloudflare Pages Function at `/api/rockeld/locations`. The ROCK ELD API key is read only from the encrypted Pages secret `ROCKELD_API_KEY`; it is never sent to the browser.

## Fleet access and server secrets

The dashboard automatically refreshes locations while it is open. Access to the live GPS endpoint is restricted by a verified Cloudflare Access session; there is no second username/password form in the dashboard.

In Cloudflare Dashboard → Workers & Pages → `clst-trucking` → Settings → Variables and Secrets, configure these encrypted secrets:

- `ROCKELD_API_KEY` — the upstream ROCK ELD API key
- `CF_ACCESS_TEAM_DOMAIN` — your Cloudflare Access team domain, without `https://`
- `CF_ACCESS_AUD` — the Access application AUD value

Do not put these values in GitHub or HTML. After changing secrets, redeploy the Pages project. Configure Cloudflare Access to protect the dashboard and its `/api/rockeld/locations` endpoint. The browser uses its Access session; the server validates the Access JWT and calls ROCK ELD with its own `ROCKELD_API_KEY`.

## What the endpoint returns

- Reads `GET https://cloud.rockeld.us/api/v0/locations` from the server.
- Returns sanitized truck location fields only.
- Marks GPS reports as `fresh` only when they are no older than 15 minutes; older reports are `stale`.
- The ETA page can select a fresh truck location. A stale/unknown report cannot be selected; manual ETA remains available if GPS is not configured.

## Safety and ETA limitations

- The endpoint requires a verified Cloudflare Access JWT; it must not be made public.
- Keep the ROCK ELD API key and login credentials out of source control.
- The endpoint uses `Cache-Control: no-store` and does not enable cross-origin access.
- A report older than 15 minutes is not eligible to fill the ETA origin. A fresh report still needs human review.
- ETA excludes live traffic, weather, border delays, loading delays, and verified driver hours-of-service. Do not promise an arrival time based solely on this estimate.
