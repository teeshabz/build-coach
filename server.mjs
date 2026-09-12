import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { coach, references, MODEL, EFFORT } from "./coach.mjs";

try { process.loadEnvFile(".env"); } catch {}

const PORT = Number(process.env.PORT || 8443);
const ROOT = path.join(import.meta.dirname, "public");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n  ANTHROPIC_API_KEY is not set. Put it in .env as:\n  ANTHROPIC_API_KEY=sk-ant-...\n");
  process.exit(1);
}

/* Every turn is written to sessions/<run>/ - the jsonl for reading back what
   happened, the frames so a turn it got wrong can become a replay fixture.
   Stays on this machine; RECORD=0 turns it off. */
const RECORDING = process.env.RECORD !== "0";
const SESSIONS = path.join(import.meta.dirname, "sessions");
const turnNo = new Map();

async function record(run, payload, result, ms) {
  if (!RECORDING || !run) return;
  const dir = path.join(SESSIONS, run.replace(/[^0-9a-zA-Z_-]/g, ""));
  const n = (turnNo.get(run) || 0) + 1;
  turnNo.set(run, n);
  try {
    await mkdir(dir, { recursive: true });
    const frame = payload.image ? `${String(n).padStart(2, "0")}-frame.jpg` : null;
    if (frame) await writeFile(path.join(dir, frame), Buffer.from(payload.image, "base64"));
    await appendFile(path.join(dir, "turns.jsonl"), JSON.stringify({
      n, at: new Date().toISOString(), ms, frame,
      said: payload.utterance,
      observation: result.observation,
      speech: result.speech,
      correction: result.correction,
      done: result.done,
      state: result.state,
    }) + "\n");
  } catch (err) {
    console.error("  (recording failed:", err.message + ")");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  // served as a cert so iOS offers to install it, for when tapping through
  // the warning isn't enough to unlock the camera
  ".pem": "application/x-x509-ca-cert",
};

async function handler(req, res) {
  if (req.method === "POST" && req.url === "/api/next") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const started = Date.now();
      try {
        const payload = JSON.parse(body);
        const result = await coach(payload);
        const ms = Date.now() - started;
        const s = result.state;
        console.log(
          `\n[${ms}ms] ${payload.image ? "frame" : "BLIND"}  THEM: ${payload.utterance}\n` +
          `  saw:   ${result.observation}\n` +
          `  says:  ${result.correction ? "** CORRECTION ** " : ""}${result.done ? "** DONE ** " : ""}${result.speech}\n` +
          `  state: ${s.step} | wall ${s.wall_material} | mode ${s.stud_finder_mode} | ${s.hardware}\n` +
          `  facts: ${(s.facts || []).join(" / ") || "-"}`
        );
        await record(payload.run, payload, result, ms);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...result, ms }));
      } catch (err) {
        console.error("coach failed:", err?.message || err);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err?.message || err) }));
      }
    });
    return;
  }

  const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}

const KEY = path.join(import.meta.dirname, "certs", "key.pem");
const CRT = path.join(import.meta.dirname, "certs", "cert.pem");
const secure = !process.env.INSECURE && existsSync(KEY) && existsSync(CRT);

const server = secure
  ? createHttpsServer({ key: await readFile(KEY), cert: await readFile(CRT) }, handler)
  : createHttpServer(handler);

const lan = Object.values(networkInterfaces()).flat().find((i) => i?.family === "IPv4" && !i.internal)?.address;

server.listen(PORT, async () => {
  const scheme = secure ? "https" : "http";
  console.log(`\n  Build Coach  (model: ${MODEL}, effort: ${EFFORT})`);
  console.log(`  this mac:  ${scheme}://localhost:${PORT}`);
  if (lan) console.log(`  your phone: ${scheme}://${lan}:${PORT}`);
  if (!secure) console.log(`\n  No cert found - running plain HTTP. iOS Safari will NOT grant camera access.\n  Run:  npm run cert\n`);
  else console.log(`\n  Self-signed cert: Safari will warn once. Show Details -> visit this website.\n`);

  const { labels } = await references();
  console.log(labels.length
    ? `  reference photos: ${labels.join(", ")}`
    : `  reference photos: none - drop labeled photos of your gear in reference/ (see reference/README.txt)`);
});
