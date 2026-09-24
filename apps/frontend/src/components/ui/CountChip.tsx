import React from 'react';

// ============================================================================
// A count, drawn as an object rather than a line of text: a small pill on the
// muted surface. The type hierarchy the ledger home introduces, for every card
// in the app from the rollout PR on:
//
//   figure  extrabold, tabular, tight tracking, ink        (the money)
//   code    bold, small, muted                             (USD, MAD)
//   label   semibold, 14px, ink-secondary                  (Food, Receipts)
//   meta    medium, 12px, ink-muted                        (dates, notes)
//   count   this chip                                      (3 receipts)
//
// Four treatments, so no two kinds of information on a card look alike.
// ============================================================================

export const CountChip: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'warning' } & React.HTMLAttributes<HTMLSpanElement>> = ({
  children, tone = 'neutral', className = '', ...rest
}) => (
  <span
    {...rest}
    className={`inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-semibold leading-4 tabular-nums ${
      tone === 'warning' ? 'bg-warning-tint text-warning-text' : 'bg-surface-muted text-ink-secondary'
    } ${className}`}
  >
    {children}
  </span>
);
