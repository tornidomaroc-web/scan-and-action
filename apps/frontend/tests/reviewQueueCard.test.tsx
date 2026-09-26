import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// The queue card on the receipt screen's rules (2026-09-26). The owner's
// finding: the card still wore the file name as its title, an "AI confidence"
// percentage with a bar and a subtitle, the exact things Detail had dropped.
//
// Through the real screen with only the service mocked: what a card shows,
// from the same readers Detail uses, in three languages.
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
import { fullDayLabel } from '../src/lib/ledgerView';

type Lang = 'en' | 'fr' | 'ar';
let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang = 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
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
  });
}

const q = (sel: string) => container.querySelector(sel);
const text = () => container.textContent ?? '';
const card = (id: string) => q(`[data-queue-card="${id}"]`)!;

const fact = (key: string, extra: Record<string, unknown>) => ({ key, confidence: 0.9, ...extra });
const PIZZA = {
  id: 'pizza', originalFileName: 'joes-pizza.jpg', documentType: 'RECEIPT', status: 'NEEDS_REVIEW', overallConfidence: 0.83,
  uploadedAt: '2026-09-14T09:00:00Z',
  facts: [
    fact('TOTAL_AMOUNT', { factType: 'AMOUNT', valueNumber: 750, currency: 'USD' }),
    fact('TRANSACTION_DATE', { valueDate: '2026-09-12T00:00:00Z' }),
    fact('category', { valueString: 'Food' }),
  ],
  entities: [{ name: "JOE'S PIZZA RESTAURANT", role: 'VENDOR', aliases: [] }],
};
// A correction: the ledger's figure is the correction, in the extraction's currency.
const CORRECTED = {
  id: 'corr', originalFileName: 'amazon.pdf', documentType: 'INVOICE', status: 'NEEDS_REVIEW', overallConfidence: 0.99,
  uploadedAt: '2026-09-06T09:00:00Z',
  facts: [
    fact('TOTAL_AMOUNT', { factType: 'AMOUNT', valueNumber: 1000, currency: 'USD' }),
    fact('manual_amount', { factType: 'AMOUNT', valueNumber: 175 }),
    fact('category', { valueString: 'Office' }),
  ],
  entities: [{ name: 'Amazon', role: 'VENDOR', aliases: [] }],
};
// No merchant, no date, no amount: the file name is the title, the day it was added is the date.
const BARE = { id: 'bare', originalFileName: 'malformed-test.jpg', documentType: 'RECEIPT', status: 'NEEDS_REVIEW', overallConfidence: 0.4, uploadedAt: '2026-09-08T09:00:00Z', facts: [], entities: [] };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getStats.mockResolvedValue({ totalCount: 3, pendingCount: 3, averageConfidence: 0.7, plan: 'FREE' });
  h.getReviewQueue.mockResolvedValue([PIZZA, CORRECTED, BARE]);
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.restoreAllMocks();
});

describe('the card is the receipt as Detail shows it', () => {
  it('merchant as the title; the file name only when no merchant was read', async () => {
    mount();
    await vi.waitFor(() => expect(q('[data-queue-card="pizza"]')).not.toBeNull());
    expect(card('pizza').querySelector('[data-queue-title]')!.textContent).toBe("JOE'S PIZZA RESTAURANT");
    expect(card('pizza').textContent).not.toContain('joes-pizza.jpg');
    expect(card('bare').querySelector('[data-queue-title]')!.textContent).toBe('malformed-test.jpg');
    // The file name stays the accessible name of the actions: every document has one.
    expect(card('pizza').querySelector('button[aria-label="Approve joes-pizza.jpg"]')).not.toBeNull();
  });

  it('the amount is the ledger amount: a correction beats the extraction, marked Edited, never summed', async () => {
    mount();
    await vi.waitFor(() => expect(q('[data-queue-card="corr"]')).not.toBeNull());
    const a = card('corr').querySelector('[data-queue-amount]')!;
    expect(a.getAttribute('dir')).toBe('ltr');
    expect(a.textContent).toContain('175');
    expect(a.textContent).not.toContain('1,000');
    expect(a.textContent).toContain('USD');
    expect(a.textContent).toContain(strings.en.ledgerCorrectedTag);
    expect(card('pizza').querySelector('[data-queue-amount]')!.textContent).toContain('750.00');
    expect(card('bare').querySelector('[data-queue-amount]')).toBeNull();
  });

  it("the date is the receipt's own; the day it was added only when none was read, and it says so", async () => {
    mount();
    await vi.waitFor(() => expect(q('[data-queue-card="pizza"]')).not.toBeNull());
    expect(card('pizza').querySelector('[data-queue-meta]')!.textContent).toContain(fullDayLabel('2026-09-12T00:00:00Z', 'en'));
    expect(card('pizza').textContent).not.toContain(fullDayLabel('2026-09-14T09:00:00Z', 'en', 'local'));
    const added = strings.en.ledgerNoDate.replace('{day}', fullDayLabel('2026-09-08T09:00:00Z', 'en', 'local'));
    expect(card('bare').querySelector('[data-queue-meta]')!.textContent).toContain(added);
  });

  it('one status chip, the category circle, and nothing about confidence', async () => {
    mount();
    await vi.waitFor(() => expect(q('[data-queue-card="pizza"]')).not.toBeNull());
    expect(card('pizza').querySelectorAll('[data-queue-status]')).toHaveLength(1);
    expect(card('pizza').querySelector('[data-queue-status]')!.textContent).toBe(strings.en.needsReview);
    expect(card('pizza').querySelector('[data-category-icon="Food"]')).not.toBeNull();
    expect(card('bare').querySelector('[data-icon-tile="neutral"]')).not.toBeNull();
    expect(text()).not.toMatch(/\d+\s?%/);
    expect(text()).not.toContain(strings.en.aiConfidence);
    expect(text()).not.toContain(strings.en.validationQueue);
    expect(text()).not.toContain('83');
  });

  it('Approve and Reject are still the two actions, 44 px, and still call the service', async () => {
    h.updateStatus.mockResolvedValue({});
    mount();
    await vi.waitFor(() => expect(q('[data-queue-card="pizza"]')).not.toBeNull());
    const buttons = [...card('pizza').querySelectorAll('button')];
    expect(buttons.map(b => b.textContent?.trim())).toEqual([strings.en.approve, strings.en.reject]);
    for (const b of buttons) expect(b.className).toContain('min-h-[44px]');
    flushSync(() => buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await vi.waitFor(() => expect(h.updateStatus).toHaveBeenCalledWith('pizza', 'COMPLETED'));
  });

  for (const lang of ['en', 'fr', 'ar'] as Lang[]) {
    it(`${lang}: the card reads in the language, Western digits, right direction`, async () => {
      mount(lang);
      await vi.waitFor(() => expect(q('[data-queue-card="pizza"]')).not.toBeNull());
      const s = strings[lang];
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      expect(card('pizza').textContent).toContain(s.catFood);
      expect(card('pizza').textContent).toContain(s.docTypeReceipt);
      expect(card('pizza').querySelector('[data-queue-status]')!.textContent).toBe(s.needsReview);
      expect(card('corr').textContent).toContain(s.ledgerCorrectedTag);
      expect(text()).not.toMatch(/[٠-٩]/);
      expect(q('h1')!.textContent).toBe(s.queue);
    });
  }
});
