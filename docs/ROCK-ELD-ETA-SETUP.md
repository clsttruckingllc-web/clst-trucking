# ROCK ELD GPS → ETA setup

This integration adds a server-side Cloudflare Pages Function at `/api/rockeld/locations`. It reads the ROCK ELD API key only from the Cloudflare Pages secret `ROCKELD_API_KEY`; the key is never sent to the browser.

## What is implemented

- Reads `GET https://cloud.rockeld.us/api/v0/locations` from the server.
- Returns a small, sanitized set of truck fields instead of the complete upstream payload.
- Marks GPS reports as `fresh` only when they are no older than 15 minutes; older reports are `stale`.
- Verifies Cloudflare Access JWT signatures, issuer, audience, and expiry when Access is used.
- Also supports a separate shared bearer token for free `pages.dev` testing.
- The ETA page can request the locations and select a truck. Stale/unknown reports cannot be selected; manual ETA still works if GPS is not configured.

## Free test setup (no custom domain)

The endpoint is intentionally closed until an access method is configured.

1. Generate a separate random token in PowerShell or Command Prompt (do not reuse the ROCK ELD API key):
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Save the generated token as an encrypted Cloudflare Pages secret from the repository's Windows terminal:
   ```powershell
   npx.cmd wrangler@latest pages secret put ROCKELD_GPS_ACCESS_TOKEN --project-name clst-trucking
   ```
   Paste the generated token when Wrangler prompts for its value. Do not commit it to GitHub or place it in HTML.
3. Open `https://clst-trucking.pages.dev/eta.html`. In the ROCK ELD GPS access token field, enter that same token, then tap **Load ROCK ELD GPS locations**.
4. Choose a truck marked `FRESH`, confirm its displayed location, calculate the remaining road miles, and calculate ETA. GPS is not treated as traffic-aware routing; the route miles still come from the existing OSRM route lookup.

The shared token is entered by the operator in the page, sent only over HTTPS, and is not saved in browser storage. Rotate it by setting a new value for the same Pages secret and use the new value in the page.

## Cloudflare Access alternative

For deployments where a Cloudflare Access application is available, protect the route `/api/rockeld/*` at the edge and set the Pages environment secrets `CF_ACCESS_TEAM_DOMAIN` (for example, `example.cloudflareaccess.com`, without `https://`) and `CF_ACCESS_AUD` (the Access application's audience tag). The function independently verifies the signed Access JWT; checking only for the presence of a JWT header is not considered authentication.

## Safety and ETA limitations

- Never make this endpoint unauthenticated or remove the token/JWT checks. Fleet locations are sensitive.
- Keep `ROCKELD_API_KEY` and `ROCKELD_GPS_ACCESS_TOKEN` out of source control.
- The endpoint uses `Cache-Control: no-store` and does not enable cross-origin access.
- A report older than 15 minutes is not eligible to fill the ETA origin. A fresh report still needs human review.
- The current ETA calculator estimates driving/rest time from remaining road miles and configured planning assumptions. It does not include live traffic, weather, border delays, loading delays, or verified driver hours-of-service. Do not promise an arrival time based solely on this prototype.
