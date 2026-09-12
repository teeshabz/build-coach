// Read back recorded runs.
//   node scripts/review.mjs                          list runs
//   node scripts/review.mjs <run>                    print that run's turns
//   node scripts/review.mjs <run> <turn> <name>      promote that turn's frame
//                                                    into fixtures/<name>.jpg
import { readdir, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const SESSIONS = path.join(import.meta.dirname, "..", "sessions");
const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");
const [run, turn, name] = process.argv.slice(2);

if (!existsSync(SESSIONS)) {
  console.log("No runs recorded yet - sessions/ doesn't exist.");
  process.exit(0);
}

if (!run) {
  const runs = (await readdir(SESSIONS)).sort();
  if (!runs.length) console.log("No runs recorded yet.");
  for (const r of runs) {
    const lines = (await readFile(path.join(SESSIONS, r, "turns.jsonl"), "utf8")).trim().split("\n");
    const turns = lines.map((l) => JSON.parse(l));
    const corrections = turns.filter((t) => t.correction).length;
    console.log(`${r}  ${turns.length} turns, ${corrections} corrections, ${turns.some((t) => t.done) ? "finished" : "unfinished"}`);
  }
  process.exit(0);
}

const file = path.join(SESSIONS, run, "turns.jsonl");
const turns = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));

if (turn && name) {
  const t = turns.find((x) => String(x.n) === String(turn));
  if (!t?.frame) { console.error(`turn ${turn} has no frame`); process.exit(1); }
  await copyFile(path.join(SESSIONS, run, t.frame), path.join(FIXTURES, name + ".jpg"));
  console.log(`fixtures/${name}.jpg  <-  run ${run} turn ${turn}`);
  console.log(`they said: "${t.said}"`);
  console.log(`it said:   "${t.speech}"`);
  process.exit(0);
}

for (const t of turns) {
  const tag = t.correction ? "CORRECTION" : t.done ? "DONE      " : "          ";
  console.log(`${String(t.n).padStart(2)}. ${t.frame ? "[frame]" : "[blind]"} ${t.ms}ms  THEM: ${t.said}`);
  console.log(`    ${tag}  ${t.speech}`);
  console.log(`    saw: ${t.observation}`);
  console.log(`    ${t.state.wall_material} | mode ${t.state.stud_finder_mode} | ${t.state.hardware}\n`);
}
