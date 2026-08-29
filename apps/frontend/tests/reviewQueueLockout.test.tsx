import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// Review Queue adopts the IDENTITY_EMAIL_CONFLICT classifier.
// ============================================================================
// Before this, a locked session reached ReviewQueueScreen as s.queueFetchError
// with a live retry button. The retry cannot succeed: clearing the condition is
// an operator action against an orphaned row (lib/identityConflict.ts:15-18).
// The screen could not have known — until PR #152 the code was destroyed inside
// getReviewQueue, which threw a literal without reading the response body.
//
// WHAT THIS FILE GUARDS, in both directions:
//   - the lockout renders the lockout copy and offers NO button;
//   - EVERY other failure keeps its ordinary copy AND its retry;
//   - a DIFFERENT 409 code does not lock, because the rule is exact-code and
//     never status (lib/identityConflict.ts:20-22);
//   - on the action path the toast is suppressed and the screen switches, while
//     every other action failure still toasts.
//
// The direction guards are the ones that will actually regress. Widening the
// discrimination is the easy mistake, it looks like a fix, and it silently
// converts every transient failure into a dead end with no way back.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'queue-lock@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: {
    getReviewQueue: vi.fn(),
    getDocumentDetail: vi.fn(),
    updateStatus: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { IDENTITY_EMAIL_CONFLICT } from '../src/lib/identityConflict';

const s = strings.en;

const QUEUE_DOCS = [
  {
    id: 'doc-1',
    originalFileName: 'receipt-alpha.jpg',
    status: 'NEEDS_REVIEW',
    overallConfidence: 0.8,
    date: '2026-06-01',
  },
];

let container: HTMLDivElement;
let root: Root;

const OutletStub = () => (
  <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />
);

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/queue']}>
            <Routes>
              <Route element={<OutletStub />}>
                <Route path="/queue" element={<ReviewQueueScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/** The ErrorState card only — the page header and the toast layer sit outside it. */
const errorCard = () => container.querySelector('[class*="border-danger"]');
const toasts = () => container.querySelectorAll('.toast');

describe('Review queue — the lockout is terminal and offers no retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.updateStatus as any).mockResolvedValue({});
  });
  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('renders the lockout title and body, and NO button at all', async () => {
    (documentService.getReviewQueue as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).toContain(s.accountLockedBody);
    // ErrorState renders its retry button only when onRetry is supplied
    // (components/ErrorState.tsx:23), so the ABSENCE of a button is the assertion.
    expect(errorCard()).toBeTruthy();
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain(s.tryAgain);
  });

  it('does not claim an unspecified fault, and does not render the queue', async () => {
    (documentService.getReviewQueue as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).not.toContain(s.queueFetchError);
    expect(container.textContent).not.toContain(s.somethingWrong);
    expect(container.textContent).not.toContain('receipt-alpha.jpg');
  });

  // ── DIRECTION GUARDS: the mistake here is widening, not narrowing ──────────

  it('an ordinary transient failure is UNTOUCHED: its own copy AND its retry', async () => {
    (documentService.getReviewQueue as any).mockRejectedValue(new Error('Failed to fetch review queue'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.queueFetchError));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('a DIFFERENT 409 code does NOT lock — the rule is exact code, never status', async () => {
    // SHARED_WORKSPACE is a real 409 from the same backend (lib/accountErrors.ts).
    // If the discrimination ever widens to "a 409", or to a substring match, this
    // assertion is what fails.
    (documentService.getReviewQueue as any).mockRejectedValue(new Error('SHARED_WORKSPACE'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.queueFetchError));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
  });

  it('a lookalike code does not lock either', async () => {
    (documentService.getReviewQueue as any).mockRejectedValue(new Error('IDENTITY_EMAIL_CONFLICT_V2'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.queueFetchError));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
  });
});

describe('Review queue — the action path suppresses the toast and switches the screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getReviewQueue as any).mockResolvedValue([...QUEUE_DOCS]);
  });
  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('a lockout on approve shows NO toast and replaces the body with the lockout', async () => {
    mount();
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));
    (documentService.updateStatus as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));

    click(container.querySelector('button[aria-label="Approve receipt-alpha.jpg"]')!);

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    // Not a silent disappearance: the list the user was looking at is replaced.
    expect(container.textContent).not.toContain('receipt-alpha.jpg');
    expect(toasts().length).toBe(0);
    expect(container.textContent).not.toContain(s.toastUpdateError);
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
  });

  it('every OTHER action failure still toasts, and keeps the list', async () => {
    mount();
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));
    (documentService.updateStatus as any).mockRejectedValue(new Error('Failed to update document status'));

    click(container.querySelector('button[aria-label="Approve receipt-alpha.jpg"]')!);

    await vi.waitFor(() => expect(toasts().length).toBe(1));
    expect(container.textContent).toContain(s.toastUpdateError);
    expect(container.textContent).toContain('receipt-alpha.jpg');
    expect(container.textContent).not.toContain(s.accountLockedTitle);
  });
});
