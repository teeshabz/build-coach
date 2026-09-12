# Build Coach

Hands-free visual coach for physical work. Point your phone at what you're doing,
say "next", and it looks at the current frame, remembers what it already learned,
and tells you the one next thing to do.

Demo task: mounting a wall hook — wood stud (screw straight in) vs hollow drywall
(use the anchor). The agent has to figure out which, and hold onto that decision.

## Run it

```sh
npm install
npm run cert                 # self-signed cert; iOS needs https for camera
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm start
```

Open the `your phone:` URL printed at startup on your iPhone, on the same wifi.
Safari will warn about the certificate once: **Show Details → visit this website**.

## How a turn works

```
"next"  →  grab one camera frame
        →  Claude (frame + project state + last few turns)
        →  { speech, updated state, correction? }
        →  spoken aloud, state panel updates
```

State is the point: once the agent has confirmed "wood behind this spot", that fact
rides along on every later turn, which is what lets it catch you reaching for the
drywall anchor two steps later.

## Knobs

- `MODEL` — defaults to `claude-opus-5`. `claude-sonnet-5` is faster if latency hurts.
- `EFFORT` — defaults to `low` for voice latency. `medium` reasons harder, responds slower.
- Buttons (`Next`, `How's this?`) do the same thing as the voice phrases — a fallback
  for a loud room or if iOS speech recognition drops out.

## Testing without a wall

```sh
node scripts/replay.mjs
```

Runs the ten-turn demo script through the real reasoning loop and checks the two
planted mistakes get caught. Drop photos in `fixtures/` named `01-scene.jpg`,
`03-metal-mode.jpg`, `07-reaching-anchor.jpg` (etc. — see the script) and those
turns run against real frames instead of blind.

## Recorded runs

Every turn is written to `sessions/<run>/` — a `turns.jsonl` of what was said,
seen, and decided, plus the frame that was sent. Local only; `RECORD=0` disables.

```sh
node scripts/review.mjs                      # list runs
node scripts/review.mjs 2026-09-12-13-15-04  # replay one, turn by turn
node scripts/review.mjs <run> 7 03-metal-mode   # promote a frame to a fixture
```

That last one is the point: when it gets a turn wrong on camera, promote that
exact frame into `fixtures/` and it becomes a regression test for the next
prompt change.
