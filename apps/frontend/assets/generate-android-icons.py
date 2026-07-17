#!/usr/bin/env python3
"""
Generate every Android launcher + splash asset from the vector master.

    python apps/frontend/assets/generate-android-icons.py

Source of truth: apps/frontend/assets/scan-action-mark.svg
NOTHING here is derived from the flat store JPEG. The master is the only input.

Requires: pip install resvg-py pillow   (both free)

Why resvg and not Chrome headless: Chrome silently forwards --screenshot to an
already-running browser session and exits 0 without writing a file, even with an
isolated --user-data-dir. resvg is deterministic, has full SVG 1.1 filter support
(the beam's feGaussianBlur bloom), and needs no browser.

Geometry decisions (see docs/ICON_MASTER_REBUILD.md for the measurements):

  adaptive foreground/background (108dp square):
      the WHOLE 512 master maps onto the central 72dp -> scale = (size*72/108)/512,
      translate = size*18/108. All ink then sits inside the 66dp safe circle.
      The background rect is over-sized so the gradient's clamped ends extend
      through the 18dp bleed instead of leaving transparent corners.

  legacy ic_launcher / ic_launcher_round (API 23-25 only; minSdk is 23):
      the master maps onto the silhouette's bounding box, so the mark keeps the
      same proportion it has in the store icon. Silhouette geometry is retained
      from the scaffold assets it replaces (measured: squircle inset 10.417% of
      canvas, corner radius 5.469%; round circle diameter 91.667%) so the icon's
      apparent size on those devices does not change -- only the artwork does.
      The scaffold's drop shadow is deliberately NOT reproduced: the store icon
      has no shadow, and matching the store icon is the whole point.

  splash:
      mark only (no gradient plate) on #0f172a -- the backgroundColor already
      declared in capacitor.config.ts. Master side = 45% of the canvas's shorter
      edge, centred, so the logo is the same physical size in portrait and
      landscape at every density.
"""
import io, os, re, sys
from PIL import Image, ImageDraw

try:
    import resvg_py
except ImportError:
    sys.exit("need: pip install resvg-py pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "scan-action-mark.svg")
RES = os.path.normpath(os.path.join(HERE, "..", "android", "app", "src", "main", "res"))

SRC = open(MASTER, encoding="utf-8").read()
MARK_ONLY = re.sub(r'<g id="background">.*?</g>\s*', "", SRC, flags=re.S)
BG_ONLY = re.sub(r'<g id="mark">.*?\n  </g>', "", SRC, flags=re.S)

SPLASH_NAVY = "#0f172a"          # must equal capacitor.config.ts SplashScreen.backgroundColor
MASTER_SIZE = 512.0

# density -> adaptive layer px (108dp), legacy launcher px (48dp)
DENSITIES = {"mdpi": (108, 48), "hdpi": (162, 72), "xhdpi": (216, 96),
             "xxhdpi": (324, 144), "xxxhdpi": (432, 192)}

# measured from the scaffold assets being replaced (at 192px: bbox 20..171, r~10.5; circle 8..183)
SQUIRCLE_INSET = 20.0 / 192.0
SQUIRCLE_RADIUS = 10.5 / 192.0
CIRCLE_DIAM = 176.0 / 192.0


def render(svg, w, h):
    return Image.open(io.BytesIO(bytes(
        resvg_py.svg_to_bytes(svg_string=svg, width=int(w), height=int(h))))).convert("RGBA")


def compose(body, W, H, scale, tx, ty, bleed=False):
    """Place the master's groups onto a W x H canvas under scale+translate."""
    s = body.replace('width="512" height="512" viewBox="0 0 512 512"',
                     f'width="{W}" height="{H}" viewBox="0 0 {W} {H}"')
    if bleed:
        # widen the gradient plate so its clamped ends fill the bleed rather than
        # leaving transparent corners once scaled below full-canvas size.
        pad = int(max(W, H) / max(scale, 1e-6))
        s = s.replace('<rect x="0" y="0" width="512" height="512"',
                      f'<rect x="-{pad}" y="-{pad}" width="{512 + 2 * pad}" height="{512 + 2 * pad}"')
    for gid in ("background", "mark"):
        s = s.replace(f'<g id="{gid}">',
                      f'<g id="{gid}" transform="translate({tx},{ty}) scale({scale})">')
    return render(s, W, H)


def full_icon(size):
    """gradient + mark, master mapped 1:1 onto a size x size canvas."""
    sc = size / MASTER_SIZE
    return compose(SRC, size, size, sc, 0, 0)


def write(img, relpath, rgb=False):
    p = os.path.join(RES, relpath)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    (img.convert("RGB") if rgb else img).save(p, "PNG", optimize=True)
    return p


def main():
    made = []

    # ---- adaptive foreground + background (108dp layers) -------------------
    for dens, (fg, _) in DENSITIES.items():
        view = fg * 72.0 / 108.0
        sc = view / MASTER_SIZE
        off = fg * 18.0 / 108.0
        made.append(write(compose(MARK_ONLY, fg, fg, sc, off, off),
                          f"mipmap-{dens}/ic_launcher_foreground.png"))
        made.append(write(compose(BG_ONLY, fg, fg, sc, off, off, bleed=True),
                          f"mipmap-{dens}/ic_launcher_background.png"))

    # ---- legacy launcher icons (API 23-25) --------------------------------
    for dens, (_, lg) in DENSITIES.items():
        inset = lg * SQUIRCLE_INSET
        side = lg - 2 * inset
        art = full_icon(int(round(side * 4)))            # 4x supersample, then fit
        art = art.resize((int(round(side)), int(round(side))), Image.LANCZOS)
        canvas = Image.new("RGBA", (lg, lg), (0, 0, 0, 0))
        canvas.paste(art, (int(round(inset)), int(round(inset))))
        mask = Image.new("L", (lg * 4, lg * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [inset * 4, inset * 4, (lg - inset) * 4 - 1, (lg - inset) * 4 - 1],
            radius=lg * SQUIRCLE_RADIUS * 4, fill=255)
        canvas.putalpha(mask.resize((lg, lg), Image.LANCZOS))
        made.append(write(canvas, f"mipmap-{dens}/ic_launcher.png"))

        d = lg * CIRCLE_DIAM
        o = (lg - d) / 2.0
        art = full_icon(int(round(d * 4))).resize((int(round(d)), int(round(d))), Image.LANCZOS)
        canvas = Image.new("RGBA", (lg, lg), (0, 0, 0, 0))
        canvas.paste(art, (int(round(o)), int(round(o))))
        mask = Image.new("L", (lg * 4, lg * 4), 0)
        ImageDraw.Draw(mask).ellipse([o * 4, o * 4, (lg - o) * 4 - 1, (lg - o) * 4 - 1], fill=255)
        canvas.putalpha(mask.resize((lg, lg), Image.LANCZOS))
        made.append(write(canvas, f"mipmap-{dens}/ic_launcher_round.png"))

    # ---- splash: mark on #0f172a -----------------------------------------
    splashes = {}
    for f in sorted(os.listdir(RES)):
        p = os.path.join(RES, f, "splash.png")
        if os.path.isfile(p):
            with Image.open(p) as im:
                splashes[f"{f}/splash.png"] = im.size
    for rel, (W, H) in splashes.items():
        side = min(W, H) * 0.45
        sc = side / MASTER_SIZE
        tx = (W - side) / 2.0
        ty = (H - side) / 2.0
        plate = Image.new("RGBA", (W, H), SPLASH_NAVY)
        made.append(write(Image.alpha_composite(plate, compose(MARK_ONLY, W, H, sc, tx, ty)),
                          rel, rgb=True))

    for p in made:
        print("  wrote", os.path.relpath(p, os.path.normpath(os.path.join(HERE, "..", "..", ".."))))
    print(f"\n{len(made)} assets generated from {os.path.basename(MASTER)}")


if __name__ == "__main__":
    main()
