import "dotenv/config";
import Softphone from "ringcentral-softphone";
import WebSocket from "ws";
import { createServer } from "node:http";

const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-mini";
const voice = process.env.OPENAI_REALTIME_VOICE?.trim() || "marin";
const enabled = process.env.ENABLE_INBOUND_GREETING === "true";
const companyName = process.env.COMPANY_NAME || "CLST Trucking LLC";
const greeting = process.env.INBOUND_GREETING?.trim() ||
  `Thank you for calling ${companyName}. How can I help you today?`;
const required = ["SIP_INFO_DOMAIN", "SIP_INFO_OUTBOUND_PROXY", "SIP_INFO_USERNAME", "SIP_INFO_PASSWORD", "SIP_INFO_AUTHORIZATION_ID"];
let sipRegistered = false;

if (!enabled) {
  console.error("Test disabled. Set ENABLE_INBOUND_GREETING=true in .env.");
  process.exit(1);
}
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length || !apiKey) {
  console.error("Missing configuration:", [...missing, ...(!apiKey ? ["OPENAI_API_KEY"] : [])].join(", "));
  process.exit(1);
}

const SIP_RATE = 16000;
const OPENAI_RATE = 24000;
const BYTES_PER_SAMPLE = 2;
const SYSTEM_PROMPT = `You are the friendly, professional voice receptionist for ${companyName}. Speak naturally and briefly, primarily in English, but reply in the caller's language if they use another language. Ask how you can help and, when useful, whether the caller is a broker, driver, or another caller. Never invent shipment, rate, appointment, driver-location, or ETA facts. You do not have access to Gmail, dispatch records, or live ELD data, so never claim to verify them. If the caller asks for a person or a decision you cannot make, politely explain that a company representative must help. Do not claim you transferred the call. Keep replies concise and conversational.`;

function resamplePcm16(input, sourceRate, targetRate) {
  if (!Buffer.isBuffer(input) || input.length < 2) return Buffer.alloc(0);
  const usable = input.length - input.length % 2;
  if (sourceRate === targetRate) return input.subarray(0, usable);
  const samples = usable / 2;
  const outCount = Math.max(1, Math.floor(samples * targetRate / sourceRate));
  const output = Buffer.alloc(outCount * 2);
  for (let i = 0; i < outCount; i++) {
    const pos = i * sourceRate / targetRate;
    const leftIndex = Math.min(Math.floor(pos), samples - 1);
    const rightIndex = Math.min(leftIndex + 1, samples - 1);
    const fraction = pos - leftIndex;
    const left = input.readInt16LE(leftIndex * 2);
    const right = input.readInt16LE(rightIndex * 2);
    const sample = Math.round(left + (right - left) * fraction);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return output;
}

function sendEvent(ws, event) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(event));
  return true;
}

function connectRealtime() {
  return new Promise((resolve, reject) => {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 15000 });
    const timeout = setTimeout(() => {
      cleanup();
      try { ws.close(); } catch {}
      reject(new Error("OpenAI Realtime connection timed out."));
    }, 20000);
    const onError = (error) => { cleanup(); reject(error); };
    const onMessage = (data) => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === "error") {
        cleanup();
        reject(new Error(event.error?.message || "OpenAI Realtime returned an error."));
        try { ws.close(); } catch {}
      } else if (event.type === "session.updated") {
        cleanup();
        console.log(`OpenAI Realtime connected: model=${model}, voice=${voice}`);
        resolve(ws);
      }
    };
    function cleanup() {
      clearTimeout(timeout);
      ws.off("error", onError);
      ws.off("message", onMessage);
    }
    ws.once("error", onError);
    ws.on("message", onMessage);
    ws.once("open", () => {
      sendEvent(ws, {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: SYSTEM_PROMPT,
          output_modalities: ["audio"],
          audio: {
            input: {
              format: { type: "audio/pcm", rate: OPENAI_RATE },
              noise_reduction: { type: "near_field" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.55,
                prefix_padding_ms: 300,
                silence_duration_ms: 650,
                create_response: true,
                interrupt_response: false
              }
            },
            output: {
              format: { type: "audio/pcm", rate: OPENAI_RATE },
              voice
            }
          }
        }
      });
    });
  });
}

function playPcm(session, pcm) {
  if (!pcm.length || session.disposed) return Promise.resolve();
  const streamer = session.streamAudio(pcm);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { streamer.stop?.(); } catch {}
      resolve();
    }, Math.max(12000, pcm.length / (SIP_RATE * BYTES_PER_SAMPLE) * 1000 + 6000));
    const finish = () => { clearTimeout(timeout); resolve(); };
    streamer.once("finished", finish);
    streamer.once("disposed", finish);
    streamer.once("error", (error) => { clearTimeout(timeout); reject(error); });
  });
}

async function main() {
  const softphone = new Softphone({
    domain: process.env.SIP_INFO_DOMAIN.trim(),
    outboundProxy: process.env.SIP_INFO_OUTBOUND_PROXY.trim(),
    username: process.env.SIP_INFO_USERNAME.trim(),
    password: process.env.SIP_INFO_PASSWORD.trim(),
    authorizationId: process.env.SIP_INFO_AUTHORIZATION_ID.trim(),
    codec: "OPUS/16000"
  });
  let activeCall = false;
  const healthServer = createServer((req, res) => {
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (pathname !== "/health") {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const payload = JSON.stringify({ service: "CLST Mare Voice", status: sipRegistered ? "ok" : "starting", sipRegistered, aiProvider: "openai" });
    res.writeHead(sipRegistered ? 200 : 503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(payload);
  });
  healthServer.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log("Health endpoint listening."));

  softphone.enableDebugMode?.();
  softphone.on("signalingError", (error) => console.error("RingCentral signaling error:", error?.message || error));
  softphone.on("registrationError", (error) => console.error("RingCentral registration error:", error?.message || error));
  softphone.on("registered", () => { sipRegistered = true; console.log("RingCentral SIP registered; waiting for calls."); });

  softphone.on("invite", async (inviteMessage) => {
    if (activeCall) {
      console.warn("AI line busy; declining additional incoming call.");
      try { await softphone.decline(inviteMessage); }
      catch (error) { console.error("Decline failed:", error?.message || error); }
      return;
    }
    activeCall = true;
    let session;
    let realtime;
    let disposed = false;
    let responseInProgress = false;
    let speaking = true;
    let outputChunks = [];
    let playbackQueue = Promise.resolve();
    let inboundFrames = 0;
    let lastDiagnostic = 0;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      activeCall = false;
      try { realtime?.close(); } catch {}
      console.log("Call ended.");
    };

    try {
      console.log("Incoming call detected; answering...");
      session = await softphone.answer(inviteMessage);
      session.once("disposed", cleanup);
      realtime = await connectRealtime();

      realtime.on("message", (data) => {
        let event;
        try { event = JSON.parse(data.toString()); } catch { return; }
        if (event.type === "error") {
          console.error("OpenAI Realtime error:", event.error?.message || JSON.stringify(event.error));
          return;
        }
        if (event.type === "response.created") {
          responseInProgress = true;
          outputChunks = [];
        } else if (event.type === "response.output_audio.delta" && event.delta) {
          outputChunks.push(Buffer.from(event.delta, "base64"));
        } else if (event.type === "response.output_audio_transcript.done" && event.transcript) {
          console.log("AI:", event.transcript);
        } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
          console.log("Caller:", event.transcript);
        } else if (event.type === "response.done") {
          responseInProgress = false;
          const audio24k = outputChunks.length ? Buffer.concat(outputChunks) : Buffer.alloc(0);
          outputChunks = [];
          if (!audio24k.length || disposed) {
            speaking = false;
            return;
          }
          const audio16k = resamplePcm16(audio24k, OPENAI_RATE, SIP_RATE);
          speaking = true;
          playbackQueue = playbackQueue
            .then(() => playPcm(session, audio16k))
            .catch((error) => console.error("Audio playback failed:", error?.message || error))
            .finally(() => { speaking = false; });
        } else if (event.type === "session.updated") {
          console.log("OpenAI session settings confirmed.");
        }
      });
      realtime.on("error", (error) => console.error("OpenAI WebSocket error:", error?.message || error));
      realtime.on("close", (code, reason) => {
        if (!disposed) console.warn(`OpenAI WebSocket closed: ${code} ${reason?.toString() || ""}`);
      });

      // This SDK event is decoded PCM at OPUS/16000. Do not treat audioPacket RTP payload as PCM.
      session.on("audio", (audio) => {
        if (disposed || speaking || responseInProgress || !Buffer.isBuffer(audio) || audio.length < 2) return;
        inboundFrames++;
        const now = Date.now();
        if (now - lastDiagnostic >= 3000) {
          lastDiagnostic = now;
          console.log(`Inbound PCM frames=${inboundFrames}, bytes=${audio.length}`);
        }
        const pcm24k = resamplePcm16(audio, SIP_RATE, OPENAI_RATE);
        if (pcm24k.length) sendEvent(realtime, { type: "input_audio_buffer.append", audio: pcm24k.toString("base64") });
      });

      console.log("Call answered. Sending company greeting...");
      sendEvent(realtime, {
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: `Say this greeting exactly, warmly and naturally: ${greeting}`
        }
      });
      console.log("OpenAI voice receptionist ready. Audio diagnostics enabled.");
    } catch (error) {
      console.error("Inbound call handling failed:", error?.message || error);
      try { if (session) await session.hangup(); } catch {}
      cleanup();
    }
  });

  console.log("Starting CLST Trucking OpenAI inbound voice service...");
  try {
    await softphone.register();
    sipRegistered = true;
  } catch (error) {
    console.error("SIP registration failed:", error?.message || error);
    process.exitCode = 1;
  }
  const stop = async () => {
    console.log("Stopping voice service...");
    sipRegistered = false;
    try { await softphone.unregister?.(); } catch {}
    try { healthServer.close(); } catch {}
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  console.error("Fatal startup error:", error?.message || error);
  process.exit(1);
});