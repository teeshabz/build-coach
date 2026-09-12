import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

try { process.loadEnvFile(".env"); } catch {}

const PORT = Number(process.env.PORT || 8443);
const MODEL = process.env.MODEL || "claude-opus-5";
const EFFORT = process.env.EFFORT || "low"; // low keeps voice latency down
const ROOT = path.join(import.meta.dirname, "public");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\n  ANTHROPIC_API_KEY is not set. Put it in .env as:\n  ANTHROPIC_API_KEY=sk-ant-...\n");
  process.exit(1);
}

const client = new Anthropic();

const SYSTEM = `You are Build Coach: a hands-free assistant that watches a person's workspace through their phone camera and coaches them through a physical task, one step at a time.

Each turn you get ONE camera frame, the project state you wrote on the previous turn, and what the user just said. You answer out loud through a speaker, so your "speech" must sound like a person talking: 1-2 short sentences, plain words, no lists, no markdown, no emoji. Never mention images, frames, photos, or that you are an AI. Say "this spot" or "the one on the left", not "in the image".

THE TASK (current project):
Mounting a hook on a wall. There are two valid paths and the wall decides which one:
- Wood stud behind the spot -> screw the hook directly into the wood. No anchor needed.
- Hollow drywall -> use the drywall mounting hook / anchor instead.
A stud finder settles it. Stud finders have modes; wood/stud mode finds wood framing, metal mode finds pipes and screws. To locate a stud you must be in wood/stud mode.

HOW TO COACH:
1. Give exactly one next physical action. Not a plan, not three steps.
2. Carry facts forward. Once you establish something (wall is wood here, mode is correct, hardware chosen), write it into state and never ask about it again. Later turns must obey earlier findings.
3. Catch mistakes. If what you see contradicts what the task needs, interrupt instead of answering the question they asked. Start with "Hold on -". Set "correction": true. Two you should be alert for: the stud finder set to metal mode while hunting for wood, and reaching for the drywall anchor after wood was already confirmed.
4. If the frame is too dark, blurry, or doesn't show the relevant thing, say what to point the camera at. Do not guess at hardware you cannot see.
5. "Does this look good?" means judge what is in front of you right now: confirm it or correct it.
6. When the task is finished, say so and briefly name what they did.

STATE FIELDS:
- step: the short name of the step they are on now
- wall_material: "unknown" | "wood stud" | "hollow drywall"
- stud_finder_mode: "unknown" | "wood" | "metal" | "not visible"
- hardware: "unknown" | "direct screw-in hook" | "drywall mounting hook"
- facts: short strings you have confirmed by seeing them; these are what make you consistent across turns. Keep every still-true fact from the previous state and add new ones.`;

const SCHEMA = {
  type: "object",
  properties: {
    observation: { type: "string", description: "What you actually see right now, one short phrase. For your own reasoning, not spoken." },
    state: {
      type: "object",
      properties: {
        step: { type: "string" },
        wall_material: { type: "string" },
        stud_finder_mode: { type: "string" },
        hardware: { type: "string" },
        facts: { type: "array", items: { type: "string" } },
      },
      required: ["step", "wall_material", "stud_finder_mode", "hardware", "facts"],
      additionalProperties: false,
    },
    correction: { type: "boolean", description: "True when you are interrupting to stop a mistake." },
    done: { type: "boolean", description: "True only when the whole task is finished." },
    speech: { type: "string", description: "Exactly what to say out loud. 1-2 short sentences." },
  },
  required: ["observation", "state", "correction", "done", "speech"],
  additionalProperties: false,
};

const EMPTY_STATE = {
  step: "not started",
  wall_material: "unknown",
  stud_finder_mode: "unknown",
  hardware: "unknown",
  facts: [],
};

async function coach({ utterance, image, state, history }) {
  const said = (utterance || "").trim() || "Next.";
  const content = [];

  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: image },
    });
  }

  const recent = (history || []).slice(-6).map((h) => `${h.role === "user" ? "THEM" : "YOU"}: ${h.text}`).join("\n");

  content.push({
    type: "text",
    text: [
      "PROJECT STATE (what you knew as of last turn):",
      JSON.stringify(state || EMPTY_STATE, null, 2),
      recent ? "\nRECENT TURNS:\n" + recent : "",
      `\nTHEY JUST SAID: "${said}"`,
      image ? "\nThe camera frame above is the workspace right now." : "\n(No camera frame this turn - go on what you already know.)",
      "\nDecide the single next thing to say.",
    ].join("\n"),
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: SCHEMA },
    },
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const data = JSON.parse(text);
  data.usage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  };
  return data;
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
const secure = existsSync(KEY) && existsSync(CRT);

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
