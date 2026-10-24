# Deploy the CLST Trucking Gmail Worker using your own interactive Cloudflare login.
# No Cloudflare API token is copied into GitHub or this chat.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkerFile = Join-Path $RepoRoot "cloudflare-worker.js"
$WranglerConfig = Join-Path $RepoRoot ".wrangler-deploy.generated.toml"
$Wrangler = @("wrangler@4")

if (-not (Test-Path $WorkerFile)) { throw "Cannot find cloudflare-worker.js at $WorkerFile" }

function Invoke-Wrangler {
  param([string[]]$Arguments)
  & npx --yes @Wrangler @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Wrangler command failed: $($Arguments -join ' ')" }
}

Write-Host "Checking Cloudflare login..."
& npx --yes @Wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "A browser will open. Sign in to the Cloudflare account that owns CLST Trucking."
  Invoke-Wrangler @("login")
}
Invoke-Wrangler @("whoami")

Write-Host "Looking for the existing TOKENS KV namespace..."
$listOutput = & npx --yes @Wrangler kv namespace list --json 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Could not list Cloudflare KV namespaces. Check that your Cloudflare login is authorized."
}
$jsonText = ($listOutput | Out-String).Trim()
try { $namespaces = $jsonText | ConvertFrom-Json } catch {
  throw "Wrangler did not return JSON for KV namespaces. Output: $jsonText"
}
$namespace = @($namespaces) | Where-Object { $_.title -eq "TOKENS" } | Select-Object -First 1
if (-not $namespace) {
  Write-Host "TOKENS namespace not found; creating it..."
  $createOutput = & npx --yes @Wrangler kv namespace create TOKENS --json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not create TOKENS KV namespace: $($createOutput -join [Environment]::NewLine)" }
  $createText = ($createOutput | Out-String).Trim()
  try { $namespace = $createText | ConvertFrom-Json } catch {
    throw "Could not parse the new KV namespace ID. Output: $createText"
  }
}
$namespaceId = [string]$namespace.id
if ([string]::IsNullOrWhiteSpace($namespaceId)) { throw "Could not determine the TOKENS KV namespace ID." }

@"
name = "clst-gmail-backend"
main = "cloudflare-worker.js"
compatibility_date = "2026-10-24"
workers_dev = true

[[kv_namespaces]]
binding = "TOKENS"
id = "$namespaceId"

[triggers]
crons = ["*/5 * * * *"]
"@ | Set-Content -Path $WranglerConfig -Encoding utf8

try {
  Write-Host "Deploying CLST Trucking Worker..."
  Invoke-Wrangler @("deploy", "--config", $WranglerConfig, "--keep-vars")
  Write-Host ""
  Write-Host "Wrangler deployment command completed."
  Write-Host "Now verify https://clst-gmail-backend.clsttruckingllc.workers.dev/"
  Write-Host "This deploy keeps existing Cloudflare variables; it does not create missing Google/Gemini credentials or connect Gmail."
}
finally {
  if (Test-Path $WranglerConfig) { Remove-Item $WranglerConfig -Force }
}
