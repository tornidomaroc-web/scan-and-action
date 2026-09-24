/**
 * The month ledger: what the ledger home screen shows for one month of one
 * organisation. PURE: no database, no clock. Every rule that decides which
 * receipt counts, in which month, in which currency and under which category
 * lives here and only here, so the fixture test in ledgerCore.test.ts proves
 * the whole money figure and the reconciliation script checks the same rules
 * against a direct SQL read of production.
 *
 * THE RULES, each with the evidence it was ruled on (read 2026-09-23, from the
 * code and from a read-only query of the owner's three organisations):
 *
 * 1. STATUS. COMPLETED and NEEDS_REVIEW count. Everything else does not:
 *    REJECTED is the user's own "this is not an expense", and PROCESSING,
 *    FAILED and LIMIT_REACHED rows carry no extraction.
 *
 * 2. AMOUNT. A user's correction wins over the extraction: `manual_amount` if
 *    present, else `TOTAL_AMOUNT`. That is the rule engine's own priority
 *    (resolveAmount in ruleEngineService.ts), and it moves a real figure: 9 of
 *    the owner's documents carry a correction, one of them 85 against an
 *    extracted 71.11. Reading TOTAL_AMOUNT alone would show the number he
 *    already fixed. A row with neither does not count.
 *
 * 3. DUPLICATES. A row whose `decision_reason` says "Possible duplicate expense"
 *    does not count until the user keeps it. KEPT means the latest
 *    `review_action` is 'marked_valid': that is the only action the detail
 *    screen offers on a flagged row (FixActionPanel.tsx), and re-evaluation
 *    after it flags the row AGAIN (the twin still exists), so the decision fact
 *    can never say "kept". Measured: every duplicate group in the owner's data
 *    keeps exactly one unflagged copy, so no receipt disappears. The flag lives
 *    in facts, not in Document.status, so status alone cannot apply this rule.
 *
 * 4. MONTH. The date printed on the document (`TRANSACTION_DATE`) defines the
 *    month. The adapter stores it from a 'YYYY-MM-DD' string, so it lands at
 *    00:00 UTC (108 of 108 dated rows measured) and its UTC calendar date IS
 *    the printed date: no timezone applies to it, and converting it would move
 *    a receipt dated the 1st into the previous month west of UTC. A document
 *    with no printed date (36 of 144) falls back to the day it was uploaded, in
 *    the CALLER's time zone (`timeZone`, IANA, default UTC), because that is the
 *    month the person experienced. Each receipt reports which source it used.
 *
 * 5. CURRENCY. Per currency, never summed across. The currency is the
 *    TOTAL_AMOUNT fact's, also for a corrected amount: the correction form
 *    changes the figure, not the currency, and 8 of the 9 stored corrections
 *    re-type the extracted figure exactly. Anything that is not a 3-letter code
 *    (null, 'UNKNOWN', a correction with no extracted total) is an UNKNOWN
 *    currency: its own line with `currency: null`, listed last whatever its
 *    size, never folded into another currency.
 *
 * 6. CATEGORY. The `category` fact, if it names one of the eight. A row with an
 *    amount and no category (or an off-list one) still counts in the total and
 *    is placed under Other in the split, so the eight always sum to the total;
 *    it is returned with `category: null` and counted in `uncategorizedCount`,
 *    so the screen can say "not yet sorted" rather than pretend it was.
 *
 * MONEY is added in integer thousandths, so 0.1 + 0.2 is 0.3 and three-decimal
 * currencies (KWD, BHD, OMR, JOD, TND) are exact. Beyond three decimals an
 * amount is rounded to three.
 */
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../expenseCategories';

export const COUNTED_STATUSES = ['COMPLETED', 'NEEDS_REVIEW'] as const;
export const DUPLICATE_REASON = 'Possible duplicate expense';
export const KEEP_ACTION = 'marked_valid';

/** The only fact keys the ledger reads. The service selects exactly these. */
export const LEDGER_FACT_KEYS = [
  'TOTAL_AMOUNT',
  'manual_amount',
  'category',
  'TRANSACTION_DATE',
  'decision_reason',
  'review_action',
] as const;

export interface LedgerFactInput {
  key: string;
  valueString: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  currency: string | null;
  sourceSpan: string;
}

export interface LedgerDocInput {
  id: string;
  status: string;
  uploadedAt: Date;
  merchant: string | null;
  facts: LedgerFactInput[];
}

export interface LedgerReceipt {
  documentId: string;
  date: string; // YYYY-MM-DD
  dateSource: 'document' | 'uploaded';
  amount: number;
  amountSource: 'extracted' | 'corrected';
  category: ExpenseCategory | null;
  merchant: string | null;
  status: string;
}

export interface LedgerCategoryLine {
  category: ExpenseCategory;
  total: number;
  receiptCount: number;
}

export interface LedgerCurrency {
  currency: string | null;
  total: number;
  receiptCount: number;
  uncategorizedCount: number;
  categories: LedgerCategoryLine[];
  receipts: LedgerReceipt[];
}

export interface LedgerMonth {
  month: string; // YYYY-MM
  timeZone: string;
  currencies: LedgerCurrency[];
  /** Rows dated in this month that did not count, by reason. */
  excluded: { status: number; duplicate: number; noAmount: number };
}

export type Verdict =
  | { counted: true; receipt: LedgerReceipt; currency: string | null }
  | { counted: false; reason: 'status' | 'duplicate' | 'noAmount'; date: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: unknown): month is string {
  return typeof month === 'string' && MONTH_RE.test(month);
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** [start, end) of the month as UTC instants: the window a printed date falls in. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`invalid month ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

const utcDate = (d: Date) => d.toISOString().slice(0, 10);

function localDate(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const toMilli = (v: number) => Math.round(v * 1000);
const fromMilli = (m: number) => m / 1000;

const isCategory = (v: string | null): v is ExpenseCategory =>
  v !== null && (EXPENSE_CATEGORIES as readonly string[]).includes(v);

// Guarded: Intl.supportedValuesOf is Node 18+, and nothing in this repository
// pins the production runtime. Without it, any 3-letter code passes.
const ISO_CURRENCIES: ReadonlySet<string> | null =
  typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('currency')) : null;

/** A real ISO 4217 code, so a stray 3-letter word ("TVA", "TTC") is not a currency. */
export function isIsoCurrency(code: string | null | undefined): code is string {
  if (typeof code !== 'string') return false;
  return ISO_CURRENCIES ? ISO_CURRENCIES.has(code) : /^[A-Z]{3}$/.test(code);
}

export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

const fact = (doc: LedgerDocInput, key: string) => doc.facts.find(f => f.key === key);

/** The rules above, applied to one document. Exported for the reconciliation. */
export function judge(doc: LedgerDocInput, timeZone: string): Verdict {
  const printed = fact(doc, 'TRANSACTION_DATE')?.valueDate ?? null;
  const date = printed ? utcDate(printed) : localDate(doc.uploadedAt, timeZone);
  const dateSource = printed ? 'document' : 'uploaded';

  if (!(COUNTED_STATUSES as readonly string[]).includes(doc.status)) {
    return { counted: false, reason: 'status', date };
  }

  const manual = fact(doc, 'manual_amount')?.valueNumber;
  const total = fact(doc, 'TOTAL_AMOUNT');
  const corrected = typeof manual === 'number' && Number.isFinite(manual);
  const amount = corrected ? manual : total?.valueNumber;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { counted: false, reason: 'noAmount', date };
  }

  const flagged = (fact(doc, 'decision_reason')?.valueString ?? '').includes(DUPLICATE_REASON);
  const kept = fact(doc, 'review_action')?.valueString === KEEP_ACTION;
  if (flagged && !kept) return { counted: false, reason: 'duplicate', date };

  const rawCategory = fact(doc, 'category')?.valueString ?? null;
  return {
    counted: true,
    currency: normalizeCurrencyCode(total?.currency),
    receipt: {
      documentId: doc.id,
      date,
      dateSource,
      amount: fromMilli(toMilli(amount)),
      amountSource: corrected ? 'corrected' : 'extracted',
      category: isCategory(rawCategory) ? rawCategory : null,
      merchant: doc.merchant,
      status: doc.status,
    },
  };
}

export function buildLedger(docs: LedgerDocInput[], month: string, timeZone = 'UTC'): LedgerMonth {
  if (!isValidMonth(month)) throw new Error(`invalid month ${month}`);
  if (!isValidTimeZone(timeZone)) throw new Error(`invalid time zone ${timeZone}`);

  const excluded = { status: 0, duplicate: 0, noAmount: 0 };
  const groups = new Map<string | null, { milli: number; receipts: LedgerReceipt[]; byCat: Map<ExpenseCategory, { milli: number; n: number }> }>();

  for (const doc of docs) {
    const v = judge(doc, timeZone);
    const date = v.counted ? v.receipt.date : v.date;
    if (date.slice(0, 7) !== month) continue;
    if (!v.counted) {
      excluded[v.reason]++;
      continue;
    }
    let g = groups.get(v.currency);
    if (!g) {
      g = { milli: 0, receipts: [], byCat: new Map(EXPENSE_CATEGORIES.map(c => [c, { milli: 0, n: 0 }])) };
      groups.set(v.currency, g);
    }
    const m = toMilli(v.receipt.amount);
    g.milli += m;
    g.receipts.push(v.receipt);
    const line = g.byCat.get(v.receipt.category ?? 'Other')!;
    line.milli += m;
    line.n++;
  }

  const currencies: LedgerCurrency[] = [...groups.entries()].map(([currency, g]) => ({
    currency,
    total: fromMilli(g.milli),
    receiptCount: g.receipts.length,
    uncategorizedCount: g.receipts.filter(r => r.category === null).length,
    categories: EXPENSE_CATEGORIES.map((category, i) => ({ category, i, ...g.byCat.get(category)! }))
      .sort((a, b) => b.milli - a.milli || a.i - b.i)
      .map(({ category, milli, n }) => ({ category, total: fromMilli(milli), receiptCount: n })),
    receipts: g.receipts.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0),
  }));

  // Largest total first; the unknown currency last whatever its size; a tie
  // broken by code so the order never depends on the database's row order.
  currencies.sort((a, b) => {
    if ((a.currency === null) !== (b.currency === null)) return a.currency === null ? 1 : -1;
    return b.total - a.total || (a.currency ?? '').localeCompare(b.currency ?? '');
  });

  return { month, timeZone, currencies, excluded };
}
