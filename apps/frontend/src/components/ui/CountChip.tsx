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

const TONE = {
  neutral: 'bg-surface-muted text-ink-secondary',
  warning: 'bg-warning-tint text-warning-text',
  success: 'bg-success-tint text-success-text',
  danger: 'bg-danger-tint text-danger-text',
  accent: 'bg-accent-tint text-accent-text',
} as const;

export const CountChip: React.FC<{ children: React.ReactNode; tone?: keyof typeof TONE } & React.HTMLAttributes<HTMLSpanElement>> = ({
  children, tone = 'neutral', className = '', ...rest
}) => (
  <span
    {...rest}
    className={`inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-semibold leading-4 tabular-nums ${TONE[tone]} ${className}`}
  >
    {children}
  </span>
);
