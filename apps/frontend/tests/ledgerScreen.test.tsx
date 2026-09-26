import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// The ledger home (build-order item 3). Every state the brief names, rendered
// through the real screen with only /api/ledger mocked: several currencies,
// the unknown currency, a row with no category, an undated row, an empty
// month, loading, an API error and the lockout, a very large figure, long
// Arabic and French vendor names, month navigation, the category filter, and
// Arabic RTL with Western digits.
// ============================================================================

const h = vi.hoisted(() => ({ getMonth: vi.fn() }));

// The factory replaces the whole module, so the real one (and the Supabase
// client behind apiConfig) is never loaded: CI has no Supabase env.
vi.mock('../src/services/ledgerService', () => ({ ledgerService: { getMonth: h.getMonth } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LedgerScreen } from '../src/screens/LedgerScreen';
import type { LedgerCurrency, LedgerMonth, LedgerReceipt } from '../src/lib/ledgerTypes';
import { currentMonth, deviceTimeZone } from '../src/lib/ledgerView';

type Lang = 'en' | 'fr' | 'ar';
let container: HTMLDivElement;
let root: Root;
let onNewScan: ReturnType<typeof vi.fn>;

function mount(lang: Lang = 'en', path = '/dashboard?month=2026-05', refreshCount = 0, pendingCount?: number) {
  localStorage.setItem('lang', lang);
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Outlet context={{ refreshCount, onNewScan, pendingCount }} />}>
              <Route path="/dashboard" element={<LedgerScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const q = (sel: string) => container.querySelector(sel);
const qa = (sel: string) => Array.from(container.querySelectorAll(sel));
const text = () => container.textContent ?? '';
const settle = () => vi.waitFor(() => expect(q('[data-ledger-loading]')).toBeNull());

const receipt = (id: string, p: Partial<LedgerReceipt> = {}): LedgerReceipt => ({
  documentId: id, date: '2026-05-20', dateSource: 'document', amount: 10, amountSource: 'extracted',
  category: 'Food', merchant: `Vendor ${id}`, status: 'COMPLETED', ...p,
});
const CATS = ['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other'] as const;
function currency(code: string | null, total: number, receipts: LedgerReceipt[], lines: Partial<Record<(typeof CATS)[number], [number, number]>>, uncategorizedCount = 0): LedgerCurrency {
  return {
    currency: code, total, receiptCount: receipts.length, uncategorizedCount,
    categories: CATS.map(c => ({ category: c, total: lines[c]?.[0] ?? 0, receiptCount: lines[c]?.[1] ?? 0 })),
    receipts,
  };
}
const month = (currencies: LedgerCurrency[], excluded = { status: 0, duplicate: 0, noAmount: 0 }): LedgerMonth =>
  ({ month: '2026-05', timeZone: 'UTC', currencies, excluded });

// May 2026 as the owner's organisation reads it after the duplicate write,
// plus an unknown-currency row: CAD first (largest), USD, then the unknown last.
const MULTI = month([
  currency('CAD', 7282.31, [receipt('bp', { amount: 7282.31, category: 'Office', merchant: 'BRIGHTPATH ANALYTICS', date: '2026-05-29' })], { Office: [7282.31, 1] }),
  currency('USD', 2904.9, [receipt('f3', { amount: 2904.9, category: null, merchant: 'Harbor Street Chemist', date: '2026-05-14' })], { Other: [2904.9, 1] }, 1),
  currency(null, 16.5, [receipt('sn', { amount: 16.5, category: 'Shopping', merchant: null, date: '2026-05-03', dateSource: 'uploaded' })], { Shopping: [16.5, 1] }),
], { status: 1, duplicate: 2, noAmount: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  onNewScan = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (root) root.unmount();
  if (container) container.remove();
  // @ts-expect-error reset between tests
  container = undefined;
  document.documentElement.dir = 'ltr';
});

describe('ledger home: one figure per currency', () => {
  it('shows each currency as its own figure, in the API order, the unknown currency last', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    expect(h.getMonth).toHaveBeenCalledWith('2026-05', deviceTimeZone());
    const lines = qa('[data-ledger-currency]').map(el => el.getAttribute('data-ledger-currency'));
    expect(lines).toEqual(['CAD', 'USD', 'none']);
    const figures = qa('[data-ledger-figure]').map(el => el.textContent);
    expect(figures).toEqual(['7,282.31', '2,904.90', '16.50']);
    // Every figure is the same size class for amounts of similar length:
    // no currency is promoted over another by comparing amounts across them.
    expect(q('[data-ledger-figure]')!.className).toMatch(/text-\[44px\]/);
    expect(text()).toContain(strings.en.ledgerSeparateCurrencies);
  });

  it('NO figure anywhere on the screen is a sum across currencies (with a control that the check can see one)', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    // 7282.31 + 2904.90 = 10187.21; + 16.50 = 10203.71. Neither may appear.
    expect(text()).not.toContain('10,187.21');
    expect(text()).not.toContain('10,203.71');
    expect(text()).not.toContain('10187.21');
    // Control: the same check does see 10,187.21 when the API itself returns
    // it as ONE currency's total, so its silence above is not blindness.
    root.unmount(); container.remove();
    // @ts-expect-error remount
    container = undefined;
    h.getMonth.mockResolvedValue(month([currency('USD', 10187.21, [receipt('x', { amount: 10187.21 })], { Food: [10187.21, 1] })]));
    mount();
    await settle();
    expect(text()).toContain('10,187.21');
  });

  it('the unknown-currency line says so and never borrows a code', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    const none = q('[data-ledger-currency="none"]')!;
    expect(none.textContent).toContain(strings.en.ledgerNoCurrency);
    expect(none.textContent).not.toMatch(/USD|CAD|MAD/);
    // The receipt row with no currency says so too.
    expect(q('[data-ledger-row="sn"]')!.textContent).toContain(strings.en.ledgerNoCurrency);
  });

  it('a category card lists each currency on its own line', async () => {
    h.getMonth.mockResolvedValue(month([
      currency('MAD', 935.7, [receipt('a', { amount: 467.85 }), receipt('b', { amount: 467.85 })], { Food: [935.7, 2] }),
      currency('USD', 54.76, [receipt('c', { amount: 54.76 })], { Food: [54.76, 1] }),
    ]));
    mount();
    await settle();
    const food = q('[data-ledger-category="Food"]')!;
    const amounts = Array.from(food.querySelectorAll('[data-ledger-amount]')).map(e => e.textContent);
    expect(amounts).toEqual(['935.70', '54.76']);
    expect(food.textContent).toContain('MAD');
    expect(food.textContent).toContain('USD');
    expect(food.textContent).toContain('3 receipts'); // counts DO add across currencies
    expect(food.textContent).not.toContain('990.46'); // 935.70 + 54.76, never shown
  });

  it('a very large figure is shown in full, never abbreviated, at a smaller size', async () => {
    h.getMonth.mockResolvedValue(month([currency('USD', 1234567890.12, [receipt('big', { amount: 1234567890.12 })], { Other: [1234567890.12, 1] })]));
    mount();
    await settle();
    const fig = q('[data-ledger-figure]')!;
    expect(fig.textContent).toBe('1,234,567,890.12');
    expect(fig.className).toMatch(/text-\[24px\]/);
    expect(text()).not.toMatch(/\b1\.2\s?[BbMm]\b|\bK\b/);
  });

  it('three-decimal and zero-decimal currencies keep their own precision', async () => {
    h.getMonth.mockResolvedValue(month([
      currency('KWD', 12.345, [receipt('k', { amount: 12.345 })], { Food: [12.345, 1] }),
      currency('JPY', 1500, [receipt('j', { amount: 1500 })], { Food: [1500, 1] }),
    ]));
    mount();
    await settle();
    expect(qa('[data-ledger-figure]').map(e => e.textContent)).toEqual(['12.345', '1,500']);
  });
});

describe('ledger home: the rows and what needs the owner', () => {
  it('a row with no category is counted under Other with the not-yet-sorted count', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    const other = q('[data-ledger-category="Other"]')!;
    expect(other.querySelector('[data-ledger-not-sorted]')!.textContent).toBe('1 not yet sorted');
    expect(q('[data-ledger-row="f3"]')!.textContent).toContain(strings.en.ledgerNotSortedTag);
  });

  it('an undated row says the receipt had no date and when it was added', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    const row = q('[data-ledger-row="sn"]')!;
    expect(row.querySelector('[data-ledger-date]')!.textContent).toBe(strings.en.ledgerNoDate.replace('{day}', 'May 3'));
    expect(row.textContent).toContain(strings.en.ledgerUnknownVendor);
  });

  it('rows run newest first across currencies, and the excluded rows are named, not hidden', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    expect(qa('[data-ledger-row]').map(e => e.getAttribute('data-ledger-row'))).toEqual(['bp', 'f3', 'sn']);
    const note = q('[data-ledger-excluded]')!.textContent!;
    expect(note).toContain('2 possible duplicates');
    expect(note).toContain('1 rejected or not read');
  });

  it('receipts that need review are counted in a link to the queue, and tagged on their row', async () => {
    h.getMonth.mockResolvedValue(month([currency('USD', 30, [
      receipt('r1', { status: 'NEEDS_REVIEW', amount: 10 }), receipt('r2', { status: 'NEEDS_REVIEW', amount: 20 }),
    ], { Food: [30, 2] })]));
    mount();
    await settle();
    const needs = q('[data-ledger-needs]') as HTMLAnchorElement;
    expect(needs.textContent).toContain('2 receipts from May need your review');
    expect(needs.getAttribute('href')).toBe('/queue');
    expect(q('[data-ledger-row="r1"]')!.textContent).toContain(strings.en.ledgerNeedsReviewTag);
  });

  // The Queue tab's badge counts every NEEDS_REVIEW document in every month
  // (GET /api/stats pendingCount); the card counts this month's counted ones.
  // The owner saw 8 on the tab and 1 on the card with nothing saying why.
  const ONE_NEEDS = () => month([currency('USD', 30, [
    receipt('n1', { status: 'NEEDS_REVIEW', amount: 10 }), receipt('ok', { amount: 20 }),
  ], { Food: [30, 2] })]);

  it('when the Queue holds more than this month, the card says both numbers and names the Queue', async () => {
    h.getMonth.mockResolvedValue(ONE_NEEDS());
    mount('en', '/dashboard?month=2026-05', 0, 8);
    await settle();
    const needs = q('[data-ledger-needs]')!;
    expect(needs.textContent).toContain('1 receipt from May needs your review');
    expect(q('[data-ledger-queue-all]')!.textContent).toBe('8 in Queue across all months');
  });

  it('when the two numbers agree, the second line is not shown (control: it is shown when they differ)', async () => {
    h.getMonth.mockResolvedValue(ONE_NEEDS());
    mount('en', '/dashboard?month=2026-05', 0, 1);
    await settle();
    expect(q('[data-ledger-needs]')).not.toBeNull();
    expect(q('[data-ledger-queue-all]')).toBeNull();
  });

  it('nothing this month but the Queue is not empty: the card says what waits, and still leads to the Queue', async () => {
    h.getMonth.mockResolvedValue(month([currency('USD', 20, [receipt('ok', { amount: 20 })], { Food: [20, 1] })]));
    mount('en', '/dashboard?month=2026-05', 0, 8);
    await settle();
    const needs = q('[data-ledger-needs]') as HTMLAnchorElement;
    expect(needs.textContent).toContain('8 documents are waiting in Queue');
    expect(needs.getAttribute('href')).toBe('/queue');
  });

  it('nothing to review anywhere: no card', async () => {
    h.getMonth.mockResolvedValue(month([currency('USD', 20, [receipt('ok', { amount: 20 })], { Food: [20, 1] })]));
    mount('en', '/dashboard?month=2026-05', 0, 0);
    await settle();
    expect(q('[data-ledger-needs]')).toBeNull();
  });

  it('Arabic: the card reads as Arabic sentences, not "label: n"', async () => {
    h.getMonth.mockResolvedValue(ONE_NEEDS());
    mount('ar', '/dashboard?month=2026-05', 0, 8);
    await settle();
    expect(q('[data-ledger-needs]')!.textContent).toContain('إيصال واحد من مايو بانتظار مراجعتك');
    expect(q('[data-ledger-queue-all]')!.textContent).toBe('8 مستندات في المراجعة من كل الأشهر');
    expect(q('[data-ledger-category="Food"]')!.textContent).toContain('إيصالان');
    expect(text()).not.toContain('الإيصالات: ');
  });

  it('a corrected amount is marked as edited', async () => {
    h.getMonth.mockResolvedValue(month([currency('USD', 85, [receipt('c1', { amount: 85, amountSource: 'corrected' })], { Food: [85, 1] })]));
    mount();
    await settle();
    expect(q('[data-ledger-row="c1"]')!.textContent).toContain(strings.en.ledgerCorrectedTag);
  });

  it('tapping a category shows only its receipts, and one tap clears it', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount();
    await settle();
    (q('[data-ledger-category="Office"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(qa('[data-ledger-row]').map(e => e.getAttribute('data-ledger-row'))).toEqual(['bp']));
    expect(q('[data-ledger-category="Office"]')!.getAttribute('aria-pressed')).toBe('true');
    (q('[data-ledger-clear-filter]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(qa('[data-ledger-row]')).toHaveLength(3));
  });

  it('long vendor names in Arabic and French are kept whole in the DOM and truncate by their own direction', async () => {
    const ar = 'مخبزة ومحلبة الأمل الكبرى للحلويات المغربية التقليدية والمعجنات الطازجة';
    const fr = 'Pharmacie Principale de la Place des Nations Unies et du Boulevard Zerktouni';
    h.getMonth.mockResolvedValue(month([currency('MAD', 150, [
      receipt('ar', { merchant: ar, amount: 86.5 }), receipt('fr', { merchant: fr, amount: 63.5, date: '2026-05-19' }),
    ], { Food: [86.5, 1], Health: [63.5, 1] })]));
    mount();
    await settle();
    for (const [id, name] of [['ar', ar], ['fr', fr]] as const) {
      const box = q(`[data-ledger-row="${id}"] [dir="auto"]`)!;
      expect(box.textContent).toBe(name);
      expect(box.className).toMatch(/\btruncate\b/);
      expect(box.getAttribute('title')).toBe(name);
      expect(box.querySelector('bdi')).toBeNull(); // no isolate stealing dir="auto" (rtlTruncation.test.ts)
    }
  });
});

describe('ledger home: states', () => {
  it('loading shows a skeleton, marked busy', () => {
    h.getMonth.mockReturnValue(new Promise(() => {}));
    mount();
    const sk = q('[data-ledger-loading]')!;
    expect(sk.getAttribute('aria-busy')).toBe('true');
    expect(sk.getAttribute('aria-label')).toBe(strings.en.ledgerLoading);
  });

  it('an empty month says so, offers a scan, and points at the month before', async () => {
    h.getMonth.mockResolvedValue(month([], { status: 0, duplicate: 1, noAmount: 0 }));
    mount();
    await settle();
    const empty = q('[data-ledger-empty]')!;
    expect(empty.textContent).toContain(strings.en.ledgerEmptyTitle.replace('{month}', 'May'));
    expect(empty.textContent).toContain(strings.en.ledgerEmptySee.replace('{month}', 'April 2026'));
    expect(empty.textContent).toContain('1 possible duplicate');
    const scan = Array.from(empty.querySelectorAll('button')).find(b => b.textContent?.includes(strings.en.scanReceipt))!;
    scan.click();
    expect(onNewScan).toHaveBeenCalledTimes(1);
    expect(q('[data-ledger-figure]')).toBeNull();
  });

  it('an API error explains itself and retries', async () => {
    h.getMonth.mockRejectedValueOnce(new Error('Failed to load the ledger')).mockResolvedValue(MULTI);
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.ledgerLoadError));
    expect(text()).toContain(strings.en.connectionError);
    const retry = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(strings.en.tryAgain))!;
    retry.click();
    await vi.waitFor(() => expect(qa('[data-ledger-figure]')).toHaveLength(3));
  });

  it('the identity lockout is terminal: its own title, and no retry', async () => {
    h.getMonth.mockRejectedValue(new Error('IDENTITY_EMAIL_CONFLICT'));
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.accountLockedTitle));
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent?.includes(strings.en.tryAgain))).toBe(false);
  });

  it('a refresh after an upload keeps the month on screen instead of blanking it', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount('en', '/dashboard?month=2026-05', 0);
    await settle();
    let release: (v: LedgerMonth) => void = () => {};
    h.getMonth.mockReturnValue(new Promise<LedgerMonth>(r => { release = r; }));
    mount('en', '/dashboard?month=2026-05', 1);
    expect(h.getMonth).toHaveBeenCalledTimes(2);
    expect(q('[data-ledger-loading]')).toBeNull();
    expect(qa('[data-ledger-figure]')).toHaveLength(3);
    release(MULTI);
  });
});

describe('ledger home: month navigation', () => {
  it('previous and next move one month, across a year boundary', async () => {
    h.getMonth.mockResolvedValue(month([]));
    mount('en', '/dashboard?month=2026-01');
    await settle();
    (q('[data-ledger-prev]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(h.getMonth).toHaveBeenLastCalledWith('2025-12', deviceTimeZone()));
    expect(q('#ledger-month')!.textContent).toBe('December 2025');
    (q('[data-ledger-next]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(h.getMonth).toHaveBeenLastCalledWith('2026-01', deviceTimeZone()));
  });

  it('opens on the current month, and there is no month after it', async () => {
    h.getMonth.mockResolvedValue(month([]));
    mount('en', '/dashboard');
    await settle();
    const now = currentMonth(deviceTimeZone());
    expect(h.getMonth).toHaveBeenCalledWith(now, deviceTimeZone());
    expect((q('[data-ledger-next]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a month in the future in the URL falls back to the current month', async () => {
    h.getMonth.mockResolvedValue(month([]));
    mount('en', '/dashboard?month=2999-01');
    await settle();
    expect(h.getMonth).toHaveBeenCalledWith(currentMonth(deviceTimeZone()), deviceTimeZone());
  });
});

// Node's ICU gives Western digits for a bare 'ar'; a browser engine may give
// Arabic-Indic ones. To make the digit assertion able to fail, the Arabic test
// runs on an engine that defaults 'ar' to Arabic-Indic digits: bare 'ar' is
// rewritten to 'ar-u-nu-arab', and an explicit numberingSystem option still
// wins over it, as ECMA-402 specifies.
function withArabicIndicDefault(): () => void {
  const RealNF = Intl.NumberFormat;
  const RealDTF = Intl.DateTimeFormat;
  const map = (l: unknown) => (l === 'ar' ? 'ar-u-nu-arab' : Array.isArray(l) ? l.map(x => (x === 'ar' ? 'ar-u-nu-arab' : x)) : l);
  (Intl as any).NumberFormat = function (l: any, o: any) { return new RealNF(map(l) as any, o); };
  (Intl as any).NumberFormat.supportedLocalesOf = RealNF.supportedLocalesOf;
  (Intl as any).DateTimeFormat = function (l: any, o: any) { return new RealDTF(map(l) as any, o); };
  (Intl as any).DateTimeFormat.supportedLocalesOf = RealDTF.supportedLocalesOf;
  return () => { (Intl as any).NumberFormat = RealNF; (Intl as any).DateTimeFormat = RealDTF; };
}

describe('ledger home: languages', () => {
  it('Arabic: right-to-left page, figures isolated left-to-right, Western digits only', async () => {
    const restore = withArabicIndicDefault();
    // Control: on this engine a bare 'ar' number really is Arabic-Indic.
    expect(new Intl.NumberFormat('ar').format(7282.31)).toMatch(/[٠-٩]/);
    try {
    h.getMonth.mockResolvedValue(MULTI);
    mount('ar');
    await settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text()).toContain(strings.ar.ledgerByCategory);
    for (const el of qa('[data-ledger-figure], [data-ledger-amount]')) {
      expect(el.tagName).toBe('BDI');
      expect(el.getAttribute('dir')).toBe('ltr');
      expect(el.textContent).toMatch(/^[0-9.,]+$/);
    }
    expect(qa('[data-ledger-figure]').map(e => e.textContent)).toEqual(['7,282.31', '2,904.90', '16.50']);
    // No Arabic-Indic or Extended Arabic-Indic digit anywhere on the screen.
    expect(text()).not.toMatch(/[٠-٩۰-۹]/);
    expect(text()).toMatch(/[0-9]/);
    // The month-navigation chevrons mirror in RTL.
    expect(q('[data-ledger-prev] svg')!.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(text()).toContain(strings.ar.ledgerNoCurrency);
    } finally {
      restore();
    }
  });

  it('French: French separators, French labels', async () => {
    h.getMonth.mockResolvedValue(MULTI);
    mount('fr');
    await settle();
    const figs = qa('[data-ledger-figure]').map(e => (e.textContent ?? '').replace(/[  ]/g, ' '));
    expect(figs).toEqual(['7 282,31', '2 904,90', '16,50']);
    expect(text()).toContain(strings.fr.ledgerByCategory);
    expect(text()).toContain(strings.fr.catOffice);
  });

  it('every ledger string exists in all three languages', () => {
    const keys = Object.keys(strings.en).filter(k => k.startsWith('ledger') || k.startsWith('cat'));
    // 39 since the one/other key pairs became single plural messages.
    expect(keys.length).toBeGreaterThanOrEqual(39);
    for (const lang of ['fr', 'ar'] as const) {
      for (const k of keys) expect((strings[lang] as Record<string, string>)[k], `${lang}.${k}`).toBeTruthy();
    }
  });
});

describe('ledger home: the category icon is never the only carrier', () => {
  it('every category card shows its name beside a tile in its own colour, and the tile is hidden from screen readers', async () => {
    const all = month([currency('USD', 80, CATS.map((c, i) => receipt(`r${i}`, { category: c, amount: 10 })),
      Object.fromEntries(CATS.map(c => [c, [10, 1]])) as any)]);
    h.getMonth.mockResolvedValue(all);
    mount();
    await settle();
    const fills = new Set<string>();
    for (const c of CATS) {
      const card = q(`[data-ledger-category="${c}"]`)!;
      expect(card.textContent).toContain(strings.en[`cat${c}` as const]);
      const tile = card.querySelector(`[data-category-icon="${c}"]`)!;
      expect(tile.getAttribute('aria-hidden')).toBe('true');
      const fill = tile.className.match(/\bbg-cat-[a-z]+\b/)![0];
      fills.add(fill);
      // The same treatment on the receipt row, with the category named in its
      // text. Other is the card's word for the bucket only: its receipt wears
      // the neutral tile and says "not sorted" (documentWearsNoOther.test.tsx).
      if (c === 'Other') {
        const row = qa('[data-ledger-row]').find(r => r.querySelector('[data-icon-tile="neutral"]'))!;
        expect(row.textContent).toContain(strings.en.ledgerNotSortedTag);
        continue;
      }
      const row = qa('[data-ledger-row]').find(r => r.querySelector(`[data-category-icon="${c}"]`))!;
      expect(row.textContent).toContain(strings.en[`cat${c}` as const]);
    }
    expect(fills.size).toBe(CATS.length);
  });
});
