/**
 * Rule D, the duplicate rule, as a pure function: which earlier document (if
 * any) a document is a later copy of. Shared by RuleEngineService (on every
 * ingestion and re-evaluation) and scripts/duplicateReevaluate.ts, so the
 * one-off re-evaluation and the live rule cannot disagree.
 *
 * A document is a DUPLICATE when an ORIGINAL exists: another document of the
 * same organisation and vendor (matched by the caller) that
 *   1. comes first: uploaded earlier, or at the same instant with a smaller id.
 *      So in any group of copies exactly the first is never flagged. Before
 *      2026-09-24 the rule matched ANY other copy, so re-evaluating a whole
 *      group flagged every member, the first included, and the receipt left
 *      the ledger altogether;
 *   2. is one the ledger counts by status (COMPLETED or NEEDS_REVIEW). A
 *      REJECTED, FAILED or PROCESSING document is not an expense, so it cannot
 *      be the original: a valid later copy of a rejected upload is the receipt,
 *      not a duplicate of nothing. Whether the candidate is itself flagged does
 *      not matter: the first counted member of a group is never flagged, so a
 *      chain always ends at a counted original;
 *   3. carries the same amount AS THE LEDGER READS IT (a correction over the
 *      extraction, compared in thousandths). The old query matched either key,
 *      so a receipt corrected from 71.11 to 85 still "owned" 71.11.
 *
 * CURRENCY IS NOT COMPARED, as it never was. Considered and rejected
 * 2026-09-24 on the owner's data: every same-vendor, same-amount group that
 * spans two currencies is ONE receipt read two ways (BRIGHTPATH ANALYTICS
 * 7282.31, printed 2026-05-29, extracted once CAD and twice USD; a 290 bill
 * corrected on both copies, stored USD and INR; a "SHOP NAME" template at
 * 16.50, USD and UNKNOWN), and none is two real expenses. Comparing it would
 * have counted each of those receipts twice. The ledger shows the receipt in
 * the surviving (first) copy's currency.
 */
import { COUNTED_STATUSES, normalizeCurrencyCode } from './ledger/ledgerCore';

export interface CopyFact {
  key: string;
  valueNumber: number | null;
  currency: string | null;
}

export interface CopyCandidate {
  id: string;
  uploadedAt: Date;
  status: string;
  facts: CopyFact[];
}

export interface CopySelf {
  id: string;
  uploadedAt: Date;
  amount: number;
}

export const toMilli = (v: number) => Math.round(v * 1000);

/** manual_amount over TOTAL_AMOUNT, as the ledger and resolveAmount read it. */
export function resolvedAmount(facts: CopyFact[]): number | null {
  const manual = facts.find(f => f.key === 'manual_amount')?.valueNumber;
  if (typeof manual === 'number' && Number.isFinite(manual)) return manual;
  const total = facts.find(f => f.key === 'TOTAL_AMOUNT')?.valueNumber;
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}

export function copyCurrency(facts: CopyFact[]): string | null {
  return normalizeCurrencyCode(facts.find(f => f.key === 'TOTAL_AMOUNT')?.currency);
}

/** a comes before b: earlier upload, or the same instant and a smaller id. */
export function comesFirst(a: { uploadedAt: Date; id: string }, b: { uploadedAt: Date; id: string }): boolean {
  const ta = a.uploadedAt.getTime();
  const tb = b.uploadedAt.getTime();
  return ta < tb || (ta === tb && a.id < b.id);
}

/** The earliest eligible original of `self` among same-vendor candidates, or null. */
export function findOriginal(self: CopySelf, candidates: CopyCandidate[]): CopyCandidate | null {
  const want = toMilli(self.amount);
  let best: CopyCandidate | null = null;
  for (const c of candidates) {
    if (c.id === self.id) continue;
    if (!(COUNTED_STATUSES as readonly string[]).includes(c.status)) continue;
    if (!comesFirst(c, self)) continue;
    const amt = resolvedAmount(c.facts);
    if (amt === null || toMilli(amt) !== want) continue;
    if (!best || comesFirst(c, best)) best = c;
  }
  return best;
}
