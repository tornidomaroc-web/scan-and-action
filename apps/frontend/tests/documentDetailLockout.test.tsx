import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';

// ============================================================================
// Document Detail adopts the IDENTITY_EMAIL_CONFLICT classifier — the last of
// the four, and the only one with TWO surfaces and a re-booting retry.
// ============================================================================
// Three things make this screen different from Search, Queue and Activity:
//
//   1. The load catch bound NOTHING (`.catch(() => setErrorMsg(...))`), so the
//      signature had to change before any classification was possible at all.
//   2. The retry is `window.location.reload()`. On a lockout that re-boots the
//      app, re-runs provisioning and lands back in the same lockout — a LOOP,
//      not a wasted request. Removing the button is what breaks it.
//   3. There are two surfaces: a load path (ErrorState) and an action path
//      (approve/reject toast). They are separate handlers with separate service
//      calls, and both are covered here.
//
// `locked` and `errorMsg` are one fact split across two variables, so the
// documentId-change case below is not a nicety: clearing only one of them would
// route accountLockedBody to the NON-locked branch and render the lockout copy
// above a live retry — the exact harm this work removes.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'detail-lock@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: {
    getDocumentDetail: vi.fn(),
    updateStatus: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { IDENTITY_EMAIL_CONFLICT } from '../src/lib/identityConflict';

const s = strings.en;

let container: HTMLDivElement;
let root: Root;

/** A document that renders the sticky approve/reject bar (status gate at :421). */
const reviewableDoc = {
  id: 'doc-9',
  originalFileName: 'Invoice.pdf',
  status: 'NEEDS_REVIEW',
  uploadedAt: '2026-07-01T10:00:00Z',
  facts: [],
  entities: [],
};

/** Navigates to a DIFFERENT documentId without unmounting the screen. */
const GoToOtherDoc = () => {
  const navigate = useNavigate();
  return (
    <button data-testid="go-other" onClick={() => navigate('/documents/doc-2')}>
      go
    </button>
  );
};

const OutletStub = () => (
  <>
    <GoToOtherDoc />
    <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />
  </>
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
          <MemoryRouter initialEntries={['/documents/doc-9']}>
            <Routes>
              <Route element={<OutletStub />}>
                <Route path="/documents/:id" element={<DocumentDetailScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

/** The ErrorState card only — the toast and the document body sit outside it. */
const errorCard = () => container.querySelector('[class*="border-danger"]');
/** The toast message, if one is on screen (ToastContext.tsx:44). */
const toastText = () => container.querySelector('.toast-message')?.textContent?.trim() ?? null;

const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (documentService.getStats as any).mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
});

// ── THE LOAD PATH ────────────────────────────────────────────────────────────

describe('DocumentDetail load path — the lockout is terminal', () => {
  it('a lockout renders the lockout copy and offers NO button', async () => {
    (documentService.getDocumentDetail as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).toContain(s.accountLockedBody);
    expect(container.textContent).not.toContain(s.somethingWrong);
    // The loop, broken: no button means no reload, so no re-boot back into the
    // same lockout. This is the assertion the whole screen exists to satisfy.
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain(s.tryAgain);
  });

  it('an ORDINARY load failure is UNTOUCHED: its own copy AND its retry', async () => {
    // Direction guard. Without it the case above is satisfiable by deleting the
    // retry outright, which would strand every ordinary error with no recovery.
    (documentService.getDocumentDetail as any).mockRejectedValue(new Error('Document not found'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.somethingWrong));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).not.toContain(s.accountLockedBody);
    expect(container.textContent).toContain(s.tryAgain);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('a different 409 code does NOT lock — the rule is exact code, never status', async () => {
    (documentService.getDocumentDetail as any).mockRejectedValue(new Error('SHARED_WORKSPACE'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.somethingWrong));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('a SUPERSTRING of the code does not lock either', async () => {
    // The mutant this exists for: `===` widened to `.includes()`.
    (documentService.getDocumentDetail as any).mockRejectedValue(new Error('IDENTITY_EMAIL_CONFLICT_V2'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.somethingWrong));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('a non-Error rejection still classifies — the catch binds a value now', async () => {
    // Before this change the catch bound NOTHING, so nothing could be read at
    // all. A bare string is the shape that proves a value is now in scope.
    (documentService.getDocumentDetail as any).mockRejectedValue(IDENTITY_EMAIL_CONFLICT);
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
  });
});

// ── THE ACTION PATH ──────────────────────────────────────────────────────────

describe('DocumentDetail action path — the toast is suppressed on a lockout', () => {
  const loadThenAct = async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue(reviewableDoc);
    mount();
    await vi.waitFor(() => expect(button(s.approve)).toBeTruthy());
    click(button(s.approve)!);
  };

  it('a lockout SUPPRESSES the toast and replaces the document body', async () => {
    (documentService.updateStatus as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    await loadThenAct();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    // The toast must never appear: it vanishes, the condition does not, and a
    // disappearing message invites the next tap.
    expect(toastText()).toBeNull();
    expect(container.textContent).not.toContain(s.toastUpdateError);
    // Not a silent disappearance — the body is REPLACED, so the approve button
    // the user just tapped is gone rather than still inviting another tap.
    expect(button(s.approve)).toBeFalsy();
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
  });

  it('an ORDINARY action failure still toasts, and KEEPS the document body', async () => {
    // Direction guard for the action path. Without it the case above is
    // satisfiable by replacing the body on every action failure, which would
    // destroy the ordinary toast behaviour for every other error.
    (documentService.updateStatus as any).mockRejectedValue(new Error('Internal Server Error'));
    await loadThenAct();

    await vi.waitFor(() => expect(toastText()).toBe(s.toastUpdateError));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    // The body survives: this failure IS retryable, so the button stays.
    expect(button(s.approve)).toBeTruthy();
  });
});

// ── locked AND errorMsg ARE ONE FACT ─────────────────────────────────────────

describe('DocumentDetail — a documentId change clears BOTH halves of the lock', () => {
  it('a healthy second document does not inherit the first one’s lockout', async () => {
    (documentService.getDocumentDetail as any).mockRejectedValueOnce(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();
    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));

    (documentService.getDocumentDetail as any).mockResolvedValueOnce(reviewableDoc);
    click(container.querySelector('[data-testid="go-other"]')!);

    await vi.waitFor(() => expect(container.textContent).toContain('Invoice.pdf'));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).not.toContain(s.accountLockedBody);
  });

  it('an ordinary failure after a lockout gets ordinary treatment', async () => {
    // NOT the test that catches the paired-clear mutant — measured, not assumed.
    // Dropping `setErrorMsg('')` leaves this case green, because the second load
    // ALSO fails and its catch overwrites errorMsg anyway. The case above is the
    // one that discriminates, precisely because the second document SUCCEEDS and
    // nothing overwrites the stale value.
    //
    // What this one does hold: a lockout is not sticky across documents, so the
    // next ordinary failure is treated as ordinary — copy and retry both.
    (documentService.getDocumentDetail as any).mockRejectedValueOnce(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();
    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedBody));

    (documentService.getDocumentDetail as any).mockRejectedValueOnce(new Error('Internal Server Error'));
    click(container.querySelector('[data-testid="go-other"]')!);

    await vi.waitFor(() => expect(container.textContent).toContain(s.somethingWrong));
    // The second failure is ordinary, so it gets its retry — and it must NOT be
    // carrying the first document's lockout body.
    expect(container.textContent).not.toContain(s.accountLockedBody);
    expect(container.textContent).toContain(s.tryAgain);
  });
});
