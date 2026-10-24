# CLST Trucking Gmail AI auto-reply

## What the Worker does

- Checks up to 12 unread Inbox messages from the last two days on each scheduled run.
- Ignores internal, automated, bulk, and obvious no-reply messages.
- Sends only routine, low-risk replies when the model confidence is at least 0.92.
- Creates Gmail drafts for messages involving rates, load acceptance, scheduling commitments, payments, claims, legal/insurance, detention/TONU, or uncertain facts.
- Adds `vic@clsttrucking.com` to outgoing replies while preserving other recipients, excluding the reply recipient and the connected account.
- Stores per-message idempotency keys in Cloudflare KV to avoid repeatedly replying to the same message.
- Stores the latest run result in KV for diagnostics.

## Worker bindings and settings

Worker name: `clst-gmail-backend`

KV namespace binding:
- Variable name: `TOKENS`
- Namespace: the existing Cloudflare KV namespace used by this Worker.

Required Worker variables/secrets:
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (variable).
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (secret).
- `API_KEY` — long random value used as a Bearer token for protected API routes (secret).
- `GEMINI_API_KEY` — Gemini API key (secret).

Optional:
- `GEMINI_MODEL` — defaults to `gemini-2.5-flash-lite`.
- `GOOGLE_REDIRECT_URI` — defaults to `https://clst-gmail-backend.clsttruckingllc.workers.dev/oauth/callback`.
- `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_JWT` — for the existing RingCentral read-only diagnostics.

In the Google Cloud OAuth client, add this exact authorized redirect URI:
`https://clst-gmail-backend.clsttruckingllc.workers.dev/oauth/callback`

The Gmail OAuth grant requires the readonly, send, and compose scopes. If scopes change or the refresh token was issued before the required scopes were granted, reconnect Gmail using the app's Connect Gmail flow.

## Scheduled deployment

The repository workflow `.github/workflows/deploy-gmail-worker.yml` deploys the Worker and configures a Cron Trigger every five minutes. It expects these **GitHub Actions repository secrets**:

- `CLOUDFLARE_API_TOKEN` — token with permission to deploy Workers and manage the needed Worker configuration.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `CLOUDFLARE_KV_NAMESPACE_ID` — ID of the existing KV namespace bound as `TOKENS`.

The workflow uses `wrangler deploy --keep-vars` so existing Worker variables/secrets are retained. Never commit or paste secret values into source files, issues, or chat.

## Verification

- Public health endpoint: `GET /` (does not reveal secret values).
- Protected status endpoint: `GET /api/autoreply/status` with header `Authorization: Bearer <API_KEY>`.
- Protected manual run: `POST /api/autoreply/run` with header `Authorization: Bearer <API_KEY>`.
- OAuth start: `GET /auth/start`.

Check the status endpoint after deployment. Confirm `configured` and `gmailConnected` are true and inspect `lastRun`. Test with a controlled, low-risk unread email before relying on automatic replies. Sensitive or uncertain messages should remain drafts for human review.
