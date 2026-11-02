import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync("functions/api/rockeld/locations.js", "utf8");
const worker = readFileSync("cloudflare-worker.js", "utf8");
const session = readFileSync("functions/api/rockeld/session.js", "utf8");
const page = readFileSync("eta.html", "utf8");
const login = readFileSync("gps-login.html", "utf8");
const dashboard = readFileSync("index.html", "utf8");

assert.ok(endpoint.includes("https://cloud.rockeld.us/api/v0/locations"));
assert.ok(endpoint.includes("env.ROCKELD_API_KEY"));
assert.ok(endpoint.includes("CLST_GPS_SESSION_SECRET"));
assert.ok(endpoint.includes("clst_gps_session="));
assert.ok(endpoint.includes('crypto.subtle.verify("HMAC"'));
assert.ok(!endpoint.includes("Cf-Access-Jwt-Assertion"));
assert.ok(session.includes("CLST_GPS_LOGIN_PASSWORD"));
assert.ok(session.includes("CLST_GPS_SESSION_SECRET"));
assert.ok(session.includes("HttpOnly; Secure; SameSite=Lax"));
assert.ok(session.includes("const SESSION_SECONDS = 8 * 60 * 60"));
assert.ok(!dashboard.includes("eldUsername") && !dashboard.includes("eldPassword"));
assert.ok(endpoint.includes("const staleAfterMs = 15 * 60 * 1000"));
assert.ok(worker.includes("async function gmailUserLabelMap(token)"));
assert.ok(worker.includes("labels:labelIds.map(id=>labelNamesById.get(id)).filter(Boolean)"));
assert.ok(worker.includes("labelNamesById=await gmailUserLabelMap(token)"));
assert.ok(endpoint.includes("driverName:"));
assert.ok(endpoint.includes("truckNumber:"));
assert.ok(page.includes("load.email?.labels"));
assert.ok(page.includes("No truck was guessed."));
assert.ok(page.includes("newer_than:365d") && page.includes("has:attachment filename:pdf"));
assert.ok(page.includes("await loadRates(loadNumber)"));
assert.ok(page.includes('id="load" maxlength="80" required'));
assert.ok(page.includes('id="calculateButton"'));
assert.ok(page.includes("fetchWithTimeout('/api/rockeld/locations'"));
assert.ok(page.includes("function loadTruckLocation(load)"));
assert.ok(page.includes("function calculate(event)"));
assert.ok(page.includes("gps-login.html"));
assert.ok(login.includes("fetch('/api/rockeld/session'"));
assert.ok(login.includes("method:'POST'"));
assert.equal((page.match(/<input/g) || []).length, 1, "ETA form should have only the load number input");

// Compile every inline script without executing browser code.
for (const html of [page, login]) {
  const script = html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script, "HTML page should contain its application script");
  new Function(script);
}

console.log("ROCK ELD secure session and ETA page validation passed.");
