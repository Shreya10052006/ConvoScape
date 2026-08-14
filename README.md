# ConvoScape

Practise the conversation before it happens.

An immersive presentation-practice simulator. You sit at a table inside a
hackathon hall, a student walks over and talks to you about your project, two
judges arrive and evaluate it, and you get a coaching report grounded in what
you actually said.

**Setup and running: see `SETUP.md`.** This file is about how it works and why
it's built the way it is.

```bash
npm install && cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

There's also `walk-engine-preview.html` — open it directly, no build required.
It runs the perspective and gait model against the calibrated hall and has a
toggle between the correct motion and the naive linear tween. That toggle is the
fastest way to see why the scene engine exists.

---

## Architecture

Four state machines run in parallel and talk only through explicit events:

```
SceneState      where the bodies are            lib/session/sceneMachine.ts
ConversationState  whose turn, what was said    lib/session/dialogueMachine.ts
CameraState     is the webcam on                lib/vision/cameraManager.ts
ReportState     generating / ready / failed     components/report/ReportPage.tsx
```

`components/Experience.tsx` is the only file that knows about more than one.
Everything else knows about exactly one.

This is load-bearing, not tidiness. A Gemini timeout must not be able to strand
Rahul mid-stride, and a dropped animation frame must not be able to lose a
user's answer. Both failures stay in their own lane because the transcript lives
in a reducer the orchestrator owns, and the scene advances on animation events
the AI layer can't touch.

```
lib/
  scene/        perspective.ts  walkPath.ts  sceneConfig.ts
  session/      sceneMachine.ts  dialogueMachine.ts  sessionTypes.ts
  speech/       speechRecognition.ts  speechSynthesis.ts  speechAnalysis.ts
  ai/           geminiClient.ts  schemas.ts  personas.ts
                conversationService.ts  reportService.ts  fallbackReport.ts
  vision/       cameraManager.ts  faceLandmarks.ts  behaviorMetrics.ts
                sessionRecorder.ts
  report/       downloadReport.ts
app/api/        conversation/  report/          ← the only place the key exists
```

---

## Three things worth knowing before you read the code

### The AI is invisible

Nothing on screen is a chat bubble. Character lines render as film-style
captions that clear when they're done; there's no scrollback, because a chat log
on top of the hall would make it a website with a picture behind it. The full
transcript exists in state for the report — just not on screen.

### System messages can never be spoken

`TranscriptTurn.kind` is `CHARACTER_DIALOGUE | SYSTEM_MESSAGE`, and only the
former reaches `speak()`. "Take your time" and "Your presentation has started"
are UI text. Making this a type rather than a convention means the TTS call site
reads from exactly one bucket and the two can't be confused by accident.

### Scores require evidence

The evaluation schema makes `evidence` mandatory — a short quote from the
student's actual answer. A model that has to quote you before scoring you is
much harder to flatter into a default-high number. That's the structural version
of "do not over-score"; the same rule as a prompt instruction survives about
three turns.

---

## Failure handling

The design rule is that no failure ends the session, and the user is never shown
a raw error.

| Failure | What happens |
|---|---|
| No speech recognition (Firefox) | Typed input, styled as a first-class path |
| Mic denied | Same, with a one-line notice |
| TTS unavailable | Caption holds on screen a beat longer, session continues |
| Gemini turn fails | Retry, or "Skip ahead" to the next phase |
| Gemini returns bad JSON | Extract → validate → retry stricter → typed error |
| Gemini report fails | Metrics-only report, clearly labelled as degraded |
| Camera denied | Session unaffected; report skips that section without penalty |
| MediaPipe won't load | Analysis stops quietly, conversation unaffected |
| User goes silent | One unspoken nudge. Characters never repeat themselves |

**The report cannot dead-end.** `generateReport()` is contractually
non-throwing, and the route catches beyond that. If the AI layer is
unreachable, `fallbackReport.ts` assembles a real report from measured speech
data and the per-answer scores already collected during the conversation —
nothing invented, and flagged as degraded rather than passed off as the full
thing.

### Gemini JSON, specifically

`JSON.parse(modelResponse)` is not a safe operation, and doing it is what
produced the "Gemini response was not valid JSON" error. Even with a
responseSchema set, real responses arrive fenced, prefixed with "Sure! Here's
the JSON:", with trailing commas, or truncated mid-object. So parsing is a
pipeline: strip fences, find the outermost *balanced* object (ignoring braces
inside strings), repair unambiguous damage, then validate shape with Zod —
because output that parses but is missing `reply` is just as broken as
unparseable text, and should be caught at the boundary rather than crashing a
component three layers up.

Tested against fenced blocks, preambles, trailing commentary, trailing commas,
braces inside strings, scores as `"8"`, and scores of 99 and -3 (clamped, not
crashed). Pure prose, truncated JSON, and empty replies are correctly rejected.

---

## The hall, measured

Your image is in at `public/assets/hall.png`, unaltered, and the engine is
calibrated to it. How the five numbers were obtained:

**Horizon and camera axis** came from the architecture, not from guessing. A
RANSAC fit over Hough segments on the receding lines — ceiling services, mezzanine
edges, table rows — converged hard on a vanishing point at **(743.5, 385.5)**. That
point is by definition eye level and the camera axis, so it fixes two constants at
once. Note it sits 24 px left of image centre: the render is very slightly
off-axis, and assuming dead centre would have skewed every lateral placement in
the scene.

**Scale** came from two people. The woman walking down the aisle (feet y≈615,
265 px tall) and the man with the lanyard (feet y≈590, 274 px tall) give k = 1.155
and k = 1.340 respectively. Read as a 1.63 m woman and a 1.78 m man, both imply a
camera height of **1.33 m** — agreement to the centimetre, from two figures at
different depths. That agreement is the actual test that the model fits the
photograph, and it's why I measured two people instead of trusting one.

Implied field of view is 74° horizontal, which matches the image's evident
wide-angle look, and puts the near desk edge about 0.95 m in front of the eye.

One thing the numbers told me that I wouldn't have guessed: **the nearest floor you
can see is 4 m away.** Everything closer is behind your own desk. So Rahul's feet
leave view about two-thirds of the way through his approach, and the last stretch
is a torso rising behind the table. That's both correct and convenient — foot
contact stops mattering exactly where it would be hardest to fake.

`/calibrate` is still there if you swap the image or add a second scenario.

---

## The one idea the scene rests on

For a camera looking at a flat floor, a person standing at depth `d` appears with:

```
feetY    = horizonY + (f·H)/d
heightPx = (f·h)/d  =  k · (feetY − horizonY)
screenX  = vanishX + (f·X)/d
```

Apparent height is **linear** in the feet's screen Y. Screen Y is **hyperbolic**
in depth. So constant walking speed in the room is *not* constant motion on
screen — it's `1/(a + bt)`.

Tween the screen coordinates instead, which is what any animation library will
cheerfully do for you, and he covers the far half of the hall far too quickly and
then crawls the last two metres. That's the "sliding" the brief keeps warning
about, and it is not fixable with a better sprite. It's a maths problem wearing an
art problem's clothes.

Everything else — foot-locking, the turn into the aisle, the deceleration on
arrival — is polish on top of getting that curve right.

Two consequences worth knowing:

**All world distances are in camera heights, not metres.** The camera is the
user's seated eye level. This means the focal length never has to be known in
pixels — one constant (`unitScale`) ties depth to screen. It also degrades
gracefully: if your estimate of the hall's real size is 20% off, everything is 20%
off together and the scene stays internally consistent, which is all the eye
checks.

**The brief's "only his upper body should be prominent" isn't something I enforce.**
It falls out of the geometry. At 1.6 m from a seated camera, a 1.75 m person's head
lands near the top of frame and their feet land well below the bottom edge. The
foreground plate crops him at the waist on its own. Any rule that *forced* that
framing would be a rule that breaks the moment you change the hall.

---

## Decisions I made against the brief

You asked me to evaluate rather than comply, so here's where I diverged and why.

**Framer Motion does not drive the walk.** It's in the stack for UI transitions —
setup screen, report reveals — where declarative keyframes are exactly right. But
character movement is the output of an integration with a non-linear projection in
the middle. Expressing that as keyframes means baking the perspective curve into
constants, which breaks the instant the hall image changes. And a
React-state-per-frame loop reconciles the tree 60 times a second, which is where
the frame budget goes once the webcam pipeline and speech recogniser are also
competing for the main thread. So: one `requestAnimationFrame` loop writes
`transform` to a ref'd node, touching only compositor-friendly properties. React
renders each character about once per scene beat.

**`hall-foreground.png` is a hard requirement, not an optimisation.** The brief
describes the table occluding Rahul's legs but doesn't ask for the asset that makes
it possible. Without a transparent cutout of the near table composited *above* the
characters, the only options are stopping him short of the table or cropping him at
an arbitrary line. Both read as fake immediately. This is the single asset most
likely to get skipped and most likely to sink the illusion.

**Rahul's path has a turn in it.** He starts angled away, mid-conversation with
someone else, pauses, then changes line and comes over. A straight-line approach
reads as a conveyor belt no matter how good the gait is — the believability comes
from the apparent *decision*, not the walk cycle.

**The sprite advances by distance, not by time.** If the sheet cycles on a timer
while the body accelerates and decelerates, the feet slip against the floor. One
sheet cycle equals two strides of ground covered, always.

**Three state machines, not one.** Scene state, dialogue state and camera state are
separate and communicate only through explicit events. A Gemini timeout must never
be able to strand Rahul mid-stride; a dropped frame must never be able to lose a
user's answer.

---

## Things I'd want to talk about before Phase 3

Not blockers for Phase 1, but they'll shape the design, and they're the parts of
the plan I'm least comfortable with:

**The Web Speech API is thinner than it looks.** `SpeechRecognition` is Chrome and
Safari only — Firefox has no support at all, so "fallback to typing" isn't an edge
case, it's the entire experience for a slice of your users. In Chrome it also
streams audio to Google's servers rather than running locally, which is worth
knowing before the privacy section of your pitch. And it auto-stops on silence,
which fights against a user who pauses mid-thought. Workable, but the typed path
needs to be a first-class experience rather than an apology, and typed sessions
can't produce speaking-pace metrics — the report has to degrade honestly rather
than invent them.

**`SpeechSynthesis` will fight you on barge-in.** The recogniser hears the
synthesiser through the speakers. You need to hard-mute the mic during playback and
re-arm on the `end` event, and even then Bluetooth headsets introduce enough
latency to cause double-triggers. Also: utterances over roughly 200 characters get
silently truncated in some browsers, so chunk on sentence boundaries. And available
voices vary wildly by OS, so giving Rahul and two judges distinct voices needs a
selection layer with pitch/rate differentiation as fallback.

**Latency is the thing that will break immersion, not visuals.** Final transcript →
Gemini → first audio needs to land under about 1.2 seconds or the illusion of a
person collapses. Plan for streaming the response and starting TTS on the first
complete sentence rather than waiting for the whole reply.

**The report's honesty rule needs enforcement in the schema, not the prompt.** "Do
not over-score" survives about three turns as a prompt instruction. Better to make
the evaluator emit a required `evidence` field per dimension — a verbatim span from
the transcript — and reject any score that arrives without one. A model that has to
quote the user before scoring them is much harder to flatter with.

---

## Where he ends up

The approach runs from 12 m out, down the right-hand aisle, to 2.15 m — the far
side of your table.

| Stop | Distance | Screen position | Height |
|---|---|---|---|
| 1 | 12.0 m | (846, 499) — among the far tables | 149 px |
| 2 | 8.0 m | (922, 556) — stepped into the aisle | 224 px |
| 3 | 4.8 m | (985, 669) — last point his feet show | 373 px |
| 4 | 2.15 m | (908, feet below frame) | 814 px |

He finishes to the right of your laptop, roughly over the sticker-covered second
machine, with the mug and laptop lid cutting across in front of him. That placement
is deliberate — dead centre would put him behind your open laptop lid.

**One place I couldn't fully meet the brief.** You asked for only his upper portion
to be prominent at the final stop. This image gives roughly the top 60% of him —
head to mid-thigh — not the top 45%. That's the photograph, not a tuning choice:
your near table hides floor only within 4 m, so anyone standing beyond that shows
more leg than a tighter table crop would allow. Forcing it means either walking him
implausibly close, where he starts to loom and his head jams against the top edge,
or cropping him at an arbitrary line, which is the floating-bust failure you
warned about. Sixty percent still reads clearly as someone standing at your table.
If you want it tighter, the fix is a hall render with the near table edge higher in
frame — not a change in code.

## Characters

All five characters are real art. Rahul went through
`tools/prepare_rahul_assets.py`, the judges through `tools/prepare_judge_assets.py`.
The clay mannequins are gone; `tools/generate_characters.py` stays in the repo as
the fallback if you ever swap the hall and need blocking before art exists.

Character art isn't a sprite, and four things had to be fixed in between:

**Scale jitter.** Each walk frame was generated independently, so the figures came
in between 636 and 654 px tall. Played back that's a 2.5% size flicker at walking
tempo — the eye reads it as buzzing, not walking. Every frame is normalised to one
standing height.

**The frames weren't in cycle order.** A generated "sprite sheet" is eight
plausible poses in whatever order the model emitted them. The script measures
which foot leads in each frame — by the vertical offset between the two feet,
since the nearer foot sits lower — sorts them into a real progression, and lays
them out as a ping-pong loop: left-forward, through neutral, to right-forward, and
back. That's the actual structure of a walk seen head-on, and it's why the sheet is
14 frames when you supplied 8. The measured order was `[3, 6, 0, 2, 4, 5, 1, 7]` —
nowhere near the order they arrived in.

**Alignment.** Frames are registered on the torso centroid, not the bounding box.
Align on the bbox and his head wobbles side to side as the legs swing. The
averaged stack of all 14 frames has a sharp head and blurred feet, which is the
check that it worked.

**No bob.** Every render sat at the same height. Once the frames are phase-ordered,
the drop at each foot contact and rise through the passing position can be added
exactly where it belongs — 8 px peak to trough, twice per cycle.

Plus a mild grade — exposure down, warm key, cool left rim — so he sits in the
hall's light instead of on top of it. `--no-grade` skips it.

### One asset I had to set aside

The waist-up gesturing render is the best performance of the four — real eye
contact, open hand. It's kept as `rahul-portrait.png` but the conversation state
loads the full-body art instead.

Measured against the full-body render by head height, the portrait holds about 46%
of his body — roughly head to hip. At the conversation stop his hip lands near
y=566 while the desk only starts occluding around y=735, so 170 px of hall would
show through where his legs should be. Closing that gap means walking him in to
about 1.2 m, where he looms and his head jams against the top edge. The full-body
art has no such problem: the desk crops it wherever it lands.

To use the portrait, regenerate it cropped at **mid-thigh**, not the waist.

### The judges: measured with a badge, placed by solver

Both judge renders are cropped mid-body, so there's no floor in the art to anchor
to and no full height to measure. Guessing produces judges who are subtly the
wrong size — the kind of error nobody can name but everybody notices.

The ID badge solves it. All three characters wear the same event badge, and a
badge is a fixed physical object. Measured against Rahul, whose standing height is
known, it works out at ~12.6 cm tall — a normal event ID card. That it lands on a
plausible real-world size rather than an arbitrary one is the check that the ruler
is sound rather than fitted. From there each judge's pixels-per-metre falls out of
their own badge: 148 px and 151 px.

Their positions weren't staged, they were solved. Because the art cuts off around
half-body while the desk only occludes below ~70%, there is exactly one depth per
judge at which the cut edge lands at or below the foreground boundary. Solving
that against the traced desk line across each judge's horizontal span gives
**1.60 m and 1.44 m** — closer than Rahul's 2.2 m, which is why they read as
leaning in. Appropriate for a judging round, and not a choice so much as something
the crop decided.

### The judges don't walk in, and that's the same constraint

A cropped figure only works at the one depth where its cut meets an occluder. Move
it along a path and that cut rides up into open air for the entire approach — the
floating-bust failure, playing for four seconds instead of being one bad frame.
Rahul can walk because his art is full-body.

So `JUDGE_ENTRY` is a beat rather than a traversal: Rahul steps away, a held
moment on the empty table, then they're simply there, faded up 220 ms apart. Which
is roughly how it happens in the room — you look up from your laptop and they've
arrived.

Give me mid-thigh judge crops and they can approach like Rahul does.

## Layout

```
app/
  page.tsx                  intro → setup → scene
  calibrate/page.tsx        fit the engine to your hall image
components/
  scene/
    SceneController.tsx     owns the visual state machine
    HallBackground.tsx      background plate + foreground occlusion plate
    CharacterLayer.tsx      rAF renderer, one per character
  setup/ProjectSetup.tsx    the only conventional screen, and barely
lib/
  scene/
    perspective.ts          projection, unprojection, calibration solving
    walkPath.ts             constant-world-speed paths, foot-lock, idle motion
    sceneConfig.ts          ALL hall-specific numbers + asset manifest
  session/sceneMachine.ts   scene / dialogue / camera states, kept apart
tools/
  generate_characters.py    renders the blocking mannequins
walk-engine-preview.html    standalone proof, no build step
```

---

## Testing

```bash
npm test          # 57 tests, Vitest
npm run typecheck
npm run lint
npm run build
```

The suite covers session identity and once-only timestamps, all phase
transitions, the Gemini JSON extractor against malformed output, deterministic
conversation and report fallbacks, filler/pacing/repetition/interruption
analysis, and real PDF generation.

Two tests are worth knowing about because they encode judgement calls rather
than mechanics:

- **`does NOT treat the project's own name as a problem`** — repeating
  "CareVista" while describing CareVista is correct. A naive frequency counter
  would tell the user to stop naming their project, which is bad advice.
- **`generates a real PDF from a FALLBACK report (no Gemini)`** — proves the
  PDF path has no dependency on the AI layer.

The suite has already caught two real bugs: an off-by-one that silently missed
`"I, I think"` (the commonest stutter in English, skipped because "I" is one
character), and a `server-only` import leaking into a client component.

## Status

### Verified by execution in this session
- `tsc --noEmit`, `next lint`, `next build` — all clean
- 57/57 tests passing
- API key absent from every client bundle (grepped `.next/static`)
- `server-only` guard fails the build on a deliberate client-side import
- `/api/conversation` with Gemini unreachable returns a real project-aware judge
  question with `degraded: true`, not an error
- `/api/report` with Gemini unreachable returns a complete report with correct
  durations, hedged interruption notes, and repetition analysis that separates
  hesitation from project vocabulary
- Main bundle is 22.7 kB (pdf-lib lazy-loads on click, not at first paint)

### Implemented but NOT verified by execution
- **Live Gemini behaviour.** This environment cannot reach
  `generativelanguage.googleapis.com`. Everything up to the network call is
  proven; conversation quality, judge panel hand-off and the AI report path are
  not.
- **Anything requiring a browser.** No browser binary is installable here — the
  Playwright CDN is blocked (403). So the Rahul walk, judge entry, TTS/mic
  handoff, camera consent, recording, and PDF download click path are verified
  as code and by unit test, never as pixels or DOM events.
- Tablet/mobile layout beyond the portrait-orientation guard.

### Known limitations
- **Judges settle rather than walk.** Their art is cropped mid-body, so a walk
  would ride the cut edge into open air. They ease forward ~25 cm while fading
  in, grounded at every frame. A full-body walk sheet is the only true fix.
- Both judge poses look down — right for listening, wrong for asking.
- Phase lengths are turn-counted, not clock-timed.
- No persistence: a refresh mid-session loses the transcript.
- Interruption detection is approximate by construction and labelled as such
  everywhere it surfaces. The Web Speech API gives event boundaries, not
  diarized audio.
