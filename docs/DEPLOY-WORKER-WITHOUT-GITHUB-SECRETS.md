# Deploy CLST Trucking Worker without GitHub deployment secrets

This is the fallback for the first deployment when GitHub Actions does not yet have Cloudflare API secrets.

## Run once on the Windows PC

1. Install Node.js LTS if it is not installed: https://nodejs.org/
2. Open PowerShell in the cloned `clst-trucking` repository.
3. Run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\deploy-cloudflare-worker.ps1
   ```

4. If Wrangler opens a browser, sign in to the Cloudflare account that owns the `clst-gmail-backend` Worker.
5. The script finds or creates the KV namespace named `TOKENS`, generates a temporary Wrangler config, and deploys the Worker with the existing Cloudflare variables preserved.

The script does not ask you to paste API tokens into chat or commit credentials to GitHub. It removes the temporary generated config after deployment.

## Important

- This is a manual, local deployment path. It does not magically grant ChatGPT access to the Cloudflare account.
- The Worker still needs the Cloudflare variables/secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `API_KEY`, and `GEMINI_API_KEY`. Existing values are preserved with `--keep-vars`; missing values must be configured in the Cloudflare dashboard.
- After deployment, open `https://clst-gmail-backend.clsttruckingllc.workers.dev/`. The endpoint should return JSON with service status. Then open `https://clst-trucking.pages.dev/ai/` and use its Gmail connect flow to authorize Gmail.
- Automatic replies should not be considered live until Gmail OAuth is connected and a protected status/run check confirms success.
- For ongoing GitHub Actions deployment, the repository still needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_KV_NAMESPACE_ID` configured as GitHub Actions secrets.
