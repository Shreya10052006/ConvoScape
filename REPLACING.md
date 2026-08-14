# Optional upgrades

Phase 1 is complete — every character is real art. Nothing below is blocking, but
each one buys something specific.

## 1. Mid-thigh crops of the judges

The current crops sit at about half-body, which is what forces them to stand at
1.6 m and prevents them walking in. Regenerate both cropped at **mid-thigh** (same
characters, same lighting, looser crop) and two things follow: they can stand back
at a relaxed 2.0–2.4 m, and they can walk in like Rahul instead of fading up.

## 2. Judges with eye contact

Both current poses look down — she at her clipboard, he at a laptop. That's right
for listening, and it's what the brief asked for. But when a judge *asks* a
question, you want them to look up. One extra pose each, identical framing, eyes to
camera, would let the scene cut between listening and asking on the dialogue turn.
Small asset, large effect on whether the round feels like an evaluation.

## 3. A mid-thigh conversation crop for Rahul

Your waist-up gesturing render is the best performance of the four, but it holds
only ~46% of his body and the desk in this hall doesn't start occluding until
about 60% down. Regenerate it **cropped at mid-thigh** and the conversation state
gets a real gesturing pose instead of reusing the arrival art. Same character,
same lighting, just a looser crop.

---

## If you need to regenerate anything from scratch

Two routes. For a walk cycle specifically, I'd still take the first.

---

## Route A — Mixamo + Blender (recommended, free, ~2 hours)

Diffusion models are bad at exactly the thing this project needs most: the same
person, eight times, with their weight on a different foot each time. Consistency
across a sprite sheet is where AI character pipelines fall apart. A 3D pass solves
it structurally rather than by luck.

1. **Character.** [Mixamo](https://mixamo.com) (free, Adobe account) has rigged
   characters; pick one that reads as a student. If you want a specific look,
   [MakeHuman](http://makehumancommunity.org) is free and exports to Mixamo.
2. **Animation.** Grab "Walking" from Mixamo. Set *In Place* on — the engine moves
   him, the animation only cycles his legs. Download as FBX.
3. **Camera.** In Blender, orthographic camera at the character's chest height,
   rotated ~20° off his facing direction so he walks toward the lens at a slight
   angle. Orthographic matters: our engine applies its own perspective, and a
   perspective render would double-apply it.
4. **Lighting**, matched to the hall (measured, not guessed):
   - Key: warm area light above and slightly behind, ~4500 K, the overhead rig
   - Fill: cool area light from screen left, ~7000 K, the window wall
   - Rim: faint magenta from behind right, the banners
   - No ground shadow — the engine composites him against a photographed floor
5. **Render** 8 frames evenly spaced across one full cycle (two steps), PNG with
   film transparent, 220×620. Frame 0 must be a clean contact pose: it's the frame
   shown when he stops.
6. Same character, same lighting, four more stills: far (turned away), near,
   conversation (crop mid-thigh), and two judges.

Everything after that is a file copy. The manifest in `sceneConfig.ts` already
describes these exact sizes.

---

## Route B — image generation

Workable for the four static poses. Expect to fight it on the sprite sheet.

**Consistency technique that actually helps:** generate one clean full-body
reference first, then use it as an image prompt / IP-adapter reference for every
subsequent pose. Never generate the four Rahul poses as four independent prompts —
you will get four different people wearing similar clothes, and the switch from
walking to conversation will read as a cut to a stranger.

Shared lighting clause — paste this into every prompt:

> lit by warm overhead event lighting from above and behind, cool daylight fill
> from the left, faint magenta bounce from banners behind, indoor convention hall
> lighting, no harsh front light, transparent background, full figure, no shadow
> on the ground, photographic, 50mm

### rahul-far.png — 220×620
> Full body of a 21-year-old Indian male university student, navy hoodie, dark
> jeans, white sneakers, black backpack on both shoulders, conference lanyard,
> standing three-quarters turned away from camera, weight on one leg, mid-
> conversation with someone off-frame, relaxed. *[lighting clause]*

### rahul-walking.png — 8 frames, 220×620 each
> …same student, walking toward the camera at a slight angle, [FRAME] …

with FRAME cycling through: left foot contact / left foot passing / left foot
push-off / transition / right foot contact / right foot passing / right foot
push-off / transition. Generate on a fixed seed, reference-image locked to your
first render, and expect to discard a lot.

### rahul-near.png — 520×1400
> …same student, full body, facing the camera, having just walked up, one hand
> starting to gesture, friendly open expression, looking directly at the viewer.

### rahul-conversation.png — 780×900
> …same student, **cropped at mid-thigh**, facing the camera, mid-sentence, one
> hand gesturing at chest height, engaged and curious, direct eye contact.

Then measure the real head-to-toe height in the uncropped version, divide by the
crop height, and put that ratio in `standingHeightFraction`. Getting this wrong by
3% is enough for him to read as floating.

### judge-1.png — 700×980
> Indian man in his forties, navy blazer over an open-collar shirt, event lanyard,
> holding a clipboard with an evaluation sheet, glancing down at his notes rather
> than at the camera, cropped at mid-thigh, angled 15° toward the viewer's right.

### judge-2.png — 700×980
> Indian woman in her thirties, charcoal shirt, glasses, event lanyard, arms
> folded, looking slightly off-camera at a laptop screen, attentive and
> analytical, cropped at mid-thigh, angled 15° toward the viewer's left.

Two things the judges must not be: facing the camera square-on (that's a group
photograph, not an evaluation), and the same build and height as each other.

---

## Checking your work

Drop the files in, run `npm run dev`, and use the debug bar to step through the
beats. Three things to look at, in order:

1. **Feet.** If he looks like he's hovering or sinking, the anchors are wrong, not
   the perspective. Measure `feetAnchorY` against the actual PNG.
2. **Lighting direction.** If he reads as pasted on, it's almost always that the
   key light is coming from the front. The hall lights him from above and behind.
3. **Identity across the cut.** Watch the transition from walking to conversation
   at full speed. If your eye registers a change of person, no amount of
   perspective accuracy will save it.
