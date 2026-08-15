"""
prepare_rahul_assets.py
==============================================================================
Turns the supplied Rahul renders into engine-ready sprites.

The four files you generated are good character art, but character art is not a
sprite. Between the two there are four problems worth solving properly:

1. SCALE JITTER. Each frame of the walk sheet was generated independently, so the
   figures range 636–653 px tall. Played back, that's a 2.5% size flicker at 8 Hz
   — the eye reads it as buzzing, not as walking. Every frame is normalised to a
   common standing height.

2. THE FRAMES ARE NOT IN CYCLE ORDER. A generated "sprite sheet" is eight
   plausible walking poses in whatever order the model emitted them, not a phase-
   ordered cycle. This script measures which foot is forward in each frame — by
   the vertical offset between the two feet — sorts them into a genuine
   progression, and lays them out as a ping-pong loop: left-forward through
   neutral to right-forward and back. That's the actual structure of a walk seen
   head-on, and it turns eight unordered renders into a cycle that reads.

3. NO VERTICAL BOB. The renders all sit at the same height. A real walk drops at
   each foot contact and rises through the passing position, twice per cycle.
   Once the frames are phase-ordered, that bob can be added exactly where it
   belongs, because we now know the phase of each frame.

4. WRONG LIGHT. The renders are lit bright and neutral against white. The hall is
   dimmer, warm from overhead, cool from the window wall on the left. Without a
   grade he reads as a sticker on a photograph. The grade here is deliberately
   mild — enough to seat him, not enough to look processed. `--no-grade` skips it.

Run from the project root:

    python3 tools/prepare_rahul_assets.py --src /path/to/uploads
"""

from __future__ import annotations
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter

ALPHA_THRESHOLD = 40

# Which upload is which. Renamed on the way in so the project never depends on
# generator filenames.
SOURCES = {
    "far": "1786464885480_image.png",          # three-quarter, looking away
    "near": "1786464923290_image.png",         # facing camera, arriving
    "walk": "1786464897194_image.png",         # 8-frame sheet (the cleaner of two)
    "portrait": "1786464946564_image.png",     # waist-up, gesturing
    "far_alt": "1786464874681_image.png",      # spare
}


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------
def mask(arr):
    return arr[..., 3] > ALPHA_THRESHOLD


def content_box(arr, min_px=3):
    """Bounding box ignoring stray semi-transparent specks, which otherwise drag
    the ground line down by a few pixels and make him hover."""
    m = mask(arr)
    rows, cols = m.sum(axis=1), m.sum(axis=0)
    ys = np.where(rows >= min_px)[0]
    xs = np.where(cols >= min_px)[0]
    return xs[0], ys[0], xs[-1] + 1, ys[-1] + 1


def torso_center_x(arr, y0, y1):
    """X centroid of the upper body. Aligning frames on the torso rather than on
    the whole bounding box keeps the head steady while the legs swing — align on
    the bbox instead and his head wobbles side to side as the feet move."""
    m = mask(arr)
    band = m[y0:y0 + int((y1 - y0) * 0.45)]
    xs = np.where(band.any(axis=0))[0]
    weights = band.sum(axis=0)[xs]
    return float((xs * weights).sum() / weights.sum())


def foot_phase(arr, y0, y1, x0, x1):
    """
    Signed measure of which foot is forward, for a figure walking toward camera.

    The leading foot is nearer the lens, so it sits lower in frame; the trailing
    foot is lifting and sits higher. Split the bottom of the figure into two
    clusters at the widest horizontal gap and compare their lowest points.
    Positive = the screen-left foot is leading.
    """
    m = mask(arr)
    band_top = y1 - int((y1 - y0) * 0.14)
    band = m[band_top:y1, x0:x1]
    cols = np.where(band.any(axis=0))[0]
    if len(cols) < 4:
        return 0.0
    gaps = np.diff(cols)
    split = cols[int(np.argmax(gaps))] if gaps.max() > 3 else cols[len(cols) // 2]
    left, right = band[:, : split + 1], band[:, split + 1:]

    def lowest(sub):
        rows = np.where(sub.any(axis=1))[0]
        return float(rows[-1]) if len(rows) else 0.0

    return lowest(left) - lowest(right)


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------
def grade(img: Image.Image) -> Image.Image:
    """
    Seat the figure in the hall's light. Three passes, all mild:
      - exposure down slightly; the hall is dimmer than a white studio backdrop
      - warm the midtones toward the overhead rig
      - a soft cool edge on the left, standing in for the window wall
    """
    a = np.asarray(img).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]

    rgb *= 0.93
    rgb *= np.array([1.045, 1.005, 0.935], np.float32)      # warm key
    rgb = 255 * np.clip(rgb / 255, 0, 1) ** 1.03            # gentle shadow lift down

    out = Image.fromarray(np.clip(np.concatenate([rgb, alpha], -1), 0, 255).astype(np.uint8))

    # Cool rim from screen left: the alpha silhouette shifted right, minus itself.
    al = out.split()[3]
    shifted = Image.new("L", out.size, 0)
    shifted.paste(al, (max(2, out.size[0] // 220), 0))
    edge = Image.composite(Image.new("L", out.size, 0), al, shifted)
    edge = edge.filter(ImageFilter.GaussianBlur(max(1, out.size[0] / 160)))
    edge = Image.eval(edge, lambda v: int(v * 0.34))
    glow = Image.new("RGBA", out.size, "#93a9c400")
    glow.putalpha(edge)
    return Image.alpha_composite(out, Image.composite(glow, Image.new("RGBA", out.size, (0,) * 4), al))


# ---------------------------------------------------------------------------
# Placement
# ---------------------------------------------------------------------------
def place(src: Image.Image, *, stand_h: int, canvas: tuple[int, int],
          feet_y: int, center_x: float | None = None, dy: int = 0) -> Image.Image:
    """Scale a figure to `stand_h` and drop it on `canvas` with its feet on
    `feet_y`. `center_x` overrides the horizontal anchor (used to align the walk
    frames on the torso rather than on their own bounding boxes)."""
    arr = np.asarray(src)
    x0, y0, x1, y1 = content_box(arr)
    scale = stand_h / (y1 - y0)
    cx = center_x if center_x is not None else (x0 + x1) / 2

    w, h = int(round(src.width * scale)), int(round(src.height * scale))
    scaled = src.resize((w, h), Image.LANCZOS)

    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    out.paste(scaled,
              (int(round(canvas[0] / 2 - cx * scale)),
               int(round(feet_y + dy - y1 * scale))),
              scaled)
    return out


# ---------------------------------------------------------------------------
# The walk sheet
# ---------------------------------------------------------------------------
FRAME_W, FRAME_H = 260, 700
STAND_H, FEET_Y = 645, 672
BOB_PX = 8          # peak-to-trough vertical travel; two bobs per cycle


def build_walk_sheet(src: Image.Image, do_grade: bool):
    arr = np.asarray(src)
    H, W = arr.shape[:2]
    col = mask(arr).sum(axis=0).astype(float)

    # Frame boundaries: the figures very nearly touch, so cut at the local
    # minimum of the alpha column profile near each expected eighth rather than
    # slicing on a fixed grid, which would clip a trailing hand.
    cuts = [0]
    for k in range(1, 8):
        c = int(k * W / 8)
        lo, hi = max(0, c - 70), min(W, c + 70)
        cuts.append(lo + int(np.argmin(col[lo:hi])))
    cuts.append(W)

    frames = []
    for k in range(8):
        s, e = cuts[k], cuts[k + 1]
        sub = src.crop((s, 0, e, H))
        sa = np.asarray(sub)
        x0, y0, x1, y1 = content_box(sa)
        frames.append({
            "img": sub,
            "cx": torso_center_x(sa, y0, y1),
            "h": y1 - y0,
            "phase": foot_phase(sa, y0, y1, x0, x1),
        })

    # Sort into a real progression, then ping-pong it: left-forward → neutral →
    # right-forward → neutral → left-forward. Endpoints aren't repeated, so eight
    # source poses become a fourteen-frame cycle.
    order = sorted(range(8), key=lambda i: frames[i]["phase"])
    sequence = order + order[-2:0:-1]

    print(f"  frame heights {min(f['h'] for f in frames)}–{max(f['h'] for f in frames)} px, "
          f"normalised to {STAND_H}")
    print(f"  phase order {order} → {len(sequence)}-frame cycle")

    sheet = Image.new("RGBA", (FRAME_W * len(sequence), FRAME_H), (0, 0, 0, 0))
    n = len(sequence)
    for i, fi in enumerate(sequence):
        # Foot contact is the low point of the body; the passing position is the
        # high point. Two full bobs per cycle, phased to the sorted order.
        dy = int(round(BOB_PX * 0.5 * np.cos(2 * np.pi * i / (n / 2))))
        f = place(frames[fi]["img"], stand_h=STAND_H, canvas=(FRAME_W, FRAME_H),
                  feet_y=FEET_Y, center_x=frames[fi]["cx"], dy=dy)
        if do_grade:
            f = grade(f)
        sheet.paste(f, (FRAME_W * i, 0), f)
    return sheet, len(sequence)


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/mnt/user-data/uploads")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
    ap.add_argument("--no-grade", action="store_true")
    args = ap.parse_args()
    out = os.path.normpath(args.out)
    do_grade = not args.no_grade

    def load(key):
        p = os.path.join(args.src, SOURCES[key])
        if not os.path.exists(p):
            sys.exit(f"missing source for '{key}': {p}")
        return Image.open(p).convert("RGBA")

    def emit(img, name):
        if do_grade:
            img = grade(img)
        img.save(os.path.join(out, name))
        print(f"  {name:30s} {img.size[0]}x{img.size[1]}")

    print("Preparing Rahul assets...")

    emit(place(load("far"), stand_h=620, canvas=(300, 680), feet_y=650), "rahul-far.png")

    # Near keeps close to native resolution: at the final stop he is rendered
    # around 830 px tall, so there's nothing to gain from downscaling first.
    emit(place(load("near"), stand_h=1440, canvas=(660, 1520), feet_y=1478), "rahul-near.png")

    sheet, count = build_walk_sheet(load("walk"), do_grade)
    sheet.save(os.path.join(out, "rahul-walking.png"))
    print(f"  {'rahul-walking.png':30s} {sheet.size[0]}x{sheet.size[1]}  ({count} frames)")

    # The waist-up gesturing render is kept, but it is NOT what the conversation
    # state loads — see NOTES in the README. It crops far too high for this hall.
    emit(load("portrait"), "rahul-portrait.png")

    print("Done.")


if __name__ == "__main__":
    main()
