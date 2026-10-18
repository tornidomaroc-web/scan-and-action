import React from 'react';

// ============================================================================
// THE BRAND MARK — ONE DRAWING, EVERY SIZE.
// ============================================================================
// `apps/frontend/assets/scan-action-mark.svg` is the master: concept A,
// "Viewfinder check", chosen by the owner on 2026-10-12. Every app-icon
// surface (iOS, Android, Play, web) is generated from it by
// `assets/generate-android-icons.py`; this component is the same drawing for
// the app's own headers, and index.html's favicon is this component's own
// markup (`brandMark.test.tsx` byte-compares both).
//
// ── WHY THERE IS NO SMALL CUT ANY MORE ─────────────────────────────────────
// The previous mark (document outline, sparkles, scan beam) had lines under
// one pixel wide at 30px and drew nothing below 48px, so this file carried a
// second, simplified drawing for small sizes. Concept A was chosen in part
// because it does not need one: four corners and a check, the thinnest stroke
// 42 of 512. Rendered at 1x it reads at 60, 40, 29, 20 and 16px (the icon
// round's size ladder). At 16px that stroke is 1.31 device px, under the
// 2.0px at which a band is guaranteed to cover a whole pixel, so on a 1x
// screen the corners anti-alias lighter than white; on a 2x screen (a 16px
// favicon is 32 device px) they are 2.6px. Stated, not hidden: the owner
// approved this drawing, and thickening it would be a different drawing.
//
// ── COLOUR ─────────────────────────────────────────────────────────────────
// The icon family only: navy #00286D, #006784, teal #00BB9F, cyan #8CFCF9,
// white. `brandMark.test.tsx` reads the stops, paths and colours back out of
// the master and compares. The viewBox is the master's 512 user space, which
// is what lets the gradients be copied verbatim (gradientUnits is
// userSpaceOnUse).
// ============================================================================

/** The two ink colours, shared with the master. */
export const INK_WHITE = '#FFFFFF';
export const INK_CYAN = '#8CFCF9';

/** Stroke widths in the 512 space, verbatim from the master. */
export const CORNER_STROKE = 42;
export const CHECK_STROKE = 48;

/** Ids are namespaced so two instances on one page cannot collide with
 *  anything else in the document. Two BrandMarks share them deliberately:
 *  the definitions are identical, so either one paints the same. */
const GRAD_ID = 'sa-brand-grad';
const LIFT_ID = 'sa-brand-lift';
const SHADOW_ID = 'sa-brand-shadow';

export interface BrandMarkProps {
  /** Rendered edge length in CSS px. The drawing is the same at every size. */
  size: number;
  className?: string;
}

/**
 * The Scan & Action mark. Carries its own square plate (the platforms mask the
 * app icon; in the app it sits square, as before), so it needs no dark-mode
 * variant.
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
    <defs>
      <linearGradient id={GRAD_ID} gradientUnits="userSpaceOnUse" x1="0" y1="512" x2="512" y2="0">
        <stop offset="0" stopColor="#00286D" />
        <stop offset="0.62" stopColor="#006784" />
        <stop offset="1" stopColor="#00BB9F" />
      </linearGradient>
      <radialGradient id={LIFT_ID} gradientUnits="userSpaceOnUse" cx="256" cy="194.56" r="317.44">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <filter id={SHADOW_ID} x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000000" floodOpacity="0.28" />
      </filter>
    </defs>
    <rect x="0" y="0" width="512" height="512" fill={`url(#${GRAD_ID})`} />
    <rect x="0" y="0" width="512" height="512" fill={`url(#${LIFT_ID})`} />
    <g filter={`url(#${SHADOW_ID})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g stroke={INK_WHITE} strokeWidth={CORNER_STROKE}>
        <path d="M 131 200 V 165 A 34 34 0 0 1 165 131 H 200" />
        <path d="M 312 131 H 347 A 34 34 0 0 1 381 165 V 200" />
        <path d="M 381 312 V 347 A 34 34 0 0 1 347 381 H 312" />
        <path d="M 200 381 H 165 A 34 34 0 0 1 131 347 V 312" />
      </g>
      <path d="M 196 260 L 239 303 L 321 215" stroke={INK_CYAN} strokeWidth={CHECK_STROKE} />
    </g>
  </svg>
);
