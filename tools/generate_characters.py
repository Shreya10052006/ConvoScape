"""
generate_characters.py
==============================================================================
Renders BLOCKING MANNEQUINS for every character slot in ConvoScape.

WHAT THESE ARE, AND WHAT THEY ARE NOT

There is no image generation in this environment — no diffusion model, no
imagegen skill. Photoreal students and judges are not something I can make here.

Rule 34 of the brief says: in that case, don't fabricate poor character graphics.
I tried the other route first — a flat-vector "student" with hoodie, hair, face
and lanyard — and it was bad. Small head, thick neck, blank stare, a walk cycle
whose frames barely differed. Dropped into a photographed hall it would have read
as broken rather than as a placeholder, and it would have turned every Phase 1
conversation from "does he move like a person" into "why does his face look like
that". That's the exact failure the brief warns about.

So these deliberately don't pretend to be people. They're matte clay mannequins:
no face, no hair, no clothing, correct human proportions, and a genuinely
articulated walk. An artist's mannequin is a recognised, honest object — it reads
as intentional blocking, the way a grey-box level reads in game development.

What they let you do today: sign off proportions, scale, gait, timing and
occlusion; watch the sprite sheet frame-step locked to distance travelled; run the
scene state machine end to end.

What they can't do: make anyone feel a person came over. That needs the photoreal
art. REPLACING.md has prompts tuned to this hall's measured lighting.

    python3 tools/generate_characters.py
"""

from __future__ import annotations
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
SS = 4  # supersample factor

# Clay, lit to match the hall: warm key from the overhead rig, cool daylight
# from the window wall on the left. Neutral enough not to fight the photograph.
BODY, BODY_DARK, BODY_LIT, JOINT = "#8d8b93", "#5f5e67", "#a9a6ad", "#7a7880"
JUDGE_BODY, JUDGE_DARK, JUDGE_LIT = "#7c828c", "#535963", "#989ea8"
RIM_WARM, RIM_COOL = "#d3a469", "#8fa6c4"


def limb(dr, a, b, wa, wb, fill):
    """Tapered capsule. Limbs taper; a constant-width sausage is the fastest way
    to make a figure look machine-drawn."""
    (x1, y1), (x2, y2) = a, b
    ang = math.atan2(y2 - y1, x2 - x1) + math.pi / 2
    dx, dy = math.cos(ang), math.sin(ang)
    dr.polygon([(x1 + dx * wa, y1 + dy * wa), (x2 + dx * wb, y2 + dy * wb),
                (x2 - dx * wb, y2 - dy * wb), (x1 - dx * wa, y1 - dy * wa)], fill=fill)
    dr.ellipse([x1 - wa, y1 - wa, x1 + wa, y1 + wa], fill=fill)
    dr.ellipse([x2 - wb, y2 - wb, x2 + wb, y2 + wb], fill=fill)


def rim(img, colour, offset, opacity):
    """Offset the alpha silhouette and keep the sliver that pokes out. Cheap
    directional light, and it's most of what makes a flat figure sit inside a
    photograph rather than on top of it."""
    a = img.split()[3]
    shifted = Image.new("L", img.size, 0)
    shifted.paste(a, offset)
    edge = Image.composite(Image.new("L", img.size, 0), a, shifted)
    edge = edge.filter(ImageFilter.GaussianBlur(1.4 * SS))
    edge = Image.eval(edge, lambda v: min(255, int(v * opacity)))
    glow = Image.new("RGBA", img.size, colour + "00")
    glow.putalpha(edge)
    return Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", img.size, (0,) * 4), a))


# --- Proportions: 7.5 heads, a normal adult rather than a heroic 8. All values
# are fractions of standing height, feet at 1.0.
HEAD_CY, HEAD_RX, HEAD_RY = 0.072, 0.053, 0.071
NECK_Y, SHOULDER_Y = 0.140, 0.180
CHEST_Y, WAIST_Y, HIP_Y = 0.290, 0.420, 0.500
KNEE_Y, ANKLE_Y = 0.735, 0.950
SH_HALF, HIP_HALF = 0.106, 0.058


def pose(swing=0.0, bob=0.0, turn=0.0, arms="swing", lean=0.0):
    w = 1.0 - 0.40 * abs(turn)
    cx = lean * 0.018
    twist = 0.028 * math.sin(swing) * w

    j = {
        "head":  (cx + 0.022 * turn, HEAD_CY + bob),
        "neck":  (cx + 0.011 * turn, NECK_Y + bob),
        "sh_l":  (cx - SH_HALF * w - twist, SHOULDER_Y + bob),
        "sh_r":  (cx + SH_HALF * w + twist, SHOULDER_Y + bob),
        "chest": (cx, CHEST_Y + bob),
        "waist": (cx, WAIST_Y + bob),
        "hip_l": (cx - HIP_HALF * w + twist * 0.5, HIP_Y + bob),
        "hip_r": (cx + HIP_HALF * w + twist * 0.5, HIP_Y + bob),
    }

    # Legs. Walking toward camera, so the cue isn't a side-on scissor — it's the
    # trailing leg lifting and bending while the leading leg plants lower and
    # reads slightly larger. Amplitudes are generous on purpose: at 149 px tall
    # in the far shot, a subtle cycle is an invisible cycle.
    for side, ph in (("l", swing), ("r", swing + math.pi)):
        sw = math.sin(ph)
        lift, reach = max(0.0, -sw), max(0.0, sw)
        sgn = -1 if side == "l" else 1
        hx, _ = j[f"hip_{side}"]
        j[f"knee_{side}"] = (hx * 0.58 + 0.014 * sw * w,
                             KNEE_Y + bob * 0.5 - 0.085 * lift)
        ay = ANKLE_Y - 0.125 * lift + 0.022 * reach
        ax = hx * 0.28 + 0.012 * sw * w
        j[f"ankle_{side}"] = (ax, ay)
        j[f"foot_{side}"] = (ax + sgn * 0.008, ay + 0.050 - 0.016 * lift)
        j[f"depth_{side}"] = sw
        j[f"scale_{side}"] = 1.0 + 0.10 * sw

    for side, ph in (("l", swing + math.pi), ("r", swing)):
        sgn = -1 if side == "l" else 1
        sx, sy = j[f"sh_{side}"]
        if arms == "folded":
            j[f"elbow_{side}"] = (sx + sgn * 0.078 * w, sy + 0.165)
            j[f"hand_{side}"] = (sx - sgn * 0.046 * w, sy + 0.205)
        elif arms == "clipboard":
            j[f"elbow_{side}"] = (sx + sgn * 0.080 * w, sy + 0.172)
            j[f"hand_{side}"] = (sx + sgn * 0.022 * w, sy + 0.242)
        elif arms == "gesture" and side == "r":
            j[f"elbow_{side}"] = (sx + 0.066 * w, sy + 0.155)
            j[f"hand_{side}"] = (sx + 0.008 * w, sy + 0.208)
        elif arms == "idle":
            j[f"elbow_{side}"] = (sx - sgn * 0.014 * w, sy + 0.182)
            j[f"hand_{side}"] = (sx - sgn * 0.018 * w, sy + 0.348)
        else:
            sw = math.sin(ph)
            j[f"elbow_{side}"] = (sx - sgn * 0.012 * w + 0.030 * sw * w,
                                  sy + 0.182 - 0.012 * abs(sw))
            j[f"hand_{side}"] = (sx - sgn * 0.020 * w + 0.062 * sw * w,
                                 sy + 0.346 - 0.024 * abs(sw))
    return j


def render(*, height_px, canvas, swing=0.0, bob=0.0, turn=0.0, arms="swing",
           lean=0.0, clipboard=False, judge=False):
    W, H = canvas[0] * SS, canvas[1] * SS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    hp, ox = height_px * SS, W / 2
    body = JUDGE_BODY if judge else BODY
    dark = JUDGE_DARK if judge else BODY_DARK
    lit = JUDGE_LIT if judge else BODY_LIT

    P = lambda p: (ox + p[0] * hp, p[1] * hp)
    U = lambda v: v * hp
    j = pose(swing, bob, turn, arms, lean)
    near_left = j["depth_l"] >= j["depth_r"]

    def leg(side, front):
        c = body if front else dark
        sc = j[f"scale_{side}"] if front else 0.95
        k = P(j[f"knee_{side}"])
        limb(dr, P(j[f"hip_{side}"]), k, U(0.054 * sc), U(0.040 * sc), c)
        limb(dr, k, P(j[f"ankle_{side}"]), U(0.039 * sc), U(0.025 * sc), c)
        dr.ellipse([k[0] - U(0.038 * sc), k[1] - U(0.038 * sc),
                    k[0] + U(0.038 * sc), k[1] + U(0.038 * sc)],
                   fill=JOINT if front else dark)
        a, f = P(j[f"ankle_{side}"]), P(j[f"foot_{side}"])
        limb(dr, a, f, U(0.025 * sc), U(0.023 * sc), c)
        dr.ellipse([f[0] - U(0.033 * sc), f[1] - U(0.020), f[0] + U(0.033 * sc), f[1] + U(0.006)], fill=c)

    def arm(side, front):
        c = body if front else dark
        e = P(j[f"elbow_{side}"])
        limb(dr, P(j[f"sh_{side}"]), e, U(0.039), U(0.030), c)
        limb(dr, e, P(j[f"hand_{side}"]), U(0.030), U(0.020), c)
        h = P(j[f"hand_{side}"])
        dr.ellipse([h[0] - U(0.023), h[1] - U(0.014), h[0] + U(0.023), h[1] + U(0.028)], fill=c)

    leg("r" if near_left else "l", False)
    arm("r" if near_left else "l", False)

    # Torso as one silhouette so the rim pass reads it as a single form.
    sl, sr, hl, hr = P(j["sh_l"]), P(j["sh_r"]), P(j["hip_l"]), P(j["hip_r"])
    wy = P(j["waist"])[1]
    wl, wr = (P(j["waist"])[0] - U(0.066), wy), (P(j["waist"])[0] + U(0.066), wy)
    dr.polygon([sl, sr, wr, hr, hl, wl], fill=body)
    for s in (sl, sr):
        dr.ellipse([s[0] - U(0.045), s[1] - U(0.045), s[0] + U(0.045), s[1] + U(0.045)], fill=body)
    dr.ellipse([hl[0] - U(0.022), hl[1] - U(0.030), hr[0] + U(0.022), hr[1] + U(0.030)], fill=body)
    c = P(j["chest"])
    dr.ellipse([c[0] - U(0.050), c[1] - U(0.088), c[0] + U(0.050), c[1] + U(0.020)], fill=lit)

    if clipboard:
        h = P(j["hand_r"])
        dr.rounded_rectangle([h[0] - U(0.070), h[1] - U(0.098), h[0] + U(0.060), h[1] + U(0.026)],
                             radius=U(0.006), fill="#cfcabd")
        dr.rectangle([h[0] - U(0.070), h[1] - U(0.098), h[0] + U(0.060), h[1] - U(0.082)], fill="#6f747c")

    leg("l" if near_left else "r", True)
    arm("l" if near_left else "r", True)

    # Neck: short and set INTO the shoulders. The first attempt perched a small
    # head on a long column and the figure read as a bottle.
    n = P(j["neck"])
    limb(dr, (n[0], n[1] + U(0.034)), n, U(0.031), U(0.026), body)

    hd = P(j["head"])
    dr.ellipse([hd[0] - U(HEAD_RX), hd[1] - U(HEAD_RY), hd[0] + U(HEAD_RX), hd[1] + U(HEAD_RY)], fill=body)
    # A soft crown highlight, offset toward the facing direction. That's all the
    # head needs to read as facing us. No features: a blank head is honest,
    # whereas two dots for eyes would be an uncanny half-measure.
    dr.ellipse([hd[0] - U(0.030) + U(0.020 * turn), hd[1] - U(0.052),
                hd[0] + U(0.030) + U(0.020 * turn), hd[1] - U(0.006)], fill=lit)

    img = rim(img, RIM_WARM, (0, -int(2.2 * SS)), 0.9)
    img = rim(img, RIM_COOL, (int(2.6 * SS), 0), 0.5)
    return img.resize(canvas, Image.LANCZOS)


def save(img, name):
    img.save(os.path.join(OUT, name))
    print(f"  {name:26s} {img.size[0]}x{img.size[1]}")


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Rendering blocking mannequins...")
    save(render(height_px=600, canvas=(220, 620), turn=0.7, swing=0.5, arms="idle", lean=0.3),
         "rahul-far.png")

    FR = 8
    sheet = Image.new("RGBA", (220 * FR, 620), (0, 0, 0, 0))
    for i in range(FR):
        ph = 2 * math.pi * i / FR
        f = render(height_px=600, canvas=(220, 620), swing=ph,
                   bob=-0.013 * math.cos(2 * ph), turn=0.20)
        sheet.paste(f, (220 * i, 0), f)
    save(sheet, "rahul-walking.png")

    save(render(height_px=1355, canvas=(520, 1400), turn=0.10, arms="idle"), "rahul-near.png")

    full, frac = 1458, 1 / 1.62
    tall = render(height_px=full, canvas=(780, full + 20), turn=0.06, arms="gesture")
    save(tall.crop((0, 0, 780, int(full * frac))), "rahul-conversation.png")

    jh, jfrac = 1519, 1 / 1.55
    save(render(height_px=jh, canvas=(700, jh + 20), turn=-0.22, arms="clipboard",
                clipboard=True, lean=-0.4, judge=True).crop((0, 0, 700, int(jh * jfrac))),
         "judge-1.png")
    save(render(height_px=jh, canvas=(700, jh + 20), turn=0.26, arms="folded",
                lean=0.4, judge=True).crop((0, 0, 700, int(jh * jfrac))),
         "judge-2.png")
    print("Done.")


if __name__ == "__main__":
    main()
