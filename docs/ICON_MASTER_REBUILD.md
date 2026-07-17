# Icon master rebuild — layered SVG reconstructed by measurement

**Master:** `apps/frontend/assets/scan-action-mark.svg` (6,024 bytes, pure vector)
**Reference:** `ic_launcher-512.jpg` == `app_icon_512x512.png`, md5 `6b46ba3b40a8f9b9ffb62816242b3223`
**Date:** 2026-07-17 · **Status:** built and verified. **No assets generated. No PR.** Awaiting approval.
**Renderer used for verification:** resvg (`resvg-py`, free, pip). Chrome headless was tried first and
abandoned — it silently forwards `--screenshot` to the user's running browser session and exits 0
without writing a file, even with an isolated `--user-data-dir`. Not worth fighting; resvg is a better
fit anyway (SVG 1.1 filters, deterministic, no browser dependency).

---

## Verdict

The mark is rebuilt as clean, hand-constructed, parametric vector geometry — 5 paths and 3 rects, no
traced junk nodes, no embedded raster. It is visually indistinguishable from the store icon, and the
`#mark` layer cuts out cleanly on transparency. **All 26 assets are now producible.**

| Metric (512×512, vs reference) | Value |
|---|---|
| mean absolute error | **1.42 / 255** (0.56%) |
| RMSE | **4.23** |
| max absolute error | 177 (was 255 before the fold fix) |
| pixels within 8/255 | 95.97% |
| pixels within 24/255 | **98.81%** |
| pixels within 64/255 | **99.83%** |
| **background region** | **0.68** mean — the gradient is essentially exact |

Per-region mean abs: background 0.68 · doc-top 3.38 · doc-left 3.52 · doc-bottom 3.35 · fold 4.31 ·
check 3.02 · sparkles 4.44 · beam 3.13.

**The residual is edge-localised and irreducible.** The reference is a 4:2:0 baseline JPEG whose edges
ramp over ~3px; the rebuild is sharp vector. The diff image (`docs/icon-rebuild/01-...png`, right panel,
amplified 4×) is *only* thin outlines — there is no area error anywhere. I tested this directly: blurring
the rebuild to fake the reference's softness moves overall error just 1.418 → 1.692 at best (σ=0.4–0.6),
so the softness is not hiding a shape mismatch. **I did not blur the master to chase the number** — the
reference's softness is a JPEG defect, not design, and a sharp master is the entire point.

---

## Corrections to the brief — I trusted the pixels

Every figure in the brief came from my own earlier inspection. Four were wrong.

### 1. The checkmark is `#8AFEF8`, not `#7AFFF7`

`#7AFFF7` was the single brightest-G pixel in the check region — an outlier I quoted as if it were the
fill. Core-sampled mean is `#8AFEF8`; the beam core is `#8DFAFA`. Those are within JPEG noise of each
other, so the master uses **one shared cyan `#8CFCF9`** for check and beam. Unifying them did not worsen
the fit.

### 2. "Document + checkmark bbox x 125–386" is document-**only**

That bbox came from an `R≥200` threshold. The checkmark is cyan (R≈138) and was **excluded by it**. The
check actually reaches x≈423. Real extents: doc+check+sparkles x 124–422, all ink x 73–438, y 92–419.

### 3. The document outline stroke is **16.5**, not 19

19 came from the generous `residual>18` mask, which catches the antialiasing tail. Measuring the
sub-pixel **R-channel mass** of each stroke gives 16.65 (verticals) / 16.38 (horizontals) consistently
across five sample rows. Centres likewise moved ~0.5–1px (docL 132→133.06, docR 378→378.86).

### 4. The gradient is **not** linear in sRGB, and its axis is **−42.10°**, not 45°

A clamped-linear sRGB fit leaves G rms≈4.0. The profile is **flat navy `#00286D` until t≈0.22, ramps,
then flat teal `#00BB9F` after t≈0.82** — clamped at both ends. Rather than reverse-engineer the
generator's easing I sampled the measured 1-D profile into **17 stops**, which reproduces any easing by
construction. Result: background mean error 0.68. Axis found by sweeping within-band stdev (minimum
0.9456 at −42.10°); the naive doubled-angle estimate said −36.8° and was noise-biased.

Your corner samples were right (TL `#005D81`, TR `#02BC9F`, BL `#00286D`, BR `#007189`) and so was
"reproduce the bloom, it is part of the mark" — see below.

---

## Two structural features neither of us knew about

These are the reason the first draft looked wrong, and they matter for every downstream asset.

### The document outline is deliberately BROKEN where the checkmark crosses it

The right edge is white down to y=226, **absent from y=227 to y=296**, and white again below. Verified by
sampling column x=378 and, under the beam's bloom, by differencing against a bloom-only column (x=100) —
the doc's contribution jumps +0.44 at y=296. The break has **flat (butt) caps**, not round. It is a
designed knockout that keeps the check legible, not an artifact. The master reproduces it via `gapT`/`gapB`.

### The fold's inner corner is genuinely rounded (r≈15.06)

`stroke-linejoin="round"` rounds only the *outer* side of a join — the inner corner stays sharp. The
reference's fold flap has a visibly rounded **inner** corner, which requires an arc in the path itself.
Adding `foldR` dropped the fold region from 6.20 → 3.82. See `docs/icon-rebuild/04-fold-detail.png`.

The fold overall: the outline runs along the top to the apex (311.62, 100.38), cuts **45°** down-right to
(378.86, 167.88) where it meets the right edge; the flap is an L from the apex down and across. Flap +
diagonal enclose a triangle of **background** — it is not filled.

---

## The cutout works — this is what the flat raster could not do

`docs/icon-rebuild/02-cutout-proof-transparent-and-navy.png` — `#mark` rendered with `#background`
deleted, composited over a checkerboard and over `#0f172a`.

```
alpha extrema      : 0 .. 255   (a real cutout)
fully transparent  : 85.30%
fully opaque       :  7.96%
partial (AA/bloom) :  6.75%
corner (0,0) alpha : 0  -> transparent
mark alpha bbox    : x 73..438, y 92..419
```

The checkerboard shows through the document's interior and the bloom's partial alpha survives. This is
exactly the operation that was impossible on the JPEG, where the cyan check (R=138) and the semi-transparent
beam bloom are chromatically inseparable from the teal gradient.

---

## Safe-zone recommendation

**Map the whole 512 master onto the central 72dp (288px) of the 432×432 foreground: `scale(0.5625)
translate(72,72)`.** Do **not** shorten the beam. Do not map 1:1.

`docs/icon-rebuild/03-adaptive-safezone-masks.png` — annotated foreground (red = 72dp mask viewport,
yellow = 66dp safe circle), then the same composite under a real circular mask and a squircle mask.

### On the scan-line — you asked me to flag rather than silently crop it

The beam spans **71.5% of the 512 canvas**, which does exceed a 66.67% *of-canvas* safe zone. But that
framing is the trap. Because the entire canvas is scaled into the 72dp viewport, the beam becomes 205.3px
— **71.3% of the viewport**, i.e. the same proportion it has in the store icon — and its ends land at
**radius 104.6**, well inside the 66dp safe circle (r=132). **It is not clipped and needs no change.**
Shortening it would be a redesign, and a redesign is the violation.

### Why 1:1 is wrong

| Mapping | Doc worst corner radius | Under 72dp circular mask (r=144) |
|---|---|---|
| Naive 1:1 (scale 0.84375) | **196.9** | **document corners CLIPPED** |
| Proposed (scale 0.5625) | 113.4 (actual inked px) | fits, ~19px margin inside the 66dp safe circle |

Measured on **actual inked pixels**, not bounding-box corners — the bbox-corner test is pessimistic
(it reported 131.3 for geometry whose real ink maxes at 113.4) because the doc's corners are rounded and
its bbox corners carry no ink.

This mapping also preserves proportion exactly: doc+check spans **58.4%** of the store icon's canvas and
**58.2%** of the adaptive icon's visible viewport. The mark matching the store listing at the same
apparent size is the whole objective.

**Consequence to accept:** the background gradient must be scaled the same way, with its clamped ends
extended to fill the 108dp bleed — otherwise the visible circle would show only the middle ~67% of the
gradient ramp and read flatter than the store icon. The master's gradient is already clamped flat at both
ends, so extending it is free.

---

## Risks and what I'd still push back on

1. **This is a reconstruction, not a recovery.** It is a very good fit, but it is not the original bytes
   and cannot be. If the generator's output is ever regenerated or a designer produces a true original,
   that supersedes this file. Recorded so nobody later mistakes this for provenance.
2. **The master is sharper than the store icon.** Downstream PNGs will have crisper edges than the 512
   listing image. That is an improvement, and you said match-don't-improve — but it is unavoidable (the
   alternative is baking JPEG blur into a master, which is worse) and it is invisible at every density we
   ship. Flagging because it is the one place the rebuild knowingly differs.
3. **Nothing is verified against a real Android renderer yet.** resvg ≠ AAPT2's vector rasteriser ≠
   Skia. The plan targets PNG generation, so this only matters if we later want `ic_launcher_foreground`
   as a `VectorDrawable` — which cannot express `feGaussianBlur` and would force the bloom to be baked or
   dropped. **Recommendation: generate PNGs, not VectorDrawables.**
4. **The store listing icon is still the odd one out.** This master reproduces it faithfully, but the PWA
   icons (`apps/frontend/public/icons/*`) remain a completely different navy-arrow mark. Fixing the
   launcher does not fix that. Still a follow-up, still not a blocker for the rejection.
5. **Both reference files are still untracked at repo root.** Decide whether to commit them as provenance
   or gitignore them.

---

## Reproducing / re-tuning

`docs/icon-rebuild/build-master.py` is the parametric generator — `P=dict(...)` holds every tunable, and
`build(P)` emits the SVG. Parameters were fitted by coordinate descent against the reference (region-scoped
per element). The header comment inside the SVG documents every measured value.

Fit progression: 3.68 → 3.26 (gap + check) → 1.76 (measured stroke widths/centres) → 1.51 (sparkle cubic
+ descent) → 1.44 (fold radius) → **1.42** (check geometry).
