// Replay the demo script through the real reasoning loop.
//   node scripts/replay.mjs
// Drops in fixtures/NN-*.jpg when they exist, otherwise runs the turn blind
// (which still exercises state threading, just not the vision half).
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { coach, EMPTY_STATE, MODEL, EFFORT } from "../coach.mjs";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");

const SCRIPT = [
  { frame: "01-scene",           say: "My goal is to put up a hook in the wall but I'm not sure where to drill and how to do it. I'm using these hooks and I have this stud finder." },
  { frame: "02-holding-finder",  say: "What next?" },
  { frame: "03-metal-mode",      say: "Does this look good?", expect: "correction", why: "stud finder is in METAL mode while hunting for wood" },
  { frame: "04-wood-mode",       say: "Okay. Next." },
  { frame: "05-stud-found",      say: "Next." },
  { frame: "06-center",          say: "Next." },
  { frame: "07-reaching-anchor", say: "Next.", expect: "correction", why: "reaching for the drywall anchor after wood was confirmed" },
  { frame: "08-hook-placed",     say: "Next." },
  { frame: "09-tightening",      say: "Next." },
  { frame: "10-finished",        say: "Done?", expect: "done" },
];

async function frameFor(name) {
  for (const ext of [".jpg", ".jpeg", ".png", ".heic"]) {
    const p = path.join(FIXTURES, name + ext);
    if (existsSync(p)) return (await readFile(p)).toString("base64");
  }
  return null;
}

let state = EMPTY_STATE;
let history = [];
let missing = 0;
let failures = [];
const times = [];

console.log(`\nreplaying demo script  (model ${MODEL}, effort ${EFFORT})\n`);

for (const [i, turn] of SCRIPT.entries()) {
  const image = await frameFor(turn.frame);
  if (!image) missing++;
  const started = Date.now();
  const r = await coach({ utterance: turn.say, image, state, history });
  const ms = Date.now() - started;
  times.push(ms);

  state = r.state;
  history.push({ role: "user", text: turn.say }, { role: "agent", text: r.speech });

  const tag = r.correction ? "CORRECTION" : r.done ? "DONE" : "          ";
  console.log(`${String(i + 1).padStart(2)}. ${image ? "[frame]" : "[blind]"} THEM: ${turn.say}`);
  console.log(`    ${tag}  ${r.speech}`);
  console.log(`    saw: ${r.observation}`);
  console.log(`    state: ${state.wall_material} | mode ${state.stud_finder_mode} | ${state.hardware}  (${ms}ms)`);

  if (turn.expect === "correction" && !r.correction) {
    failures.push(`turn ${i + 1}: expected a correction (${turn.why}) but it played along`);
    console.log(`    ^^ MISS: should have corrected - ${turn.why}`);
  }
  if (turn.expect === "done" && !r.done) {
    failures.push(`turn ${i + 1}: expected done=true at the end`);
    console.log(`    ^^ MISS: never marked the task finished`);
  }
  console.log();
}

const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
console.log(`avg ${avg}ms, slowest ${Math.max(...times)}ms`);
if (missing) console.log(`${missing}/${SCRIPT.length} frames missing from fixtures/ - those turns ran blind`);
console.log(failures.length ? `\n${failures.length} FAILURES:\n` + failures.map((f) => "  - " + f).join("\n") : "\nall expectations met");
