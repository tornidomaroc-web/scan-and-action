import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The Search screen, redrawn from zero 2026-09-25 (WORK-QUEUE step 6).
// Through the real screen with only GET /api/search mocked: what it asks the
// API and when, what it draws for each answer, and the two rules it must
// keep: every row is the home's row, and every figure is the API's own.
// ============================================================================

const h = vi.hoisted(() => ({ searchReceipts: vi.fn() }));
// CI has no Supabase env and lib/supabase.ts creates the client at import time;
// the ledger home imported below reaches it through ledgerService -> apiConfig.
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/searchService', () => ({ searchService: { searchReceipts: h.searchReceipts } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { SearchScreen } from '../src/screens/SearchScreen';
import { LedgerScreen } from '../src/screens/LedgerScreen';
import { IDENTITY_EMAIL_CONFLICT } from '../src/lib/identityConflict';
import { RequestTimeoutError } from '../src/lib/fetchWithTimeout';
import { HttpStatusError, NetworkError } from '../src/lib/requestErrors';
import { currentMonth, deviceTimeZone, monthTitle, shiftMonth } from '../src/lib/ledgerView';
import type { SearchHit, SearchResult } from '../src/lib/searchTypes';

type Lang = 'en' | 'fr' | 'ar';
let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang = 'en', path = '/search') {
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
            <Route element={<Outlet context={{ refreshCount: 0 }} />}>
              <Route path="/search" element={<SearchScreen />} />
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
const settle = () => vi.waitFor(() => expect(q('[data-search-loading]')).toBeNull());
const lastParams = () => h.searchReceipts.mock.calls[h.searchReceipts.mock.calls.length - 1][0];

const hit = (id: string, p: Partial<SearchHit> = {}): SearchHit => ({
  documentId: id, date: '2026-09-20', dateSource: 'document', amount: 10, amountSource: 'extracted',
  category: 'Food', merchant: 'Marjane', status: 'COMPLETED', currency: 'MAD', ...p,
});
const recent = (receipts: SearchHit[]): SearchResult => ({ mode: 'recent', q: '', category: null, month: null, timeZone: 'UTC', receipts, currencies: [], notCounted: [] });
const filtered = (p: Partial<SearchResult>): SearchResult => ({ mode: 'filtered', q: '', category: null, month: null, timeZone: 'UTC', receipts: [], currencies: [], notCounted: [], ...p });

const type = (value: string) => {
  const input = q('[data-search-input]') as HTMLInputElement;
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.useRealTimers();
  h.searchReceipts.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  container = undefined as any;
  vi.restoreAllMocks();
});

describe('what the screen asks', () => {
  it('opens with nothing asked and shows the recent receipts, no total', async () => {
    h.searchReceipts.mockResolvedValue(recent([hit('a'), hit('b', { merchant: 'Amazon', currency: 'USD', amount: 99.5 })]));
    mount();
    await settle();
    expect(h.searchReceipts).toHaveBeenCalledTimes(1);
    expect(lastParams()).toEqual({ q: '', category: null, month: null });
    expect(h.searchReceipts.mock.calls[0][1]).toBe(deviceTimeZone());
    expect(q('[data-search-recent]')).not.toBeNull();
    expect(text()).toContain(strings.en.searchRecent);
    expect(q('[data-search-total]')).toBeNull();
    expect(qa('[data-ledger-row]').map(e => e.getAttribute('data-ledger-row'))).toEqual(['a', 'b']);
  });

  it('typing settles into one request with the text, after a pause, and the URL keeps it', async () => {
    h.searchReceipts.mockResolvedValue(recent([]));
    mount();
    await settle();
    h.searchReceipts.mockResolvedValue(filtered({ q: 'marj', receipts: [hit('a')], currencies: [{ currency: 'MAD', total: 10, receiptCount: 1 }] }));
    type('m');
    type('ma');
    type('marj');
    await vi.waitFor(() => expect(lastParams().q).toBe('marj'));
    // One request for the typed word, not one per keystroke.
    expect(h.searchReceipts.mock.calls.filter(c => c[0].q !== '')).toHaveLength(1);
    await vi.waitFor(() => expect(q('[data-search-total]')).not.toBeNull());
    expect(q('[data-search-scope]')!.textContent).toContain('“marj”');
  });

  it('a category chip and the month step become parameters; All months clears the month', async () => {
    h.searchReceipts.mockResolvedValue(filtered({ receipts: [hit('a')], currencies: [{ currency: 'MAD', total: 10, receiptCount: 1 }] }));
    mount();
    await settle();
    flushSync(() => (q('[data-search-category="Food"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams().category).toBe('Food'));
    expect(q('[data-search-category="Food"]')!.getAttribute('aria-pressed')).toBe('true');
    const thisMonth = currentMonth(deviceTimeZone());
    flushSync(() => (q('[data-search-prev]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams().month).toBe(thisMonth));
    expect(q('[data-search-month]')!.textContent).toBe(monthTitle(thisMonth, 'en'));
    expect((q('[data-search-next]') as HTMLButtonElement).disabled).toBe(true);
    flushSync(() => (q('[data-search-prev]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams().month).toBe(shiftMonth(thisMonth, -1)));
    expect((q('[data-search-next]') as HTMLButtonElement).disabled).toBe(false);
    flushSync(() => (q('[data-search-all-months]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams().month).toBeNull());
    expect(q('[data-search-month]')!.textContent).toBe(strings.en.searchAllMonths);
    // The chip stayed; tapping it again clears it.
    expect(lastParams().category).toBe('Food');
    flushSync(() => (q('[data-search-category="Food"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams().category).toBeNull());
  });

  it('reads its search from the URL, and refuses a future month or an unknown category', async () => {
    h.searchReceipts.mockResolvedValue(filtered({ receipts: [hit('a')], currencies: [{ currency: 'MAD', total: 10, receiptCount: 1 }] }));
    const future = shiftMonth(currentMonth(deviceTimeZone()), 1);
    mount('en', `/search?q=marjane&category=Groceries&month=${future}`);
    await settle();
    expect(lastParams()).toEqual({ q: 'marjane', category: null, month: null });
    expect((q('[data-search-input]') as HTMLInputElement).value).toBe('marjane');
  });
});

describe('what the screen draws', () => {
  it('the rows are the home rows: the same markup for the same receipt', async () => {
    const r = hit('same', { status: 'NEEDS_REVIEW', amountSource: 'corrected', amount: 85, dateSource: 'uploaded' });
    h.searchReceipts.mockResolvedValue(filtered({ receipts: [r], currencies: [{ currency: 'MAD', total: 85, receiptCount: 1 }] }));
    mount('en', '/search?q=marjane');
    await settle();
    const searchRow = q('[data-ledger-row="same"]')!.outerHTML;
    expect(searchRow).toContain('href="/documents/same"');
    expect(searchRow).toContain(strings.en.ledgerCorrectedTag);
    expect(searchRow).toContain(strings.en.ledgerNeedsReviewTag);
    expect(searchRow).toContain(strings.en.ledgerNoDate.replace('{day}', 'Sep 20'));
    // Rendered by the SAME component as the home (components/ui/ReceiptRow):
    // both screens import it, and the home no longer carries a row of its own.
    const src = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
    expect(src('screens/SearchScreen.tsx')).toContain("from '../components/ui/ReceiptRow'");
    expect(src('screens/LedgerScreen.tsx')).toContain("from '../components/ui/ReceiptRow'");
    expect(src('screens/LedgerScreen.tsx')).not.toContain('data-ledger-row=');
  });

  it('the total is one line per currency, the API figure as returned, never added across', async () => {
    h.searchReceipts.mockResolvedValue(filtered({
      category: 'Food',
      receipts: [hit('a', { amount: 935.7 }), hit('b', { amount: 54.76, currency: 'USD' }), hit('c', { amount: 5, currency: null })],
      currencies: [{ currency: 'MAD', total: 935.7, receiptCount: 1 }, { currency: 'USD', total: 54.76, receiptCount: 1 }, { currency: null, total: 5, receiptCount: 1 }],
    }));
    mount('en', '/search?category=Food');
    await settle();
    const total = q('[data-search-total]')!;
    expect(qa('[data-search-currency]').map(e => e.getAttribute('data-search-currency'))).toEqual(['MAD', 'USD', 'none']);
    expect(Array.from(total.querySelectorAll('[data-ledger-amount]')).map(e => e.textContent)).toEqual(['935.70', '54.76', '5.00']);
    expect(total.textContent).toContain(strings.en.ledgerNoCurrency);
    expect(total.textContent).toContain(strings.en.ledgerSeparateCurrencies);
    expect(total.textContent).not.toContain('990.46'); // 935.70 + 54.76, never shown
    expect(total.textContent).not.toContain('995.46');
    expect(q('[data-search-scope]')!.textContent).toBe(`${strings.en.catFood} · ${strings.en.searchAllMonths}`);
  });

  // Seen by the owner on 2026-09-26: every not-counted row wore the fuchsia
  // Other tile, the copies of a Food and a Transport receipt included, which
  // reads as a different category. The row carries its own, as it would if it
  // were counted; a row with none gets the neutral document tile, never Other.
  // Since 2026-09-26 a stored "Other" is none too: the backend writes it when
  // it read nothing on the list (documentWearsNoOther.test.tsx).
  it('a not-counted row wears its own category tile; one with none, or the fallback Other, wears the neutral tile', async () => {
    h.searchReceipts.mockResolvedValue(filtered({
      q: 'pizza',
      notCounted: [
        { documentId: 'food', date: '2026-09-12', merchant: "JOE'S PIZZA RESTAURANT", fileName: 'a.jpg', status: 'NEEDS_REVIEW', reason: 'duplicate', category: 'Food' },
        { documentId: 'cab', date: '2026-09-11', merchant: 'TILDEN CITY CABS', fileName: 'b.jpg', status: 'COMPLETED', reason: 'duplicate', category: 'Transport' },
        { documentId: 'other', date: '2026-09-10', merchant: "JOE'S PIZZA RESTAURANT", fileName: 'c.jpg', status: 'NEEDS_REVIEW', reason: 'duplicate', category: 'Other' },
        { documentId: 'none', date: '2026-09-09', merchant: 'Some Shop', fileName: 'd.jpg', status: 'REJECTED', reason: 'status', category: null },
        { documentId: 'bare', date: '2026-09-08', merchant: null, fileName: 'malformed-test.jpg', status: 'FAILED', reason: 'status', category: null },
      ],
    }));
    mount('en', '/search?q=pizza');
    await settle();
    const tile = (id: string) => q(`[data-search-not-counted-row="${id}"] [data-category-icon]`)?.getAttribute('data-category-icon') ?? null;
    expect(tile('food')).toBe('Food');
    expect(tile('cab')).toBe('Transport');
    expect(tile('other')).toBeNull();
    expect(q('[data-search-not-counted-row="other"] [data-icon-tile="neutral"]')).not.toBeNull();
    expect(tile('none')).toBeNull();
    expect(tile('bare')).toBeNull();
    expect(q('[data-search-not-counted-row="none"] svg')).not.toBeNull();
  });

  it('receipts the ledger does not count are listed apart with their reason, and add to nothing', async () => {
    h.searchReceipts.mockResolvedValue(filtered({
      q: 'marjane',
      receipts: [hit('a', { amount: 45 })],
      currencies: [{ currency: 'MAD', total: 45, receiptCount: 1 }],
      notCounted: [
        { documentId: 'rej', date: '2026-09-10', merchant: 'Marjane', fileName: 'r.jpg', status: 'REJECTED', reason: 'status' },
        { documentId: 'dup', date: '2026-09-12', merchant: 'Marjane', fileName: 'd.jpg', status: 'COMPLETED', reason: 'duplicate' },
        { documentId: 'noamt', date: '2026-09-18', merchant: null, fileName: 'blurry.jpg', status: 'COMPLETED', reason: 'noAmount' },
      ],
    }));
    mount('en', '/search?q=marjane');
    await settle();
    const section = q('[data-search-not-counted]')!;
    expect(section.textContent).toContain(strings.en.searchNotCounted);
    expect(qa('[data-search-not-counted-row]').map(e => e.getAttribute('data-search-not-counted-row'))).toEqual(['rej', 'dup', 'noamt']);
    expect(q('[data-search-not-counted-row="rej"]')!.textContent).toContain(strings.en.searchReasonStatus);
    expect(q('[data-search-not-counted-row="dup"]')!.textContent).toContain(strings.en.searchReasonDuplicate);
    expect(q('[data-search-not-counted-row="noamt"]')!.textContent).toContain('blurry.jpg');
    expect(q('[data-search-not-counted-row="noamt"]')!.textContent).toContain(strings.en.searchReasonNoAmount);
    // No amount is drawn for them, and the total is the counted row alone.
    expect(section.querySelector('[data-ledger-amount]')).toBeNull();
    expect(q('[data-search-total]')!.querySelector('[data-ledger-amount]')!.textContent).toBe('45.00');
  });

  it('nothing found: says so with the scope, offers all months when a month was set, and clears', async () => {
    h.searchReceipts.mockResolvedValue(filtered({ q: 'zzz', month: '2026-05' }));
    mount('en', '/search?q=zzz&month=2026-05');
    await settle();
    const none = q('[data-search-none]')!;
    expect(none.textContent).toContain(strings.en.searchNoResultsTitle);
    expect(none.textContent).toContain(strings.en.searchNoResultsBody.replace('{scope}', `${monthTitle('2026-05', 'en')} · “zzz”`));
    flushSync(() => (q('[data-search-try-all]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams()).toEqual({ q: 'zzz', category: null, month: null }));
    flushSync(() => (q('[data-search-clear-all]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(lastParams()).toEqual({ q: '', category: null, month: null }));
    expect((q('[data-search-input]') as HTMLInputElement).value).toBe('');
  });

  it('no receipts at all: the empty state, not a bare heading', async () => {
    h.searchReceipts.mockResolvedValue(recent([]));
    mount();
    await settle();
    expect(q('[data-search-empty]')!.textContent).toContain(strings.en.searchEmptyTitle);
  });

  it('a slow answer to an old search never overwrites a newer one', async () => {
    let resolveFirst!: (v: SearchResult) => void;
    h.searchReceipts.mockImplementationOnce(() => new Promise<SearchResult>(res => { resolveFirst = res; }));
    mount('en', '/search?q=slow');
    h.searchReceipts.mockResolvedValue(filtered({ q: 'fast', receipts: [hit('fast')], currencies: [{ currency: 'MAD', total: 10, receiptCount: 1 }] }));
    type('fast');
    await vi.waitFor(() => expect(q('[data-ledger-row="fast"]')).not.toBeNull());
    resolveFirst(filtered({ q: 'slow', receipts: [hit('slow')], currencies: [{ currency: 'MAD', total: 10, receiptCount: 1 }] }));
    await new Promise(r => setTimeout(r, 20));
    expect(q('[data-ledger-row="slow"]')).toBeNull();
    expect(q('[data-ledger-row="fast"]')).not.toBeNull();
  });
});

describe('failures', () => {
  it('a locked account gets the terminal copy and no retry', async () => {
    h.searchReceipts.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.accountLockedTitle));
    expect(text()).toContain(strings.en.accountLockedBody);
    expect(qa('button').map(b => b.textContent)).not.toContain(strings.en.tryAgain);
  });

  it('a timeout says the connection, and the server did not answer, with a retry that asks again', async () => {
    h.searchReceipts.mockRejectedValueOnce(new RequestTimeoutError('search', 20000));
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.requestTimedOut));
    expect(text()).toContain(strings.en.connectionError);
    h.searchReceipts.mockResolvedValue(recent([hit('a')]));
    const retry = qa('button').find(b => b.textContent === strings.en.tryAgain) as HTMLButtonElement;
    flushSync(() => retry.click());
    await vi.waitFor(() => expect(q('[data-ledger-row="a"]')).not.toBeNull());
  });

  it('no response at all says the connection, with a retry', async () => {
    h.searchReceipts.mockRejectedValue(new NetworkError('search', new TypeError('Load failed')));
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.searchNetworkError));
    expect(text()).toContain(strings.en.connectionError);
    expect(text()).not.toContain(strings.en.searchFailedTitle);
    expect(qa('button').map(b => b.textContent)).toContain(strings.en.tryAgain);
  });

  // The owner's 2026-09-25 case: the #250 preview against a backend without
  // the route answered 404 "Cannot GET /api/search", and the screen said the
  // connection was interrupted. A status came over a working connection.
  for (const status of [404, 401, 500, 503]) {
    it(`a ${status} says the search could not be completed, never the connection, with a retry`, async () => {
      h.searchReceipts.mockRejectedValue(new HttpStatusError(status, `HTTP_${status}`));
      mount();
      await vi.waitFor(() => expect(text()).toContain(strings.en.searchFailedTitle));
      expect(text()).toContain(strings.en.searchFailedBody);
      expect(text()).not.toContain(strings.en.connectionError);
      expect(text()).not.toContain(strings.en.searchNetworkError);
      expect(qa('button').map(b => b.textContent)).toContain(strings.en.tryAgain);
    });
  }

  it('an unexpected failure (not a status, not the network) is not called a connection problem either', async () => {
    h.searchReceipts.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.searchFailedTitle));
    expect(text()).not.toContain(strings.en.connectionError);
  });

  for (const lang of ['en', 'fr', 'ar'] as Lang[]) {
    it(`${lang}: each failure reads in the language, and only a lost connection says so`, async () => {
      const s = strings[lang];
      h.searchReceipts.mockRejectedValue(new HttpStatusError(404, 'HTTP_404'));
      mount(lang);
      await vi.waitFor(() => expect(text()).toContain(s.searchFailedTitle));
      expect(text()).toContain(s.searchFailedBody);
      expect(text()).not.toContain(s.connectionError);
      root.unmount(); container.remove(); container = undefined as unknown as HTMLDivElement;

      h.searchReceipts.mockRejectedValue(new NetworkError('search', new TypeError('Failed to fetch')));
      mount(lang);
      await vi.waitFor(() => expect(text()).toContain(s.searchNetworkError));
      expect(text()).toContain(s.connectionError);
      expect(text()).not.toContain(s.searchFailedTitle);
    });
  }
});

describe('in three languages', () => {
  for (const lang of ['en', 'fr', 'ar'] as Lang[]) {
    it(`${lang}: the field, the chips, the month and the total read in the language, Western digits, right direction`, async () => {
      h.searchReceipts.mockResolvedValue(filtered({
        category: 'Food', month: '2026-09',
        receipts: [hit('a', { amount: 1234.5 })], currencies: [{ currency: 'MAD', total: 1234.5, receiptCount: 1 }],
      }));
      mount(lang, '/search?category=Food&month=2026-09');
      await settle();
      const s = strings[lang];
      expect((q('[data-search-input]') as HTMLInputElement).placeholder).toBe(s.searchPlaceholder);
      expect(q('[data-search-category="Food"]')!.textContent).toContain(s.catFood);
      expect(q('[data-search-month]')!.textContent).toBe(monthTitle('2026-09', lang));
      expect(q('[data-search-total]')!.textContent).toContain(s.searchTotalHeading);
      expect(q('[data-search-total] [data-ledger-amount]')!.textContent).toMatch(/^1[,.  ]234[.,]50?$/);
      expect(text()).not.toMatch(/[٠-٩]/);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    });
  }
});
