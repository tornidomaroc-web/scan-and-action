import React from 'react';

// ============================================================================
// THE BRAND MARK — ONE MARK, TWO WEIGHTS.
// ============================================================================
// `apps/frontend/assets/scan-action-mark.svg` is the master, and it is the Play
// Store listing icon: rendered at 512 and differenced against
// `docs/icon-rebuild/store-listing-icon-512-REFERENCE.jpg` it scores
// MAE 1.418/255, where a wrong file (public/icons/icon-512.png) scores 76.888.
// It is also what all 26 Android launcher/splash assets are generated from.
// That directory is NOT in the Vite build — not publicDir, not imported — so
// until this file existed the web app could not render the master at any size.
//
// ── WHY THERE ARE TWO CUTS AND NOT ONE ─────────────────────────────────────
// The master was drawn for a launcher icon and does not survive small sizes.
// Measured by rendering it with resvg and counting pixels:
//
//     render size   fully-opaque ink px   doc-left-edge pixel
//        16px               0                  #6DB4C8
//        30px               0                  #47749C      <- the header size
//        32px               6                  #BED0DE
//        48px              99                  #F2FFFE
//        64px             207                  #FFFFFF
//
// At 30px the entire mark is anti-aliasing: its thinnest lines are the beam
// (7.6/512 = 0.45px), the check stroke (0.68px) and the document outline
// (0.97px). White renders as a muddy blue-grey because no pixel is ever fully
// covered. So SMALL_CUT below is a second drawing, not a scaled copy, and
// CUT_THRESHOLD_PX is the measured boundary where the master starts to hold.
//
// ── WHAT THE SMALL CUT DROPS, AND WHY EACH ONE ─────────────────────────────
// Every figure is the element's size at a 16px render (1 device px = 32 master
// units):
//
//     beam                 0.24px   haze
//     beam bloom (sigma)   0.25px   haze
//     small sparkle        0.75px extent   vanishes
//     large sparkle        1.40px extent   vanishes
//     fold FLAP            0.52px stroke enclosing a 2.10px triangle
//     right-edge knockout  2.13px gap in an 11px edge — reads as a broken box,
//                          not as the designed knockout it is at 512
//
// The fold itself is KEPT, as a 45deg chamfer on the outline. The flap's two
// segments enclose a triangle that cannot draw; the chamfer is the outline, so
// it survives. The folded-page silhouette is what carries the identity.
//
// Thickening alone could not have saved the check: its whole bounding box is
// 10.8% of the canvas (1.73px at 16px, with a 0.77px short limb), so thickening
// it yields a 1.73px blob. Holding the master's own limb-to-stroke ratio
// (2.13x) at a 2px stroke needs the check to occupy ~50% of the canvas. It is a
// re-layout, and that is why this is a drawing and not a transform.
//
// ── WHAT THE SMALL CUT DOES NOT CHANGE ─────────────────────────────────────
// Colour. The gradient below is the master's, all 17 stops, in order, and
// `brandMark.test.tsx` reads them back out of the master file and compares.
// Both cuts keep `viewBox="0 0 512 512"` for the same reason: the gradient is
// `gradientUnits="userSpaceOnUse"` with coordinates in the 512 space, so any
// other viewBox would force re-derived numbers, and re-derived numbers are how
// this repository got four marks in three blues in the first place.
//
// Square plate on both cuts. The master is square (Play and Android mask it
// themselves), so rounding only the small one would change the silhouette as a
// caller crosses 48px.
//
// ── STROKE WIDTH IS NOT A TASTE DECISION ───────────────────────────────────
// SMALL_CUT_STROKE = 64 because 2.0 device px is the width at which a band is
// guaranteed to fully cover at least one pixel at any subpixel offset, and at a
// 16px render 2.0px = 64 master units. Below that the mark greys out exactly
// the way the master does. A test pins it.
// ============================================================================

/**
 * Below this render size the master is anti-aliasing rather than drawing;
 * at and above it, it holds. Measured — see the table above.
 */
export const CUT_THRESHOLD_PX = 48;

/** 2.0 device px at a 16px render. See the note above; pinned by a test. */
export const SMALL_CUT_STROKE = 64;

/** The two ink colours. Shared by both cuts, and by the master. */
export const INK_WHITE = '#FFFFFF';
export const INK_CYAN = '#8CFCF9';

/**
 * Small cut, document outline: a rounded rectangle whose top-right corner is a
 * 45deg chamfer (the fold). Centre-line x 96..304, y 80..432, corner r 40,
 * chamfer 64. With a 64-wide stroke every edge band fully covers at least one
 * pixel column/row at a 16px render.
 */
export const SMALL_CUT_DOC =
  'M 136,80 H 240 L 304,144 V 392 A 40,40 0 0 1 264,432 H 136 A 40,40 0 0 1 96,392 V 120 A 40,40 0 0 1 136,80 Z';

/**
 * Small cut, check: enlarged and re-placed, not scaled. Short limb 130 units
 * (2.03x the stroke, against the master's 2.13x), long limb 235 (3.68x). Its
 * vertex sits on the document's right edge, which is the master's arrangement.
 */
export const SMALL_CUT_CHECK = 'M 208,276 L 300,368 L 456,192';

/** Ids are namespaced rather than the master's `bgGrad` / `beamBloom` so two
 *  instances on one page cannot collide with anything else in the document.
 *  Both cuts share the gradient id deliberately: it is the same gradient, in
 *  the same user space, so a duplicate definition paints identically. */
const GRAD_ID = 'sa-brand-grad';
const BLOOM_ID = 'sa-brand-bloom';

/** The master's gradient, verbatim. Do not edit by hand — `brandMark.test.tsx`
 *  reads these back out of `assets/scan-action-mark.svg` and compares in order. */
const GradientDef: React.FC = () => (
  <linearGradient
    id={GRAD_ID}
    gradientUnits="userSpaceOnUse"
    x1="-254.19"
    y1="229.68"
    x2="281.32"
    y2="-254.19"
  >
    <stop offset="0" stopColor="#00296C" />
    <stop offset="0.062" stopColor="#00296B" />
    <stop offset="0.125" stopColor="#00286D" />
    <stop offset="0.188" stopColor="#00286C" />
    <stop offset="0.25" stopColor="#012B6F" />
    <stop offset="0.312" stopColor="#003772" />
    <stop offset="0.375" stopColor="#004578" />
    <stop offset="0.438" stopColor="#00557D" />
    <stop offset="0.5" stopColor="#006784" />
    <stop offset="0.562" stopColor="#007A8B" />
    <stop offset="0.625" stopColor="#008E90" />
    <stop offset="0.688" stopColor="#009F96" />
    <stop offset="0.75" stopColor="#00AF9A" />
    <stop offset="0.812" stopColor="#00BA9E" />
    <stop offset="0.875" stopColor="#00BB9F" />
    <stop offset="0.938" stopColor="#00BB9F" />
    <stop offset="1" stopColor="#01BCA0" />
  </linearGradient>
);

/** The full master, transcribed from `assets/scan-action-mark.svg`. Geometry
 *  and colour are verbatim; only the two ids are namespaced. */
const FullCut: React.FC = () => (
  <>
    <defs>
      <GradientDef />
      <filter
        id={BLOOM_ID}
        x="-5%"
        y="-1200%"
        width="110%"
        height="2500%"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="0 8.0" />
      </filter>
    </defs>
    <rect x="0" y="0" width="512" height="512" fill={`url(#${GRAD_ID})`} />
    <g
      fill="none"
      stroke={INK_WHITE}
      strokeWidth="16.5"
      strokeLinecap="butt"
      strokeLinejoin="round"
    >
      <path d="M 378.855,227.6 V 167.875 L 311.62,100.38 H 149.617 A 16.562,16.562 0 0 0 133.055,116.942 V 394.788 A 16.562,16.562 0 0 0 149.617,411.35 H 362.293 A 16.562,16.562 0 0 0 378.855,394.788 V 295.9" />
      <path d="M 311.62,100.38 V 152.813 A 15.062,15.062 0 0 0 326.682,167.875 H 378.855" />
    </g>
    <g fill={INK_WHITE}>
      <path d="M 341.39,206.073 C 343.39,222.66 347.14,226.41 363.727,228.41 C 347.14,230.41 343.39,234.16 341.39,250.747 C 339.39,234.16 335.64,230.41 319.053,228.41 C 335.64,226.41 339.39,222.66 341.39,206.073 Z" />
      <path d="M 321.112,242.48 C 321.812,250.83 324.762,253.78 333.112,254.48 C 324.762,255.18 321.812,258.13 321.112,266.48 C 320.412,258.13 317.462,255.18 309.112,254.48 C 317.462,253.78 320.412,250.83 321.112,242.48 Z" />
    </g>
    <path
      d="M 361.85,249.662 L 379.11,267.05 L 417.275,228.231"
      fill="none"
      stroke={INK_CYAN}
      strokeWidth="11.526"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="73.5"
      y="288.6"
      width="365.0"
      height="7.6"
      fill={INK_CYAN}
      filter={`url(#${BLOOM_ID})`}
    />
    <rect x="73.5" y="288.6" width="365.0" height="7.6" fill={INK_CYAN} />
  </>
);

/** The small cut. Same plate, same two ink colours, two elements. */
const SmallCut: React.FC = () => (
  <>
    <defs>
      <GradientDef />
    </defs>
    <rect x="0" y="0" width="512" height="512" fill={`url(#${GRAD_ID})`} />
    <path
      d={SMALL_CUT_DOC}
      fill="none"
      stroke={INK_WHITE}
      strokeWidth={SMALL_CUT_STROKE}
      strokeLinejoin="round"
    />
    <path
      d={SMALL_CUT_CHECK}
      fill="none"
      stroke={INK_CYAN}
      strokeWidth={SMALL_CUT_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

export interface BrandMarkProps {
  /** Rendered edge length in CSS px. This, not a flag, chooses the cut:
   *  below CUT_THRESHOLD_PX the small cut, at or above it the full master. */
  size: number;
  className?: string;
}

/**
 * The Scan & Action mark. Callers pass a size; the component picks the cut that
 * actually draws at that size. There is no `cut` override on purpose — a caller
 * choosing the wrong one is precisely the failure this replaces.
 *
 * Carries its own plate, so it needs no dark-mode variant: on the dark header
 * surface (#1E293B) the plate's teal end measures 6.00:1 and its white ink far
 * higher. The component it replaces was a flat #0f172a plate at 1.22:1, which
 * dissolved into the surface and left its strokes floating.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="presentation"
  >
    {size >= CUT_THRESHOLD_PX ? <FullCut /> : <SmallCut />}
  </svg>
);
