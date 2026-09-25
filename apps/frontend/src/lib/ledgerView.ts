// ============================================================================
// The ledger home's view model: pure, no fetch, no React.
// ============================================================================
// THE MONEY RULE. Every amount shown comes from GET /api/ledger exactly as it
// was returned. This file formats amounts and reorders them; it never adds,
// subtracts or compares amounts of DIFFERENT currencies, and it never adds
// amounts at all: the per-currency totals and per-category lines are the API's.
// ledgerNoCrossCurrencySum.test.ts reads this file and LedgerScreen.tsx and
// fails on any arithmetic over an amount. Receipt COUNTS may be added across
// currencies (twelve receipts are twelve receipts in any currency).
//
// DIGITS. Every Intl formatter here passes numberingSystem 'latn', so Arabic
// shows Western digits on every engine. Relying on the bare 'ar' subtag is not
// enough: which digits it yields is the engine's CLDR data, not a promise.
// ============================================================================

import { LEDGER_CATEGORIES, LedgerCategory, LedgerMonth, LedgerReceipt } from './ledgerTypes';

export type Lang = 'en' | 'fr' | 'ar';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** YYYY-MM of `now` in the given IANA zone. */
export function currentMonth(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  return `${y}-${m}`;
}

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`invalid month ${month}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(index / 12);
  const mo = (index % 12) + 1;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/** The device's zone, or UTC when the engine cannot say. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const monthDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** "September 2026", "septembre 2026", "سبتمبر 2026". */
export function monthTitle(month: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(monthDate(month));
}

/** "September" alone, for the sentence above the figure. */
export function monthName(month: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(monthDate(month));
}

/** A printed or upload day, "29 May" / "29 mai" / "29 مايو". The date is a calendar day, so UTC. */
export function dayLabel(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${date}T00:00:00Z`));
}

// Direction and letter marks some locales put around a currency amount. The
// figure is laid out by the screen, so they only get in the way.
const BIDI_MARKS = /[‎‏؜]/g;

export interface MoneyParts {
  /** The amount with the locale's separators and Western digits, no currency. */
  number: string;
  /** The ISO code, shown as is: a symbol like $ would be ambiguous (USD, CAD, AUD…). */
  code: string | null;
  /** The currency's name in the reader's language, for screen readers and the figure's caption. */
  name: string | null;
}

export function moneyParts(amount: number, currency: string | null, lang: Lang): MoneyParts {
  if (currency) {
    try {
      const parts = new Intl.NumberFormat(lang, {
        style: 'currency', currency, currencyDisplay: 'code', numberingSystem: 'latn',
      }).formatToParts(amount);
      const number = parts
        .filter(p => p.type !== 'currency')
        .map(p => p.value)
        .join('')
        .replace(BIDI_MARKS, '')
        .trim();
      let name: string | null = null;
      try {
        name = new Intl.DisplayNames([lang], { type: 'currency' }).of(currency) ?? null;
      } catch {
        name = null;
      }
      return { number, code: currency, name: name && name !== currency ? name : null };
    } catch {
      // A code the engine does not know: fall through to a plain number, and
      // still show the code the API returned.
      return { number: plainNumber(amount, lang), code: currency, name: null };
    }
  }
  return { number: plainNumber(amount, lang), code: null, name: null };
}

function plainNumber(amount: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 3, numberingSystem: 'latn' })
    .format(amount)
    .replace(BIDI_MARKS, '');
}

export function formatCountLatn(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { numberingSystem: 'latn' }).format(n);
}

/**
 * The figure's size, stepped down by length so a very large amount is never
 * truncated, abbreviated ("80.6K") or wrapped mid-number on a phone.
 */
export function figureSizeClass(numberText: string): string {
  const n = numberText.length;
  if (n <= 9) return 'text-[44px]';
  if (n <= 12) return 'text-[36px]';
  if (n <= 15) return 'text-[30px]';
  return 'text-[24px]';
}

export interface CategoryCard {
  category: LedgerCategory;
  /** One line per currency that has spending here, in the ledger's currency order. */
  lines: { currency: string | null; total: number }[];
  receiptCount: number;
  /** Receipts counted under Other because no category was read. */
  notYetSorted: number;
}

/**
 * The eight categories as cards. A card lists each currency's own line from
 * the API (never a combined figure). Order: by receipt count, the one measure
 * that means the same in every currency, then the fixed category order.
 */
export function categoryCards(ledger: LedgerMonth): { active: CategoryCard[]; empty: LedgerCategory[] } {
  const cards: CategoryCard[] = LEDGER_CATEGORIES.map(category => {
    const lines: CategoryCard['lines'] = [];
    let receiptCount = 0;
    let notYetSorted = 0;
    for (const c of ledger.currencies) {
      const line = c.categories.find(l => l.category === category);
      if (line && line.receiptCount > 0) {
        lines.push({ currency: c.currency, total: line.total });
        receiptCount += line.receiptCount;
      }
      if (category === 'Other') notYetSorted += c.uncategorizedCount;
    }
    return { category, lines, receiptCount, notYetSorted };
  });
  const order = (c: LedgerCategory) => LEDGER_CATEGORIES.indexOf(c);
  const active = cards
    .filter(c => c.receiptCount > 0)
    .sort((a, b) => b.receiptCount - a.receiptCount || order(a.category) - order(b.category));
  const empty = cards.filter(c => c.receiptCount === 0).map(c => c.category);
  return { active, empty };
}

export interface ReceiptRow extends LedgerReceipt {
  currency: string | null;
}

/** Every counted receipt of the month, newest first, each in its own currency. */
export function receiptRows(ledger: LedgerMonth): ReceiptRow[] {
  const rows: ReceiptRow[] = ledger.currencies.flatMap(c => c.receipts.map(r => ({ ...r, currency: c.currency })));
  return rows.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0);
}

/** Receipts that count but still wait for the owner's review. */
export function needsReviewCount(ledger: LedgerMonth): number {
  return ledger.currencies.reduce((n, c) => n + c.receipts.filter(r => r.status === 'NEEDS_REVIEW').length, 0);
}

export function isEmptyMonth(ledger: LedgerMonth): boolean {
  return ledger.currencies.length === 0;
}

/**
 * The forms of a plural message, "one={n} receipt|other={n} receipts". Arabic
 * uses six categories (zero, one, two, few, many, other), French three, English
 * two; a two-form one/other switch reads "الإيصالات: 1" in Arabic, which is why
 * the message carries every form the language needs.
 */
export function pluralForms(message: string): Partial<Record<Intl.LDMLPluralRule, string>> {
  const forms: Partial<Record<Intl.LDMLPluralRule, string>> = {};
  for (const part of message.split('|')) {
    const eq = part.indexOf('=');
    if (eq > 0) forms[part.slice(0, eq) as Intl.LDMLPluralRule] = part.slice(eq + 1);
  }
  return forms;
}

/** The form the language's CLDR rules pick for n, with "{n}" filled in Western digits. */
export function plural(n: number, lang: Lang, message: string): string {
  const forms = pluralForms(message);
  const text = forms[new Intl.PluralRules(lang).select(n)] ?? forms.other ?? message;
  return text.replace('{n}', formatCountLatn(n, lang));
}
