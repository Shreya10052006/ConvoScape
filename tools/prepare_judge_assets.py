"""
prepare_judge_assets.py
==============================================================================
Splits the supplied two-judge render into two sprites and works out how big each
of them actually is.

THE MEASUREMENT PROBLEM

Both judges are cropped mid-body, so there is no "feet" in the art to anchor to
and no full height to measure. Guessing produces judges who are subtly the wrong
size, which is the kind of error nobody can name but everybody notices.

The ID badge solves it. Rahul, Judge 1 and Judge 2 all wear the same event badge,
and a badge is a physical object of fixed size. Measure it in the full-body Rahul
render, where his standing height IS known, and it becomes a ruler:

    badge height / standing height  →  pixels per metre in any render that has one

Rahul: badge 110 px against a 1528 px standing figure taken as 1.75 m
       →  the badge is ~12.6 cm tall, which is a normal event ID card. Good sign:
          the ruler is self-consistent rather than fitted.

Judge 1: badge 148 px  →  ~2056 px per 1.75 m of person
Judge 2: badge 151 px  →  ~2097 px per 1.75 m of person

That gives `standingHeightFraction` directly, with no eyeballing.

The remaining judgement call is `feetAnchorY` — where the floor sits relative to
the art — which depends on real height and posture. Judge 1 stands upright, so
it's close to her full height below her head. Judge 2 is leaning on a laptop, so
his head sits lower than his standing height would put it, and the floor is
correspondingly nearer. Both are exposed as constants below rather than buried.

    python3 tools/prepare_judge_assets.py
"""

from __future__ import annotations
import argparse, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from prepare_rahul_assets import grade, content_box, ALPHA_THRESHOLD  # noqa: E402

SOURCE = "1786466344703_image.png"

# From the badge measurement, see the docstring.
BADGE_METRES = 0.126

JUDGES = {
    # key            real height   posture factor (head-to-floor ÷ standing height)
    "judge-1.png": dict(height_m=1.65, posture=0.99),   # upright, head tilted down
    "judge-2.png": dict(height_m=1.78, posture=0.92),   # leaning over a laptop
}


def find_badge(arr, x0, x1):
    """Largest solid blue rectangle in the given column range."""
    r, g, b, al = (arr[..., i].astype(int) for i in range(4))
    m = (al > 100) & (b > 70) & (b > r * 1.7) & (b > g * 1.5)
    keep = np.zeros_like(m)
    keep[:, x0:x1] = m[:, x0:x1]
    lab, n = ndimage.label(keep)
    best = None
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if h > 20 and w > 15 and len(ys) / (h * w) > 0.55 and 0.9 < h / w < 2.4:
            if best is None or len(ys) > best[0]:
                best = (len(ys), h)
    return best[1] if best else None


def split_columns(arr):
    """Column ranges of each figure. They don't touch in this render, so a simple
    run-length pass over the alpha profile is enough — no cutting through limbs."""
    col = (arr[..., 3] > ALPHA_THRESHOLD).sum(axis=0)
    runs, start = [], None
    for i, v in enumerate(col):
        if v > 0 and start is None:
            start = i
        elif v == 0 and start is not None:
            if i - start > 30:
                runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(col)))
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/mnt/user-data/uploads")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
    ap.add_argument("--no-grade", action="store_true")
    args = ap.parse_args()
    out = os.path.normpath(args.out)

    path = os.path.join(args.src, SOURCE)
    if not os.path.exists(path):
        sys.exit(f"missing judges source: {path}")
    src = Image.open(path).convert("RGBA")
    arr = np.asarray(src)

    runs = split_columns(arr)
    if len(runs) != 2:
        sys.exit(f"expected two figures, found {len(runs)}: {runs}")

    print("Preparing judge assets...")
    for (name, cfg), (x0, x1) in zip(JUDGES.items(), runs):
        badge = find_badge(arr, x0, x1)
        if not badge:
            sys.exit(f"no badge found for {name}; can't establish scale")

        px_per_metre = badge / BADGE_METRES
        px_per_175 = px_per_metre * 1.75
        head_to_floor = px_per_metre * cfg["height_m"] * cfg["posture"]

        pad = 12
        crop = src.crop((max(0, x0 - pad), 0, min(src.width, x1 + pad), src.height))
        cx0, cy0, cx1, cy1 = content_box(np.asarray(crop))
        head_top = cy0

        img = grade(crop) if not args.no_grade else crop
        img.save(os.path.join(out, name))

        stand_frac = px_per_175 / img.height
        feet_anchor = (head_top + head_to_floor) / img.height
        print(f"  {name:14s} {img.size[0]}x{img.size[1]}  badge={badge}px  "
              f"standingHeightFraction={stand_frac:.3f}  feetAnchorY={feet_anchor:.3f}")
    print("Done.")


if __name__ == "__main__":
    main()
