/**
 * Rule D, the duplicate rule, as a pure function: which copy (if any) a
 * document is a duplicate of. Shared by RuleEngineService (on every ingestion
 * and re-evaluation), services/duplicateGroupRecheck.ts (after any change to a
 * copy) and scripts/duplicateReevaluate.ts, so none of them can disagree.
 *
 * A GROUP is the documents of one organisation with the same vendor (matched
 * by the caller) and the same amount AS THE LEDGER READS IT (a correction over
 * the extraction, compared in thousandths; the old query matched either key,
 * so a receipt corrected from 71.11 to 85 still "owned" 71.11).
 *
 * Exactly one member of a group STAYS COUNTED: the KEEPER. Every other member
 * is a duplicate of it and is flagged. The keeper is chosen among the members
 * the ledger counts by status (COMPLETED or NEEDS_REVIEW; a REJECTED, FAILED
 * or PROCESSING document is not an expense, so a valid copy of a rejected
 * upload is the receipt, not a duplicate of nothing), highest first:
 *   a. the owner's own word: a copy he marked valid while it was NOT flagged
 *      (an "affirmed" copy) is never displaced by a better reading. Without
 *      this, a later better-read copy would flag it, the ledger would still
 *      count it as kept, and the receipt would count twice;
 *   b. currency specificity: an ISO 4217 code other than USD (2), then USD
 *      (1), then no usable currency (0). USD ranks below every other code
 *      because the adapter wrote it for a bare $, for "Rs", for the Arabic
 *      dirham sign and for no answer at all (normalizeCurrency in
 *      geminiAdapter.ts, before 2026-09-24), so a stored USD carries the least
 *      evidence of any code. Ruled 2026-09-24 on BRIGHTPATH ANALYTICS 7282.31
 *      (a Montreal invoice printing GST + QST and a bare $, stored once CAD
 *      and twice USD, CAD uploaded first) and Flame Kitchen 290 (a Tamil Nadu
 *      bill printing "Rs", stored USD first and INR later);
 *   c. the earliest copy: uploaded earlier, or at the same instant with a
 *      smaller id.
 * A copy the owner KEPT while it was flagged ("this one counts too") is never
 * the keeper: it stays flagged and counts on its own, so choosing it would
 * drop the receipt it was kept beside.
 *
 * Before 2026-09-24 the keeper was simply the earliest counted copy, and
 * before #243 there was no keeper at all (any other copy flagged a document,
 * so re-evaluating a group flagged every member and the receipt left the
 * ledger).
 *
 * CURRENCY IS NOT COMPARED to decide whether two copies are one receipt, as it
 * never was: every same-vendor, same-amount group in the owner's data that
 * spans two currencies is ONE receipt read two ways (the two above, and a
 * "SHOP NAME" template at 16.50, USD and UNKNOWN), and none is two real
 * expenses. Comparing it would count each of them twice. Currency only decides
 * which copy stays counted, because the ledger shows the receipt in the
 * keeper's currency.
 */
import { COUNTED_STATUSES, DUPLICATE_REASON, isIsoCurrency, KEEP_ACTION, normalizeCurrencyCode } from './ledger/ledgerCore';

export interface CopyFact {
  key: string;
  valueNumber: number | null;
  currency: string | null;
  /** Read for decision_reason and review_action only. */
  valueString?: string | null;
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
  /** Its own facts: its currency and the owner's marks on it. */
  facts: CopyFact[];
  /**
   * Its status. Omitted by the rule engine, which decides the verdict of a
   * document still being written (stored as PROCESSING): such a document is
   * judged as the counted receipt it is about to become.
   */
  status?: string;
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

/** 2: an ISO code other than USD; 1: USD; 0: no usable currency. */
export function currencySpecificity(facts: CopyFact[]): 0 | 1 | 2 {
  const code = copyCurrency(facts);
  if (!isIsoCurrency(code)) return 0;
  return code === 'USD' ? 1 : 2;
}

/**
 * The owner's mark on a copy: 'affirmed' when he marked it valid while it was
 * not flagged, 'keptCopy' when he kept it while it was flagged, else null.
 */
export function ownerMark(facts: CopyFact[]): 'affirmed' | 'keptCopy' | null {
  if (facts.find(f => f.key === 'review_action')?.valueString !== KEEP_ACTION) return null;
  const flagged = (facts.find(f => f.key === 'decision_reason')?.valueString ?? '').includes(DUPLICATE_REASON);
  return flagged ? 'keptCopy' : 'affirmed';
}

type Ranked = { id: string; uploadedAt: Date; facts: CopyFact[] };

/** a ranks above b as the copy that stays counted (a, b, c above). */
export function outranks(a: Ranked, b: Ranked): boolean {
  const aa = ownerMark(a.facts) === 'affirmed' ? 1 : 0;
  const ba = ownerMark(b.facts) === 'affirmed' ? 1 : 0;
  if (aa !== ba) return aa > ba;
  const ac = currencySpecificity(a.facts);
  const bc = currencySpecificity(b.facts);
  if (ac !== bc) return ac > bc;
  return comesFirst(a, b);
}

const isCounted = (status: string) => (COUNTED_STATUSES as readonly string[]).includes(status);

/**
 * The keeper `self` is a duplicate of, or null when `self` is the keeper or
 * has no counted twin. `candidates` are its same-vendor documents; only those
 * at its amount as the ledger reads it are its group.
 */
export function findOriginal(self: CopySelf, candidates: CopyCandidate[]): CopyCandidate | null {
  const want = toMilli(self.amount);
  let best: CopyCandidate | null = null;
  for (const c of candidates) {
    if (c.id === self.id) continue;
    if (!isCounted(c.status)) continue;
    if (ownerMark(c.facts) === 'keptCopy') continue;
    const amt = resolvedAmount(c.facts);
    if (amt === null || toMilli(amt) !== want) continue;
    if (!best || outranks(c, best)) best = c;
  }
  if (!best) return null;
  const selfEligible = (self.status === undefined || isCounted(self.status)) && ownerMark(self.facts) !== 'keptCopy';
  return selfEligible && outranks(self, best) ? null : best;
}
