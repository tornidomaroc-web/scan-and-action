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

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div {...rest} className={`${panelClass} ${className}`} />
);
