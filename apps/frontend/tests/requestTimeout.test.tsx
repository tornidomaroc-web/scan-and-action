import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// The screens: a timed-out request is named, with a retry, in all three
// languages, and the skeleton is gone. Against 8f4052b every test here fails:
// there is no timeout copy to find. The helper and the services are in
// tests/fetchWithTimeout.test.ts.
// ============================================================================

const h = vi.hoisted(() => ({ getMonth: vi.fn(), getReviewQueue: vi.fn(), updateStatus: vi.fn(), getStats: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/ledgerService', () => ({ ledgerService: { getMonth: h.getMonth } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { RequestTimeoutError } from '../src/lib/fetchWithTimeout';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { LedgerScreen } from '../src/screens/LedgerScreen';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); });

function mount(lang: 'en' | 'fr' | 'ar', path: string, el: React.ReactElement) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route element={<Outlet context={{ refreshCount: 0, onSuccess: () => {} }} />}>
            <Route path={path.split('?')[0]} element={el} />
          </Route></Routes>
        </MemoryRouter>
      </ToastProvider></LanguageProvider>
    );
  });
}
const text = () => container.textContent ?? '';
const timeoutErr = () => new RequestTimeoutError('https://api.example/ledger', 20_000);
const EMPTY_MONTH = { month: '2026-09', timeZone: 'UTC', currencies: [], excluded: { status: 0, duplicate: 0, noAmount: 0 } };

describe('the screens show the timeout, not a skeleton', () => {
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang}: the ledger home names the timeout and offers a retry, and the retry re-reads`, async () => {
      h.getMonth.mockRejectedValueOnce(timeoutErr()).mockResolvedValue(EMPTY_MONTH);
      mount(lang, '/dashboard?month=2026-09', <LedgerScreen />);
      await vi.waitFor(() => expect(text()).toContain(strings[lang].requestTimedOut));
      expect(container.querySelector('[data-ledger-loading]')).toBeNull();
      expect(text()).not.toContain(strings[lang].ledgerLoadError);
      const retry = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(strings[lang].tryAgain))!;
      expect(retry).toBeTruthy();
      flushSync(() => { retry.click(); });
      await vi.waitFor(() => expect(h.getMonth).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(text()).not.toContain(strings[lang].requestTimedOut));
    });

    it(`${lang}: the review queue names the timeout and offers a retry`, async () => {
      h.getReviewQueue.mockRejectedValueOnce(timeoutErr()).mockResolvedValue([]);
      mount(lang, '/queue', <ReviewQueueScreen />);
      await vi.waitFor(() => expect(text()).toContain(strings[lang].requestTimedOut));
      expect(container.querySelector('.skeleton')).toBeNull();
      expect(text()).not.toContain(strings[lang].queueFetchError);
      expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes(strings[lang].tryAgain))).toBe(true);
    });
  }

  it('a generic failure still shows the generic copy (control)', async () => {
    h.getMonth.mockRejectedValue(new Error('Failed to load the ledger'));
    mount('en', '/dashboard?month=2026-09', <LedgerScreen />);
    await vi.waitFor(() => expect(text()).toContain(strings.en.ledgerLoadError));
    expect(text()).not.toContain(strings.en.requestTimedOut);
  });
});
