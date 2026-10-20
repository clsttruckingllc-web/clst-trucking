import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Softphone from "ringcentral-softphone";

const required = [
  "SIP_INFO_DOMAIN",
  "SIP_INFO_OUTBOUND_PROXY",
  "SIP_INFO_USERNAME",
  "SIP_INFO_PASSWORD",
  "SIP_INFO_AUTHORIZATION_ID",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error("Voice service configuration is incomplete. Missing:", missing.join(", "));
  console.error("Copy .env.example to .env and enter SIP values from RingCentral. Never commit .env.");
  process.exit(1);
}

const autoAnswer = (process.env.AUTO_ANSWER ?? "false").toLowerCase() === "true";
const greetingPath = path.resolve(process.env.GREETING_RAW_PATH || "./greeting.raw");

let greetingBuffer = null;
if (fs.existsSync(greetingPath)) {
  greetingBuffer = fs.readFileSync(greetingPath);
  if (!greetingBuffer.length) greetingBuffer = null;
}

const softphone = new Softphone({
  domain: process.env.SIP_INFO_DOMAIN,
  outboundProxy: process.env.SIP_INFO_OUTBOUND_PROXY,
  username: process.env.SIP_INFO_USERNAME,
  password: process.env.SIP_INFO_PASSWORD,
  authorizationId: process.env.SIP_INFO_AUTHORIZATION_ID,
  codec: "OPUS/16000",
});

let shuttingDown = false;

softphone.on("invite", async (invite) => {
  if (!autoAnswer) {
    console.warn("Inbound SIP invite received, but AUTO_ANSWER is false. Not answering.");
    try { await softphone.decline(invite); } catch (error) {
      console.error("Could not decline invite:", error?.message || "unknown error");
    }
    return;
  }

  let call;
  try {
    call = await softphone.answer(invite);
    console.log("Inbound call answered. Call ID:", call.callId || "unavailable");

    // Safe transport smoke test only: this scaffold does not yet transcribe the caller
    // or generate live AI speech. It can play one supplied raw PCM greeting.
    if (greetingBuffer) {
      const streamer = call.streamAudio(greetingBuffer);
      streamer.once("finished", () => console.log("Greeting playback finished."));
      console.log("Playing configured greeting audio.");
    } else {
      console.warn("No greeting.raw file found; call is answered but no greeting audio will play.");
    }

    call.on("audio", (audio) => {
      // Do not log or persist caller audio. This event only confirms audio reaches the service.
      console.log("Inbound audio received (bytes):", audio.length);
    });
    call.on("dtmf", (digit) => {
      console.log("DTMF received:", String(digit).replace(/[^0-9*#]/g, ""));
    });
    call.once("disposed", () => {
      console.log("Call ended.");
    });
    call.on("error", (error) => {
      console.error("Call session error:", error?.message || "unknown error");
    });
  } catch (error) {
    console.error("Could not answer inbound call:", error?.message || "unknown error");
    // Do not attempt risky call-control fallbacks here. Fix routing/config and retest.
  }
});

softphone.on("signalingError", (error) => {
  console.error("SIP signaling error:", error?.message || "unknown error");
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down voice service:", signal);
  try { await softphone.revoke(); } catch {}
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await softphone.register();
  console.log("CLST Trucking AI voice service registered with RingCentral.");
  console.log("Auto-answer:", autoAnswer ? "enabled" : "disabled");
  console.log("Greeting audio:", greetingBuffer ? "loaded" : "not configured");
  console.log("IMPORTANT: this is a SIP/audio transport smoke test, not a live conversational AI yet.");
} catch (error) {
  console.error("Could not register SIP softphone:", error?.message || "unknown error");
  process.exit(1);
}
