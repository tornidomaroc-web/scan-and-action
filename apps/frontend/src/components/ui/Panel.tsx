import React from 'react';

// ============================================================================
// The card surface of the visual language: a 22px radius, the raised surface,
// a hairline ring and a soft shadow (a lit edge above, a shade below: the soft
// language of 2026-10-12). The ring is what keeps a card an object in dark
// mode, where the card sits two steps above the page so the shadow has
// somewhere to fall, and under Increase Contrast, where the shadow is gone.
//
// Every card on the ledger home is a Panel; the rollout PR moves the other
// screens onto it. `panelClass` is exported for the elements that must be a
// Link or a button themselves rather than wrap one.
// ============================================================================

export const panelClass = 'rounded-panel bg-surface-raised shadow-card ring-1 ring-line';

// One step higher, for the card a screen is about: the month's totals on Home,
// the receipt's header on Detail. The same surface and ring; a deeper shadow.
export const raisedPanelClass = 'rounded-panel bg-surface-raised shadow-raised ring-1 ring-line';

// A sheet or dialog over the scrim: the card surface at the highest shadow,
// ring kept, so in dark mode it reads as a lifted card with a hairline edge.
// The caller adds its corners (rounded-t-panel for a bottom sheet).
export const sheetClass = 'bg-surface-raised shadow-lg ring-1 ring-line';

// A cell pressed into a card: the inset surface and the pressed shadow, as a
// field is. Labels in it take ink-secondary, never ink-muted: muted on the
// inset measures 4.49:1 in light, under 4.5 (softSurfaces.test.ts).
export const insetCellClass = 'rounded-card bg-surface-alt shadow-pressed';

// A section's label: small, uppercase, spaced. ink-secondary, because it sits
// on the page, where muted measures 4.27:1 in light. No letter-spacing in
// Arabic: tracking pulls apart letters that are written joined.
export const eyebrowClass = 'text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary rtl:tracking-normal';

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div {...rest} className={`${panelClass} ${className}`} />
);
