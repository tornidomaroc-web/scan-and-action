// ============================================================================
// The amount a document counts for, read the way the ledger reads it.
// ============================================================================
// This mirrors rule 2 of apps/backend/src/services/ledger/ledgerCore.ts:
// a user's correction (`manual_amount`) wins over the extraction
// (`TOTAL_AMOUNT`), and the currency is the extracted total's, because the
// correction form stores none. Before this helper, `getAmount` in
// searchResultCard.ts returned the FIRST fact of type AMOUNT, which is the
// extraction: measured on production on 2026-09-25, 2 of the 10 corrected
// receipts showed their old, wrong amount on the Queue and Search rows while
// the ledger counted the correction. One helper, used by the detail, the
// queue and search, so the same receipt is the same amount everywhere.
//
// Order-independent: it looks facts up by key, never by position.
// ============================================================================

export interface LedgerAmount {
  amount: number;
  /** An ISO code as the ledger would show it, or null when none was read. */
  currency: string | null;
  source: 'corrected' | 'extracted';
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const byKey = (facts: unknown, key: string): any | undefined =>
  Array.isArray(facts) ? facts.find((f: any) => f && String(f.key) === key) : undefined;

export function ledgerCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** The extracted total: `TOTAL_AMOUNT`, or, on a row from before that key
 *  existed, the first fact typed AMOUNT that is not the correction. The
 *  ledger itself reads only `TOTAL_AMOUNT`; the fallback keeps an old row's
 *  amount visible on its own row, as it was, never counting it anywhere. */
function extractedTotal(facts: unknown): any | undefined {
  const total = byKey(facts, 'TOTAL_AMOUNT');
  if (total) return total;
  // Never a part for the whole: the tax line is typed AMOUNT too.
  const NOT_A_TOTAL = new Set(['manual_amount', 'TAX_AMOUNT']);
  return Array.isArray(facts)
    ? facts.find((f: any) => f && !NOT_A_TOTAL.has(String(f.key)) && String(f.factType || f.key || '').toUpperCase() === 'AMOUNT' && f.valueNumber != null)
    : undefined;
}

export function ledgerAmount(facts: unknown): LedgerAmount | null {
  const manual = byKey(facts, 'manual_amount');
  const total = extractedTotal(facts);
  const currency = ledgerCurrency(total?.currency);
  if (finite(manual?.valueNumber)) return { amount: manual.valueNumber, currency, source: 'corrected' };
  if (finite(total?.valueNumber)) return { amount: total.valueNumber, currency, source: 'extracted' };
  return null;
}

/** The document's currency as the ledger would read it, with or without an amount. */
export function documentCurrency(facts: unknown): string | null {
  return ledgerCurrency(extractedTotal(facts)?.currency ?? byKey(facts, 'TOTAL_AMOUNT')?.currency);
}
