# Assets ConvoScape needs

**All slots filled with real art. Phase 1 is complete.**

| Asset | Status |
|---|---|
| `hall.png` | ✓ supplied, calibrated |
| `hall-foreground.png` | ✓ generated from the hall |
| `rahul-far.png` | ✓ your art, processed |
| `rahul-walking.png` | ✓ your art — 8 poses re-ordered into a 14-frame cycle |
| `rahul-near.png` | ✓ your art (also drives the conversation state) |
| `rahul-portrait.png` | ✓ kept, but cropped too high for this hall — see README |
| `judge-1.png` / `judge-2.png` | ✓ your art, split and badge-calibrated |

Run `python3 tools/prepare_rahul_assets.py` and `python3 tools/prepare_judge_assets.py`
to regenerate the sprites from source renders. Don't hand-edit the files in `public/assets/` — the anchors in
`sceneConfig.ts` are derived from what that script produces.

---

## 1. `hall.png` — DELIVERED ✓

Your image, 1536×1024, in place and calibrated. Nothing was altered.

Measured values, now live in `sceneConfig.ts`:

| | |
|---|---|
| Horizon / eye level | y = 385.5 |
| Camera axis | x = 744 (24 px left of centre — the render is slightly off-axis) |
| Camera height | 1.33 m |
| Horizontal field of view | 74° |
| Nearest visible floor | 4.0 m — everything closer is behind your own desk |

The cross-check that matters: the walking woman and the lanyard man, measured
independently, imply camera heights of 1.33 m and 1.33 m. Two figures at different
depths agreeing to the centimetre is what says the model fits the photograph.

| | |
|---|---|
| Format | PNG or JPG, no alpha |
| Size | 1920×1080 minimum; 2560×1440 preferred for large displays |
| Camera | First person, seated, eye level roughly 1.2 m |
| Composition | The user's own table occupying the lower third; aisle and hall receding |

Two things I need it to contain, which are easy to miss when generating:

- **A visible floor running into the distance.** The perspective model is
  calibrated off the floor plane. A shot that is all tables and no floor gives
  nothing to calibrate against.
- **Clear aisle space to one side.** Rahul needs somewhere plausible to walk.
  If every square metre is packed with tables, his path reads as walking through
  furniture.

After you drop it in, open `/calibrate`, place the two figures, and paste the
output over `HALL_CALIBRATION` in `lib/scene/sceneConfig.ts`.

---

## 2. `hall-foreground.png` — DELIVERED ✓ (first cut, worth refining)

Generated from your image: the desk boundary traced, everything below it kept,
everything above made transparent. Registered to `hall.png` exactly.

There's a trick here worth knowing, because it changes how carefully this has to
be made. The plate is cut from the *same pixels* as the background, so anywhere a
character isn't standing, foreground and background are byte-identical and the
seam cannot be seen at all. A boundary that's 10 px off costs you a 10 px sliver
where Rahul could overlap the desk edge. Nothing else. That's why a traced polygon
is good enough here where it wouldn't be for a normal composite.

Refine it if you want a cleaner result — the traced edge is a smooth curve and
your desk edge isn't perfectly smooth, particularly around the notebook and the
cable from the power strip. But it works as-is.

This is what makes "the table hides his legs" physically true. Without it the only
options are stopping Rahul short of the table — which kills the brief's central
moment — or cropping him at an arbitrary line, which reads instantly as a floating
bust.

Practical way to make it: take `hall.png` into any editor, select the near table
and its objects, copy to a new transparent layer of identical size, export.
Ten minutes of masking, and it's the highest-leverage asset in the project.

---

## 3. Rahul — four files, one person

The hard requirement is that they are unmistakably the same student. Same face,
hair, hoodie, jeans, shoes, backpack, lanyard. Generate them in one session from
one seed if you can, and check them side by side before committing.

Lighting must match the hall — if the hall is lit by cool overhead panels, a
character lit warm from the side will never sit in the scene no matter how good
the perspective is.

All files: PNG with alpha, character centred horizontally, feet at the very bottom
edge unless noted.

**Sizing them to this hall specifically.** At his four stops he will be rendered
at 149 px, 224 px, 373 px and 814 px tall. Source art comfortably above the largest
of those — 900–1400 px — so nothing is ever upscaled.

**Lighting to match.** Your hall is lit warm from overhead, with cool daylight
spilling in from the tall windows on the left and magenta bounce from the banners.
A character lit flat or from the front will sit on top of the scene rather than in
it, no matter how good the perspective is. The strongest single cue: a warm key
from above and slightly behind, leaving the face a little cooler and softer.

All six are currently present as mannequins at these exact sizes.

| File | Content | Size |
|---|---|---|
| `rahul-far.png` | Full body, standing, three-quarter turn, weight on one leg. Not facing camera — he hasn't noticed you yet. | 220×620 |
| `rahul-walking.png` | Sprite sheet, 8 frames in a single row, walking toward camera at a slight angle. | 1760×620 (8 × 220) |
| `rahul-near.png` | Full body, arriving, facing the user. Higher resolution — he's large on screen here. | 520×1400 |
| `rahul-conversation.png` | **Cropped at mid-thigh**, facing the user, relaxed, one hand gesturing. Head near the top of frame. | 780×900 |

### On the sprite sheet

Eight frames is one full cycle: contact, passing, contact, passing, ×2 for the
opposite leg. Frame 0 must be a clean contact pose (feet apart, weight
transferring) because that's the frame shown when he stops.

Opposite arm to leg. A small vertical bob, highest at passing position. Very slight
backpack lag. The engine drives frames by distance travelled rather than by a
timer, so the gait stays locked to the floor at any speed — but that only works if
one full sheet cycle equals two steps.

The mannequin sheet already follows this contract, so you can watch the frame
stepping work before committing to real art.

### Anchors

If your art has margin at the bottom or the character isn't centred, adjust
`feetAnchorY` and `centerAnchorX` in `sceneConfig.ts`. A 3% error in `feetAnchorY`
is enough to read as floating, and it's the first thing to check if he looks
slightly off the ground.

For `rahul-conversation.png` the anchor sits *outside* the image: `feetAnchorY:
1.62` means his feet would be 1.62 image-heights below the top edge. Measure it
properly — take his real head-to-toe height in the original uncropped generation
and divide by the height of the crop you exported.

---

## 4. Judges — two files

| File | Content | Suggested size |
|---|---|---|
| `judge-1.png` | Cropped mid-thigh. Professional, holding an evaluation sheet, glancing down at it rather than at camera. | 700×980 |
| `judge-2.png` | Cropped mid-thigh. Technical evaluator, angled toward the laptop, arms folded or one hand on the table. | 700×980 |

Neither should face the camera square-on. Two people standing shoulder to shoulder
staring straight ahead is a group photograph, not an evaluation. Angle them both
inward by 15–20°, and give them different heights and builds so the pair reads as
two people rather than one asset mirrored.

Judge entry currently borrows Rahul's walk sheet as a stand-in. Dedicated walking
sheets are a Phase 5 nice-to-have, not a Phase 1 blocker — they can fade in at
their marks and still work.

---

## Optional, later

- `rahul-conversation-talking.png` — a second mouth position. Alternating two
  frames on the TTS boundary is crude but reads far better than a static mouth,
  and it costs one file.
- Separate head layers for subtle head turns during idle.
- `judge-1-writing.png` — a "making a note" pose to cut to after a weak answer.
  Small asset, disproportionate psychological effect on the user.
