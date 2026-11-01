import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync("functions/api/rockeld/locations.js", "utf8");
const session = readFileSync("functions/api/rockeld/session.js", "utf8");
const page = readFileSync("eta.html", "utf8");
const login = readFileSync("gps-login.html", "utf8");
const dashboard = readFileSync("index.html", "utf8");

assert.match(endpoint, /https:\\/\\/cloud\\.rockeld\\.us\\/api\\/v0\\/locations/);
assert.match(endpoint, /env\\.ROCKELD_API_KEY/);
assert.match(endpoint, /CLST_GPS_SESSION_SECRET/);
assert.match(endpoint, /clst_gps_session=/);
assert.match(endpoint, /crypto\\.subtle\\.verify/);
assert.doesNotMatch(endpoint, /Cf-Access-Jwt-Assertion|CF_ACCESS_TEAM_DOMAIN|CF_ACCESS_AUD/);
assert.match(session, /CLST_GPS_LOGIN_PASSWORD/);
assert.match(session, /CLST_GPS_SESSION_SECRET/);
assert.match(session, /HttpOnly; Secure; SameSite=Lax/);
assert.match(session, /SESSION_SECONDS = 8 \\* 60 \\* 60/);
assert.doesNotMatch(dashboard, /eldUsername|eldPassword|saveEldCredentialsBtn|clst_rockeld_gps_username|clst_rockeld_gps_password/);
assert.doesNotMatch(dashboard, /eldAccessToken|saveEldTokenBtn|ROCK ELD GPS access token/);
assert.match(endpoint, /staleAfterMs\\s*=\\s*15\\s*\\*\\s*60\\s*\\*\\s*1000/);
assert.match(page, /fetchWithTimeout\\('\\/api\\/rates\\?maxResults=50'/);
assert.match(page, /id="load" maxlength="80" required/);
assert.match(page, /id="calculateButton"/);
assert.match(page, /fetchWithTimeout\\('\\/api\\/rockeld\\/locations'/);
assert.match(page, /function loadTruckLocation\\(load\\)/);
assert.match(page, /function calculate\\(event\\)/);
assert.match(page, /gps-login\\.html/);
assert.match(login, /fetch\\('\\/api\\/rockeld\\/session'/);
assert.match(login, /method:'POST'/);
assert.doesNotMatch(page, /gpsAccessToken|saveGpsTokenButton|clst_rockeld_gps_token|gpsTruckSelect|id="currentLocation"|id="destination"|id="miles"|id="speed"|id="hours"|id="rest"/);
assert.equal((page.match(/<input\\b/g) || []).length, 1, "ETA form should have only the load number input");

// Compile every inline script without executing browser code.
for (const html of [page, login]) {
  const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];
  assert.ok(scripts.length > 0, "HTML page should contain its application script");
  for (const match of scripts) new Function(match[1]);
}

console.log("ROCK ELD secure session and ETA page validation passed.");
