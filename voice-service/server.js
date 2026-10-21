import "dotenv/config";
import http from "node:http";
import Softphone from "ringcentral-softphone";

const required = [
  "SIP_INFO_DOMAIN",
  "SIP_INFO_OUTBOUND_PROXY",
  "SIP_INFO_USERNAME",
  "SIP_INFO_PASSWORD",
  "SIP_INFO_AUTHORIZATION_ID",
  "GEMINI_API_KEY",
  "VOICE_API_KEY",
  "TEST_CALL_TO",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error("Voice service configuration is incomplete. Missing:", missing.join(", "));
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const TEST_CALL_TO = process.env.TEST_CALL_TO.trim();
const API_KEY = process.env.VOICE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const configuredTtsModel = process.env.GEMINI_TTS_MODEL?.trim();
const TTS_MODEL =
  !configuredTtsModel ||
  configuredTtsModel === "gemini-2.5-flash-tts" ||
  configuredTtsModel === "gemini-2.5-flash-preview-tts"
    ? "gemini-3.8-flash-lite-tts"
    : configuredTtsModel;
const GREETING_TEXT =
  process.env.TEST_GREETING ||
  "Hello, this is CLST Trucking. This is our first automated voice test. Our AI receptionist is being connected. Thank you for calling CLST Trucking.";

const state = {
  sipRegistered: false,
  registering: false,
  callInProgress: false,
  lastError: null,
  startedAt: new Date().toISOString(),
};

const softphone = new Softphone({
  domain: process.env.SIP_INFO_DOMAIN,
  outboundProxy: process.env.SIP_INFO_OUTBOUND_PROXY,
  username: process.env.SIP_INFO_USERNAME,
  password: process.env.SIP_INFO_PASSWORD,
  authorizationId: process.env.SIP_INFO_AUTHORIZATION_ID,
  codec: "OPUS/16000",
});

function json(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function authorized(req) {
  const value = req.headers.authorization || "";
  return value === `Bearer ${API_KEY}`;
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function removeWavHeader(buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WAVE") return buffer;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkName = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunkName === "data") return buffer.subarray(start, Math.min(start + chunkSize, buffer.length));
    offset = start + chunkSize + (chunkSize % 2);
  }
  throw new Error("TTS returned a WAV file without a data chunk");
}

// Gemini TTS returns 24 kHz mono PCM. The RingCentral SDK is configured for
// OPUS/16000, which expects signed 16-bit little-endian mono PCM at 16 kHz.
function resamplePcm16(input, sourceRate = 24000, targetRate = 16000) {
  const pcm = removeWavHeader(input);
  const evenLength = pcm.length - (pcm.length % 2);
  const sampleCount = evenLength / 2;
  if (!sampleCount) throw new Error("TTS returned empty audio");

  const outputCount = Math.max(1, Math.floor(sampleCount * targetRate / sourceRate));
  const output = Buffer.alloc(outputCount * 2);
  for (let i = 0; i < outputCount; i++) {
    const sourcePosition = i * sourceRate / targetRate;
    const left = Math.min(Math.floor(sourcePosition), sampleCount - 1);
    const right = Math.min(left + 1, sampleCount - 1);
    const fraction = sourcePosition - left;
    const a = pcm.readInt16LE(left * 2);
    const b = pcm.readInt16LE(right * 2);
    const sample = Math.max(-32768, Math.min(32767, Math.round(a + (b - a) * fraction)));
    output.writeInt16LE(sample, i * 2);
  }
  return output;
}

async function generateGreetingPcm() {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TTS_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: GREETING_TEXT,
            speech_metadata: {
              style: "Warm, clear, professional female receptionist voice. Natural pace, friendly and confident. Speak the transcript verbatim.",
            },
          }],
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { voice: "Kore" },
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message;
    throw new Error(`Gemini TTS failed (${response.status}): ${String(apiMessage || "request rejected").slice(0, 240)}`);
  }

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((part) => part?.inlineData?.data);
  if (!audioPart) throw new Error("Gemini TTS response contained no audio");
  const mimeType = String(audioPart.inlineData.mimeType || "audio/pcm").toLowerCase();
  if (mimeType.includes("wav")) {
    return resamplePcm16(Buffer.from(audioPart.inlineData.data, "base64"), 24000, 16000);
  }
  if (mimeType.includes("pcm") || mimeType.includes("l16")) {
    return resamplePcm16(Buffer.from(audioPart.inlineData.data, "base64"), 24000, 16000);
  }
  throw new Error(`Unsupported Gemini TTS audio format: ${mimeType}`);
}

async function startTestCall() {
  if (!state.sipRegistered) throw new Error("SIP is not registered yet");
  if (state.callInProgress) throw new Error("A test call is already in progress");

  state.callInProgress = true;
  state.lastError = null;
  let callSession;
  let timeout;
  let finished = false;

  const finish = async (hangup = false) => {
    if (finished) return;
    finished = true;
    if (timeout) clearTimeout(timeout);
    if (hangup && callSession) {
      try { await callSession.hangup(); } catch {}
    }
    state.callInProgress = false;
  };

  try {
    console.log("Starting one authorized test call to the configured destination.");
    // Generate audio before dialing so a TTS failure cannot leave a silent live call.
    const pcm = await generateGreetingPcm();
    callSession = await softphone.call(TEST_CALL_TO);

    timeout = setTimeout(() => {
      state.lastError = "Test call exceeded the 75-second safety limit";
      void finish(true);
    }, 75000);

    callSession.once("answered", async () => {
      try {
        console.log("Test call answered; generating/playing the CLST greeting.");
        if (finished) return;
        const streamer = callSession.streamAudio(pcm);
        streamer.once("finished", () => {
          console.log("Greeting playback finished; ending test call.");
          void finish(true);
        });
      } catch (error) {
        state.lastError = String(error?.message || "TTS/playback failed").slice(0, 300);
        console.error("Test call greeting failed:", state.lastError);
        await finish(true);
      }
    });

    callSession.once("non2xxResponse", ({ statusCode, reasonPhrase }) => {
      state.lastError = `Call not established: ${statusCode} ${reasonPhrase}`.slice(0, 300);
      console.error(state.lastError);
      void finish();
    });

    callSession.once("disposed", () => {
      console.log("Test call session disposed.");
      void finish();
    });
  } catch (error) {
    state.lastError = String(error?.message || "Could not start test call").slice(0, 300);
    await finish();
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      service: "CLST Trucking AI Voice",
      status: state.sipRegistered ? "ready" : state.registering ? "registering" : "not_registered",
      sipRegistered: state.sipRegistered,
      callInProgress: state.callInProgress,
      lastError: state.lastError,
      startedAt: state.startedAt,
    });
  }

  if (req.method !== "POST" || url.pathname !== "/test-call") {
    return json(res, 404, { error: "Not found" });
  }

  if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    await readBody(req);
    if (!state.sipRegistered) return json(res, 503, { error: "SIP is not registered yet" });
    if (state.callInProgress) return json(res, 409, { error: "A test call is already in progress" });
    void startTestCall().catch((error) => {
      state.lastError = String(error?.message || "Could not start test call").slice(0, 300);
      console.error("Test call failed:", state.lastError);
    });
    return json(res, 202, {
      accepted: true,
      message: "Test call started to the preconfigured destination. No production routing was changed.",
    });
  } catch (error) {
    return json(res, 400, { error: String(error?.message || "Invalid request").slice(0, 200) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CLST Trucking AI voice service listening on port ${PORT}`);
});

async function registerSip() {
  if (state.registering || state.sipRegistered) return;
  state.registering = true;
  try {
    await softphone.register();
    state.sipRegistered = true;
    state.lastError = null;
    console.log("SIP registered with RingCentral. Test-call endpoint is ready.");
  } catch (error) {
    state.lastError = String(error?.message || "SIP registration failed").slice(0, 300);
    console.error("SIP registration failed:", state.lastError);
  } finally {
    state.registering = false;
  }
}

softphone.on("signalingError", (error) => {
  state.sipRegistered = false;
  state.lastError = String(error?.message || "SIP signaling error").slice(0, 300);
  console.error("SIP signaling error:", state.lastError);
});

void registerSip();
const registrationRetry = setInterval(() => {
  if (!state.sipRegistered) void registerSip();
}, 30000);

async function shutdown(signal) {
  console.log("Shutting down voice service:", signal);
  clearInterval(registrationRetry);
  server.close();
  try { await softphone.revoke(); } catch {}
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
