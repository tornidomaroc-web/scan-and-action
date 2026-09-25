/**
 * Receipt search: what the Search screen shows for one organisation. PURE: no
 * database, no clock. Every money decision is `judge` from ledgerCore, the
 * same function the ledger home is built on, so a receipt found here counts
 * exactly as it counts there, and a total here is the ledger's total for the
 * same receipts. receiptSearch.test.ts proves that against buildLedger on
 * the ledger's own fixture, for every month and every category in it.
 *
 * Nothing here converts or adds across currencies: each currency is its own
 * line, added in integer thousandths as buildLedger does.
 *
 * TEXT. A query matches a document when every whitespace-separated word of it
 * is a substring of the merchant or the file name, after both sides are
 * folded: lower case, accents stripped (é = e), Arabic letters unified
 * (أ إ آ = ا, ة = ه, ى = ي, tatweel and harakat removed). The vendor entity
 * is the merchant the row shows, so a match is always visible on the row.
 *
 * MODES. With no query, no category and no month the screen shows the most
 * recent receipts ('recent'): a bounded list, no totals, since a total over
 * ten rows of an unbounded set would be a wrong answer to "how much". With
 * any of the three the whole match is returned with its per-currency totals
 * ('filtered'), and the matching rows the ledger does not count are listed
 * apart under `notCounted`, each with its reason, so a rejected or duplicate
 * receipt is still findable and never adds to a figure.
 */
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../expenseCategories';
import { isValidMonth, isValidTimeZone, judge, LedgerDocInput, LedgerReceipt } from './ledgerCore';

export const RECENT_LIMIT = 10;

export interface SearchDocInput extends LedgerDocInput {
  fileName: string | null;
}

export interface SearchQuery {
  q: string;
  category: ExpenseCategory | null;
  month: string | null; // YYYY-MM, or null for every month
  timeZone: string;
}

export interface SearchHit extends LedgerReceipt {
  /** The receipt's own currency (an ISO code, or null when none was read). */
  currency: string | null;
}

export interface SearchCurrencyLine {
  currency: string | null;
  total: number;
  receiptCount: number;
}

export interface NotCountedHit {
  documentId: string;
  date: string;
  merchant: string | null;
  fileName: string | null;
  status: string;
  reason: 'status' | 'duplicate' | 'noAmount';
  /** Its own category, read as a counted row's is (ledgerCore): null when the fact is missing or off the list. */
  category: ExpenseCategory | null;
}

export interface SearchResult {
  mode: 'recent' | 'filtered';
  q: string;
  category: ExpenseCategory | null;
  month: string | null;
  timeZone: string;
  /** Newest first, each in its own currency. */
  receipts: SearchHit[];
  /** Largest total first, the unknown currency last; empty in 'recent' mode. */
  currencies: SearchCurrencyLine[];
  /** Matching rows the ledger does not count; empty in 'recent' mode. */
  notCounted: NotCountedHit[];
}

export function isCategory(v: unknown): v is ExpenseCategory {
  return typeof v === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

const ARABIC_MARKS = /[ً-ْٰـ]/g; // harakat, dagger alef, tatweel

/** The folding applied to both the query and the document text. Exported for the screen's tests. */
export function foldText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function queryWords(q: string): string[] {
  return foldText(q).split(' ').filter(Boolean);
}

function matchesText(words: string[], doc: SearchDocInput): boolean {
  if (words.length === 0) return true;
  const hay = foldText(`${doc.merchant ?? ''} ${doc.fileName ?? ''}`);
  return words.every(w => hay.includes(w));
}

const toMilli = (v: number) => Math.round(v * 1000);
const fromMilli = (m: number) => m / 1000;

const newestFirst = <T extends { date: string; documentId: string }>(a: T, b: T) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0;

export function searchReceipts(docs: SearchDocInput[], query: SearchQuery): SearchResult {
  if (query.month !== null && !isValidMonth(query.month)) throw new Error(`invalid month ${query.month}`);
  if (!isValidTimeZone(query.timeZone)) throw new Error(`invalid time zone ${query.timeZone}`);
  if (query.category !== null && !isCategory(query.category)) throw new Error(`invalid category ${query.category}`);

  const words = queryWords(query.q);
  const filtered = words.length > 0 || query.category !== null || query.month !== null;
  const q = words.join(' ');

  const receipts: SearchHit[] = [];
  const notCounted: NotCountedHit[] = [];
  const groups = new Map<string | null, { milli: number; n: number }>();

  for (const doc of docs) {
    if (!matchesText(words, doc)) continue;
    const v = judge(doc, query.timeZone);
    const date = v.counted ? v.receipt.date : v.date;
    if (query.month !== null && date.slice(0, 7) !== query.month) continue;
    if (v.counted) {
      // The same reading of a missing category as the home's card filter:
      // a receipt with none sits under Other.
      if (query.category !== null && (v.receipt.category ?? 'Other') !== query.category) continue;
      receipts.push({ ...v.receipt, currency: v.currency });
      if (filtered) {
        const g = groups.get(v.currency) ?? { milli: 0, n: 0 };
        g.milli += toMilli(v.receipt.amount);
        g.n++;
        groups.set(v.currency, g);
      }
    } else if (filtered) {
      // Not counted, still findable. Its category is read from the fact
      // directly, since the verdict carries none for an uncounted row, and
      // travels with the row so the screen draws the tile it would draw if
      // the row were counted. The chip filter reads a missing one as Other,
      // as the ledger's card filter does; the row itself says none.
      const raw = doc.facts.find(f => f.key === 'category')?.valueString ?? null;
      const category: ExpenseCategory | null = isCategory(raw) ? raw : null;
      if (query.category !== null && (category ?? 'Other') !== query.category) continue;
      notCounted.push({ documentId: doc.id, date, merchant: doc.merchant, fileName: doc.fileName, status: doc.status, reason: v.reason, category });
    }
  }

  receipts.sort(newestFirst);
  notCounted.sort(newestFirst);

  if (!filtered) {
    return { mode: 'recent', q, category: null, month: null, timeZone: query.timeZone, receipts: receipts.slice(0, RECENT_LIMIT), currencies: [], notCounted: [] };
  }

  const currencies: SearchCurrencyLine[] = [...groups.entries()]
    .map(([currency, g]) => ({ currency, total: fromMilli(g.milli), receiptCount: g.n }))
    .sort((a, b) => {
      if ((a.currency === null) !== (b.currency === null)) return a.currency === null ? 1 : -1;
      return b.total - a.total || (a.currency ?? '').localeCompare(b.currency ?? '');
    });

  return { mode: 'filtered', q, category: query.category, month: query.month, timeZone: query.timeZone, receipts, currencies, notCounted };
}
