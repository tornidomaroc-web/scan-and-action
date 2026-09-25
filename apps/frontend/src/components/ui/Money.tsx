import React from 'react';
import { Lang, moneyParts } from '../../lib/ledgerView';

// ============================================================================
// An amount and its code, laid out for either direction: the number is
// isolated LTR, the code follows it, and the label names the currency for a
// screen reader. Lifted out of LedgerScreen.tsx for the Search screen
// (2026-09-25) so the two draw an amount with one component. It formats and
// never computes (lib/ledgerView.ts says why).
// ============================================================================

export const Money: React.FC<{
  amount: number; currency: string | null; lang: Lang; noCurrency: string; numberClass?: string; codeClass?: string;
}> = ({ amount, currency, lang, noCurrency, numberClass = '', codeClass = '' }) => {
  const p = moneyParts(amount, currency, lang);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1" aria-label={`${p.number} ${p.name ?? p.code ?? noCurrency}`}>
      <bdi dir="ltr" data-ledger-amount className={`tabular-nums ${numberClass}`}>{p.number}</bdi>
      <span className={codeClass}>{p.code ?? noCurrency}</span>
    </span>
  );
};
