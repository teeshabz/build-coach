# Build Coach

**An agent that stands next to you while you work with your hands.**

Point your phone at what you're doing and talk to it. It watches through the
camera, remembers what it has already established, and tells you the one next
thing to do — out loud, so you never put the tools down.

Tutorials assume the world follows the instructions. Build Coach looks at what
actually happened and changes what it says next.

---

## The moment this is built around

Mounting a hook. The wall decides how it's fastened: into a wood stud you drive
the screw straight in; into hollow drywall you need a toggle bolt or an anchor.
A stud finder settles it.

Seven turns into a real run:

```
5. [frame]  "Next."
   saw:   wood mode, bar graph with sideways arrow, no CENTER
          "That arrow just means keep going right - it hasn't locked on yet."

6. [frame]  "Next."
   saw:   CENTER shown with solid up arrow, wood mode
          "That's it - CENTER means you're right over the stud. Pencil a mark."
   state: wood stud | wood screw

7. [frame]  "Next."
   saw:   hand holding toggle bolt and plastic anchor
   ** CORRECTION **
          "Hold on - put those down, you've got wood behind that mark so no
           anchors at all. Grab the hook with the pointed screw."
```

**The stud finder is not in frame on turn 7.** Nothing visible says "wood."
It stops you because of something it learned two turns ago and wrote down.

That is the whole thesis. A chatbox can tell you how to hang a hook. It cannot
notice that the thing in your hand contradicts what it watched you discover.

---

## Why the environment is the point

The agent is in the room, and that changes what it is able to do:

- **Your hands are busy.** Typing, or stopping to photograph something and
  explain it, is the entire friction this removes. You say "next".
- **The camera supplies context you'd otherwise have to describe.** You never
  tell it which tool you're holding or which step you're on.
- **It accumulates.** Each frame is read against everything already established,
  so a decision made at the wall constrains what's correct three steps later.
- **It can catch you.** Not "here are the steps" but "not that one, and here's
  why" — only possible because it saw the earlier state.

Take the room away and there is no product left.

---

## How a turn works

```
you speak  ─→  fragments buffered until you actually stop (1.4s)
           ─→  one camera frame captured
           ─→  Claude Opus 5  ←── your reference photos (cached)
                              ←── the project state from last turn
                              ←── the last few exchanges
           ─→  { speech, updated state, correction?, done? }
           ─→  spoken aloud, state panel updates on screen
```

Two phases, and the agent decides when to move between them:

**intake** — it asks what you're building, where it goes (a wall and a ceiling
have different answers), and asks to *see* your hardware. It reads the hardware
off the frame, says the plan back including the fork the surface decides, then
switches itself into build mode. The phase is on screen and flashes when it
flips.

**build** — one physical action per turn, corrections when what it sees
contradicts what it knows.

State is a small JSON object the model rewrites every turn — goal, surface,
wall material, stud finder mode, chosen hardware, and a list of facts it has
confirmed by eye. It is visible on screen during the demo, because the state is
the mechanism, not an implementation detail.

---

## Grounding it in the user's actual gear

Generic knowledge of "a stud finder" is not enough to read *this* stud finder.
`reference/` holds labeled photos of the real kit; the filename is the label.
They ride along with every turn behind a cache breakpoint, so they cost roughly
one turn's tokens per session rather than one per turn.

This caught a failure that would have sunk the demo. On this tool the screen is
**green the whole time** — idle, sweeping, and centred alike. Without the
reference photos the model read green-plus-bars as success and announced a stud
mid-sweep. It now only says "found it" on the literal word **CENTER**, because
it has been shown what that looks like.

`reference/notes.txt` carries the things a photo can't: that the hook is the
same either way and only the fastening changes, that changing scan depth is not
a mode error, that a sideways arrow means keep moving.

---

## Failure handling

A demo agent fails in front of people. These are the ways this one is built not to:

| Failure | What it does |
|---|---|
| Can't see what it needs | Says once what to point at. Next turn it *changes tactic* — asks something answerable out loud, then gives the part of the step that's safe either way. Never repeats itself twice. |
| Speech recognition cuts you off | Chrome finalises on any pause, so "should I drill in the screw" arrives in two pieces. Fragments are buffered and sent after real silence. |
| You keep talking mid-request | The in-flight request is aborted and superseded, rather than two answers racing to the screen. |
| Mic picks up the room | One tap to Pause, one to Listen. Buttons do everything the voice does, so a dead mic downgrades the demo instead of ending it. |
| Ambiguous evidence | It refuses to conclude. It will not call a stud off a colour, a bar graph, or an arrow. |
| Network changes | The certificate is pinned to the LAN IP; startup notices when that's stale and reissues it. |

The escalation ladder came from a recorded run that stalled for eight turns
repeating "I still can't see anything." The speech buffering came from
transcripts showing turns like `"should I drill in the scre"`. Both were found
by reading recordings, not by guessing.

---

## Testing a camera agent without a wall

```sh
node scripts/replay.mjs
```

Replays the full demo as scripted turns against the real model and **asserts on
behaviour**: the metal-mode mistake must produce a correction, reaching for the
anchor after wood must produce a correction, the last turn must report done.
Frames come from `fixtures/` when present, and turns run blind when they aren't
— which is itself a test, since a coach that can't see still has to be useful.

Every live run is recorded to `sessions/<run>/` — what you said, what it saw,
what it said, the state it wrote, latency, and **the frame itself**.

```sh
node scripts/review.mjs                          # list runs
node scripts/review.mjs <run>                    # read one back, turn by turn
node scripts/review.mjs <run> 7 03-metal-mode    # promote that frame to a fixture
```

That last command is the loop that matters: when it gets something wrong on a
real camera, that exact blurry frame becomes a regression test. Prompt changes
are then measured against what actually broke, not against staged photos.

---

## Running it

```sh
npm install
npm run cert                              # self-signed; iOS needs https for camera
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm start
```

Open the `your phone:` URL it prints, on the same network. Safari warns about
the certificate once: **Show Details → visit this website**. If it still refuses
the camera, visit `/cert.pem`, install it under Settings → General → VPN &
Device Management, and enable it under Certificate Trust Settings.

On corporate or venue wifi, devices are often forbidden from talking to each
other. A phone hotspot with the Mac joined to it sidesteps that entirely; the
certificate reissues itself for the new address.

To work on it without a phone, `INSECURE=1 npm start` serves plain HTTP —
`localhost` is a secure context, so the whole loop runs on a laptop webcam.

| Env | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required |
| `MODEL` | `claude-opus-5` | `claude-sonnet-5` is faster |
| `EFFORT` | `low` | keeps voice latency down |
| `INSECURE` | unset | force plain HTTP for laptop testing |
| `RECORD` | on | `0` disables session recording |

---

## Layout

```
coach.mjs            the agent: prompt, state schema, reference grounding
server.mjs           static files, /api/next, recording, certificate handling
public/index.html    camera, speech in and out, live state panel
reference/           labeled photos of the real gear + notes
fixtures/            frames the replay harness tests against
scripts/replay.mjs   run the demo against the model, assert on behaviour
scripts/review.mjs   read recorded runs, promote a frame to a fixture
```

One model call per turn. No framework, no orchestration layer, no database —
the state lives in the schema and travels with the conversation.

---

## Built during the hackathon

Every line, from an empty directory. The git history is the record: first commit
to last, all inside the event, with the reference photos shot on the day against
the actual hook and stud finder.
