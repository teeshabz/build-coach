import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { coach, MODEL, EFFORT } from "./coach.mjs";

try { process.loadEnvFile(".env"); } catch {}

const PORT = Number(process.env.PORT || 8443);
const ROOT = path.join(import.meta.dirname, "public");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n  ANTHROPIC_API_KEY is not set. Put it in .env as:\n  ANTHROPIC_API_KEY=sk-ant-...\n");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
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
        console.log(`[${ms}ms] "${(payload.utterance || "").slice(0, 40)}" -> ${result.correction ? "CORRECTION " : ""}${result.speech}`);
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

server.listen(PORT, () => {
  const scheme = secure ? "https" : "http";
  console.log(`\n  Build Coach  (model: ${MODEL}, effort: ${EFFORT})`);
  console.log(`  this mac:  ${scheme}://localhost:${PORT}`);
  if (lan) console.log(`  your phone: ${scheme}://${lan}:${PORT}`);
  if (!secure) console.log(`\n  No cert found - running plain HTTP. iOS Safari will NOT grant camera access.\n  Run:  npm run cert\n`);
  else console.log(`\n  Self-signed cert: Safari will warn once. Show Details -> visit this website.\n`);
});
