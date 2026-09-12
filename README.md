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
