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
assert.match(page, /function matchLoadNumber\(\)/);
assert.match(page, /id="load" maxlength="80" required/);
assert.doesNotMatch(page, /gpsAccessToken|saveGpsTokenButton|clst_rockeld_gps_token|gpsTruckSelect/);
assert.doesNotMatch(page, /fetch\('\/api\/rockeld\/locations'/);

// Compile (but do not execute) every inline script in the ETA page.
const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length > 0, "ETA page should contain its application script");
for (const [index, match] of scripts.entries()) {
  new Function(match[1]);
  assert.ok(index >= 0);
}

console.log("ROCK ELD endpoint and ETA page validation passed.");
