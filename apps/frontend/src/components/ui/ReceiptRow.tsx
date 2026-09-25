import React from 'react';
import { Link } from 'react-router-dom';
import { CategoryIcon } from './CategoryIcon';
import { CountChip } from './CountChip';
import { Money } from './Money';
import { Lang, dayLabel } from '../../lib/ledgerView';
import type { LedgerReceipt } from '../../lib/ledgerTypes';

// ============================================================================
// One receipt as a row: the app's one treatment for a receipt in a list. The
// ledger home draws its month with it and the Search screen draws its
// results with it, so the same receipt is the same row on both. Lifted out
// of LedgerScreen.tsx on 2026-09-25, markup unchanged: the category tile,
// the merchant, the day (or when it was added), the category name, the
// review and edited tags, and the amount in its own currency from the API.
// ============================================================================

export interface ReceiptRowData extends LedgerReceipt {
  currency: string | null;
}

type RowStrings = {
  ledgerUnknownVendor: string; ledgerNoDate: string; ledgerNotSortedTag: string; ledgerNeedsReviewTag: string;
  ledgerCorrectedTag: string; ledgerNoCurrency: string;
  catFood: string; catTransport: string; catTravel: string; catShopping: string; catHealth: string; catBills: string; catOffice: string; catOther: string;
};

export const ReceiptRow: React.FC<{ r: ReceiptRowData; lang: Lang; s: RowStrings }> = ({ r, lang, s }) => (
  <Link
    to={`/documents/${r.documentId}`}
    data-ledger-row={r.documentId}
    className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-alt active:bg-surface-alt"
  >
    <CategoryIcon category={r.category ?? 'Other'} size="sm" />
    <span className="min-w-0 flex-1">
      <span
        dir="auto"
        className={`block truncate text-[15px] font-semibold ${r.merchant ? 'text-ink' : 'text-ink-muted'}`}
        title={r.merchant ?? undefined}
      >
        {r.merchant ?? s.ledgerUnknownVendor}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-ink-muted">
        <span data-ledger-date>
          {r.dateSource === 'uploaded' ? s.ledgerNoDate.replace('{day}', dayLabel(r.date, lang)) : dayLabel(r.date, lang)}
        </span>
        <span aria-hidden="true">·</span>
        <span>{r.category ? s[`cat${r.category}` as const] : s.ledgerNotSortedTag}</span>
        {r.status === 'NEEDS_REVIEW' && <CountChip tone="warning">{s.ledgerNeedsReviewTag}</CountChip>}
        {r.amountSource === 'corrected' && <CountChip>{s.ledgerCorrectedTag}</CountChip>}
      </span>
    </span>
    <span className="flex-none text-end">
      <Money
        amount={r.amount}
        currency={r.currency}
        lang={lang}
        noCurrency={s.ledgerNoCurrency}
        numberClass="text-[15px] font-bold text-ink"
        codeClass={`text-[11px] font-bold tracking-wide ${r.currency ? 'text-ink-muted' : 'text-warning-text'}`}
      />
    </span>
  </Link>
);
