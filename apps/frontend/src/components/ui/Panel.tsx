import React from 'react';

// ============================================================================
// The card surface of the visual language: a 20px radius, the raised surface,
// a hairline ring and a quiet shadow. The ring is what keeps a card an object
// in dark mode, where a shadow on #0F172A shows nothing.
//
// Every card on the ledger home is a Panel; the rollout PR moves the other
// screens onto it. `panelClass` is exported for the elements that must be a
// Link or a button themselves rather than wrap one.
// ============================================================================

export const panelClass = 'rounded-panel bg-surface-raised shadow-card ring-1 ring-line';

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div {...rest} className={`${panelClass} ${className}`} />
);
