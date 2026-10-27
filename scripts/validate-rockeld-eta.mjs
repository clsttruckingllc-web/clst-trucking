import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync("functions/api/rockeld/locations.js", "utf8");
const page = readFileSync("eta.html", "utf8");

assert.match(endpoint, /https:\/\/cloud\.rockeld\.us\/api\/v0\/locations/);
assert.match(endpoint, /env\.ROCKELD_API_KEY/);
assert.match(endpoint, /ROCKELD_GPS_ACCESS_TOKEN/);
assert.match(endpoint, /staleAfterMs\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
assert.match(endpoint, /Cf-Access-Jwt-Assertion/);
assert.match(page, /fetch\('\/api\/rates\?maxResults=10'/);
assert.match(page, /id="load" maxlength="80" required/);
assert.match(page, /id="calculateButton"/);
assert.match(page, /fetch\('\/api\/rockeld\/locations'/);
assert.match(page, /fetch\('\/api\/rates\?maxResults=10'/);
assert.match(page, /function loadTruckLocation\(load\)/);
assert.match(page, /function calculate\(event\)/);
assert.doesNotMatch(page, /gpsAccessToken|saveGpsTokenButton|clst_rockeld_gps_token|gpsTruckSelect|id="currentLocation"|id="destination"|id="miles"|id="speed"|id="hours"|id="rest"/);
assert.equal((page.match(/<input\b/g) || []).length, 1, "ETA form should have only the load number input");

// Compile (but do not execute) every inline script in the ETA page.
const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length > 0, "ETA page should contain its application script");
for (const [index, match] of scripts.entries()) {
  new Function(match[1]);
  assert.ok(index >= 0);
}

console.log("ROCK ELD endpoint and ETA page validation passed.");
