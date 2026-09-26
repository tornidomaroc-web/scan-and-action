import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// A DOCUMENT NEVER WEARS THE OTHER TILE.
// ============================================================================
// Seen by the owner on 2026-09-26 at the #256 preview: malformed-test.jpg,
// an upload whose extraction failed with no merchant and no amount, wore the
// fuchsia Other tile on the Queue. Production holds `category: Other` on that
// row, written by the keyword fallback that "returns Other if no keyword
// matches": a category nobody read. The rule agreed for Search applies to
// every document: no category means the neutral document tile, never Other,
// and the backend's fallback Other IS no category (lib/documentCategory.ts).
//
// Through the real Queue screen and the shared ReceiptRow (Home and Search),
// with a positive control on each: a Food row still wears Food, so the neutral
// tile is a decision and not a broken reader. Written to fail on the head
// before the fix (9a9ec0f): the Queue drew Other for the fallback fact, and
// ReceiptRow drew `r.category ?? 'Other'`.
// ============================================================================

const h = vi.hoisted(() => ({ getReviewQueue: vi.fn(), updateStatus: vi.fn(), getStats: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getReviewQueue: h.getReviewQueue, updateStatus: h.updateStatus, getStats: h.getStats },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { ReceiptRow } from '../src/components/ui/ReceiptRow';
import { getDocumentCategory, wornCategory } from '../src/lib/documentCategory';

let container: HTMLDivElement;
let root: Root;
const render = (el: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(el));
};
const q = (sel: string) => container.querySelector(sel);
const tileOf = (el: Element) => el.querySelector('[data-category-icon]')?.getAttribute('data-category-icon') ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getStats.mockResolvedValue({ totalCount: 2, pendingCount: 2, averageConfidence: 0.7, plan: 'FREE' });
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.restoreAllMocks();
});

// malformed-test.jpg as production holds it (read 2026-09-26): the fallback
// category, the failed extraction, no merchant, no amount.
const MALFORMED = {
  id: 'malformed', originalFileName: 'malformed-test.jpg', documentType: null, status: 'NEEDS_REVIEW', overallConfidence: 0,
  uploadedAt: '2026-09-08T09:00:00Z',
  facts: [
    { key: 'category', valueString: 'Other', confidence: 0.5, sourceSpan: 'auto_categorization' },
    { key: 'extraction_error', valueString: 'CLIENT_ERROR' },
    { key: 'decision', valueString: 'NEEDS_REVIEW' },
    { key: 'decision_reason', valueString: 'Missing amount' },
  ],
  entities: [],
};
const PIZZA = {
  id: 'pizza', originalFileName: 'joes-pizza.jpg', documentType: 'RECEIPT', status: 'NEEDS_REVIEW', overallConfidence: 0.83,
  uploadedAt: '2026-09-14T09:00:00Z',
  facts: [
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 750, currency: 'USD', confidence: 0.9 },
    { key: 'category', valueString: 'Food', confidence: 0.9, sourceSpan: 'extractor' },
  ],
  entities: [{ name: "JOE'S PIZZA RESTAURANT", role: 'VENDOR', aliases: [] }],
};

describe('the reader', () => {
  it('reads a named category, and reads Other as none', () => {
    expect(getDocumentCategory(PIZZA)).toBe('Food');
    expect(getDocumentCategory(MALFORMED)).toBeNull();
    expect(getDocumentCategory({ facts: [] })).toBeNull();
    expect(wornCategory('Transport')).toBe('Transport');
    expect(wornCategory('Other')).toBeNull();
    expect(wornCategory(null)).toBeNull();
    expect(wornCategory('Groceries')).toBeNull();
  });
});

describe('the Queue card', () => {
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang}: malformed-test.jpg wears the neutral tile and names no category; the pizza still wears Food`, async () => {
      localStorage.setItem('lang', lang);
      h.getReviewQueue.mockResolvedValue([PIZZA, MALFORMED]);
      render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/queue']}>
              <Routes>
                <Route element={<Outlet context={{ onSuccess: () => {} }} />}>
                  <Route path="/queue" element={<ReviewQueueScreen />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>,
      );
      await vi.waitFor(() => expect(q('[data-queue-card="malformed"]')).not.toBeNull());
      const card = q('[data-queue-card="malformed"]')!;
      expect(tileOf(card)).toBeNull();
      expect(card.querySelector('[data-icon-tile="neutral"]')).not.toBeNull();
      expect(card.textContent).not.toContain(strings[lang].catOther);
      // The control: a read category is still drawn and named.
      const pizza = q('[data-queue-card="pizza"]')!;
      expect(tileOf(pizza)).toBe('Food');
      expect(pizza.textContent).toContain(strings[lang].catFood);
    });
  }
});

describe('the shared receipt row (Home and Search)', () => {
  const s = strings.en;
  const row = (id: string, category: 'Food' | 'Other' | null) => ({
    documentId: id, date: '2026-09-12', dateSource: 'document' as const, amount: 12, amountSource: 'extracted' as const,
    category, merchant: 'Kiosk', status: 'COMPLETED' as const, currency: 'MAD',
  });

  it('no category and the fallback Other both get the neutral tile and say "not sorted"; Food stays Food', () => {
    render(
      <MemoryRouter>
        <ReceiptRow r={row('none', null)} lang="en" s={s} />
        <ReceiptRow r={row('other', 'Other')} lang="en" s={s} />
        <ReceiptRow r={row('food', 'Food')} lang="en" s={s} />
      </MemoryRouter>,
    );
    for (const id of ['none', 'other']) {
      const r = q(`[data-ledger-row="${id}"]`)!;
      expect(tileOf(r), id).toBeNull();
      expect(r.querySelector('[data-icon-tile="neutral"]'), id).not.toBeNull();
      expect(r.textContent, id).toContain(s.ledgerNotSortedTag);
      expect(r.textContent, id).not.toContain(s.catOther);
    }
    const food = q('[data-ledger-row="food"]')!;
    expect(tileOf(food)).toBe('Food');
    expect(food.querySelector('[data-icon-tile]')).toBeNull();
    expect(food.textContent).toContain(s.catFood);
  });
});
