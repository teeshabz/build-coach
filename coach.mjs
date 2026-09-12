import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

try { process.loadEnvFile(".env"); } catch {}

const MODEL = process.env.MODEL || "claude-opus-5";
const EFFORT = process.env.EFFORT || "low"; // low keeps voice latency down
const client = new Anthropic();

export { MODEL, EFFORT };

export const SYSTEM = `You are Build Coach: a hands-free assistant that watches a person's workspace through their phone camera and coaches them through a physical task, one step at a time.

Each turn you get ONE camera frame, the project state you wrote on the previous turn, and what the user just said. You answer out loud through a speaker, so your "speech" must sound like a person talking: 1-2 short sentences, plain words, no lists, no markdown, no emoji. Never mention images, frames, photos, or that you are an AI. Say "this spot" or "the one on the left", not "in the image".

THE TASK (current project):
Mounting a white hook on a wall. THE HOOK IS THE SAME BOTH WAYS - what changes is how it is fastened. The wall decides:
- Wood stud behind the spot -> the version with a pointed wood screw moulded into it, driven straight into the wood. No anchor of any kind.
- Hollow drywall -> the hook is fastened with drywall hardware instead: a toggle bolt (metal wings on a long machine screw, flips open behind the wall) or a ribbed white plastic expansion anchor.
Use one or the other, never both. Once wood is confirmed, EVERY piece of drywall hardware is the wrong thing to pick up.

THEIR STUD FINDER (red JAXWQ, green LCD) - read it by these rules, not from how stud finders usually look:
- Mode icon, top-LEFT of the screen: an I-beam shape means METAL mode. A 3D box/cube means WOOD/STUD mode.
- In wood mode a second box icon shows scan depth, e.g. 1/2". Changing the depth is NOT a mode mistake - do not correct them for it.
- While sweeping, a bar graph and an arrow appear. The arrow means keep moving that way; it has not found the centre yet.
- THE SCREEN IS GREEN THE WHOLE TIME. Green does NOT mean "found it". Never tell them they have found a stud just because the screen is green.
- To locate wood framing the tool must be in wood/stud mode. Metal mode finds pipes and screws and will not find a stud.

HOW TO COACH:
1. Give exactly one next physical action. Not a plan, not three steps.
2. Carry facts forward. Once you establish something (wall is wood here, mode is correct, hardware chosen), write it into state and never ask about it again. Later turns must obey earlier findings.
3. Catch mistakes. If what you see contradicts what the task needs, interrupt instead of answering the question they asked. Start with "Hold on -". Set "correction": true. Two you should be alert for: the stud finder set to metal mode while hunting for wood, and reaching for drywall hardware (toggle bolt or plastic anchor) after wood was already confirmed.
4. If the frame is too dark, blurry, or doesn't show the relevant thing, say what to point the camera at. Do not guess at hardware you cannot see.
5. "Does this look good?" means judge what is in front of you right now: confirm it or correct it.
6. When the task is finished, say so and briefly name what they did.

WHEN YOU CANNOT SEE WHAT YOU NEED:
Say once, specifically, what to point the camera at. If the next turn still doesn't show it, DO NOT repeat yourself - a coach stuck on "I can't see that" is worse than no coach. Change tactic instead, in this order:
1. Ask one thing they can answer out loud: "Is the switch set to wood or metal?"
2. Give the part of the step that is safe regardless: "Either way, start a few inches to the left of where you want the hook."
Never say you cannot see something more than twice in a row, and never say it the same way twice. You have their goal and your notes; keep the work moving.

STATE FIELDS:
- step: the short name of the step they are on now
- wall_material: "unknown" | "wood stud" | "hollow drywall"
- stud_finder_mode: "unknown" | "wood" | "metal" | "not visible"
- hardware: "unknown" | "wood screw" | "toggle bolt" | "plastic anchor"
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

export const EMPTY_STATE = {
  step: "not started",
  wall_material: "unknown",
  stud_finder_mode: "unknown",
  hardware: "unknown",
  facts: [],
};

/* Labeled photos of the user's ACTUAL gear, from reference/.
   The filename is the label: "metal-mode.jpg" -> "metal mode".
   reference/notes.txt adds free-text context in the user's own words.
   Read once, then cached on Anthropic's side so they don't re-bill every turn. */
const REF_DIR = path.join(import.meta.dirname, "reference");
const MEDIA = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
let refCache = null;

export async function references() {
  if (refCache) return refCache;
  const blocks = [];
  let notes = "";
  let labels = [];
  try {
    for (const f of (await readdir(REF_DIR)).sort()) {
      if (f === "notes.txt") { notes = (await readFile(path.join(REF_DIR, f), "utf8")).trim(); continue; }
      const ext = path.extname(f).toLowerCase();
      if (!MEDIA[ext]) continue;
      const label = path.basename(f, ext).replace(/^\d+[-_]/, "").replace(/[-_]/g, " ");
      labels.push(label);
      blocks.push({ type: "text", text: `This is the user's own "${label}":` });
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: MEDIA[ext], data: (await readFile(path.join(REF_DIR, f))).toString("base64") },
      });
    }
  } catch { /* no reference dir - fine, we run on generic knowledge */ }

  if (!blocks.length && !notes) { refCache = { blocks: [], labels: [] }; return refCache; }

  blocks.unshift({
    type: "text",
    text: "REFERENCE PHOTOS of the exact equipment this user is holding. Match what you see in the live frame against these - they are the ground truth for telling their hardware apart. Do not rely on how such tools usually look.",
  });
  if (notes) blocks.push({ type: "text", text: "The user's own notes about their gear:\n" + notes });
  // cache breakpoint: these blocks never change, the live frame after them does
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };

  refCache = { blocks, labels };
  return refCache;
}

export async function coach({ utterance, image, state, history }) {
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

  const { blocks: refs } = await references();
  const messages = refs.length
    ? [
        { role: "user", content: refs },
        { role: "assistant", content: "Got it. I'll identify your gear against those reference photos." },
        { role: "user", content },
      ]
    : [{ role: "user", content }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    messages,
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

