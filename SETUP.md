# Running ConvoScape

```bash
npm install
cp .env.example .env.local     # then paste your key into it
npm run dev
```

Open http://localhost:3000.

## The API key

Get one free at https://aistudio.google.com/apikey, then put it in `.env.local`:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

`.env.local` is gitignored and the key is only ever read server-side. If you
ever find yourself prefixing it with `NEXT_PUBLIC_` to "fix" something, stop —
that ships it to every visitor.

`GEMINI_MODEL` is separate on purpose. When the free-tier Flash model gets
renamed, that's a one-line env change rather than a code hunt.

## Verifying the key is wired up

Without a key the app doesn't crash — it degrades. Conversation turns show a
retry, and the report falls back to a metrics-only version. So "it ran" isn't
proof the key works. Check explicitly:

```bash
curl -s -X POST http://localhost:3000/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"stage":"rahul","project":{"userName":"Test","college":"X","name":"CareVista","domain":"HealthTech","topic":"telemedicine","description":"test"},"stageHistory":[],"questionsAskedThisStage":[]}'
```

A working key returns `{"speaker":"rahul","reply":"...","topicCovered":"..."}`.
`{"error":"config"}` means the key isn't being read. `{"error":"gemini"}` means
it reached Google and Google objected — the message says why.

## What a full session looks like

Setup (name, college, project, domain) → hall → Rahul walks down the aisle →
camera consent → ~5 min conversation with Rahul → Rahul leaves → fullscreen
prompt → judges arrive → they establish context → 2–3 min presentation round →
5–7 min panel Q&A → coaching report.

Roughly 15 minutes end to end. Skipping ahead while testing: in development a
debug bar sits bottom-left with buttons for each scene beat, and the
conversation error state has a "Skip ahead" control.

## Browser support, honestly

| | Chrome | Edge | Safari | Firefox |
|---|---|---|---|---|
| Speech recognition | yes | yes | yes | **no** |
| Speech synthesis | yes | yes | yes | yes |
| Camera + MediaPipe | yes | yes | yes | yes |
| Recording | yes | yes | yes | yes |

Firefox has no `SpeechRecognition` at all, so the whole session runs on typed
input there. That path works and is styled as a first-class option rather than
an apology, but typed sessions can't produce speaking-pace metrics — the report
says so rather than inventing a number.

Chrome's speech recognition sends audio to Google's servers. That's Chrome's
implementation, not something this app chose, but it's worth knowing before you
describe the product as fully local. The camera pipeline genuinely is local:
MediaPipe runs in WASM in the browser and only derived numbers (forward-facing
ratio, average head turn, blink rate) ever leave the device.

## Token cost

One Gemini call per conversational turn, plus one for the report. A full session
is roughly 18–20 calls. Reply and per-answer scoring come back in the *same*
call rather than two, and history sent to the model is scoped to the current
phase rather than the whole transcript, so cost stays flat instead of growing
with session length. Comfortably inside the free tier for individual practice.

## If something goes wrong

**Rahul doesn't move / judges never appear** — this was a real bug (a React
dependency reset his walk every render) and is fixed, but if it recurs, the
tell is the scene sitting in `RAHUL_WALKING` forever. The debug bar shows the
current scene state.

**Nothing is spoken** — check the OS has at least one English voice installed.
Also note only character dialogue is ever spoken; system notices are silent by
design.

**Report says "AI coaching layer couldn't be reached"** — the report still
generated from measured data. Your key or network is the issue; see the curl
check above.
