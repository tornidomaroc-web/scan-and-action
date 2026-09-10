import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// The retry affordance for an EMPTY NEEDS_REVIEW document.
// ============================================================================
// The endpoint has admitted these rows since #197. The UI never has: the button
// rendered behind `doc.status === 'FAILED'`, and production holds ZERO FAILED
// rows — so it reached nobody and POST /:id/reextract had never once run for a
// real user. 110 rows sat recoverable by an endpoint no client could call.
//
// THE GATE IS THE SERVER'S ANSWER, NOT A SECOND COPY OF THE RULES.
// -----------------------------------------------------------------------------
// getDocumentDetail runs the endpoint's own refusal predicate and ships
// `reextractable`. The client renders that boolean and nothing else. Restating
// the rules here would be a copy that drifts, and it could not be written
// correctly anyway: the DTO carries no `rawText`, so a client cannot separate an
// empty NEEDS_REVIEW row from one holding content — they differ in a column it
// never receives.
//
// So these tests drive the FLAG, not the shape. WHICH rows get the flag is the
// server's business, pinned in
// apps/backend/src/controllers/documentController.reextractGate.test.ts.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'reextract@example.com' },
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
    reextract: vi.fn(),
    getStats: vi.fn(),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

const s = strings.en;

let container: HTMLDivElement;
let root: Root;

// The canary's real shape: NEEDS_REVIEW, nothing extracted, machine facts only,
// and the server saying yes.
const emptyNeedsReview = (over: Record<string, unknown> = {}) => ({
  id: 'doc-7',
  originalFileName: 'JPEG_20260904_022045.jpg',
  status: 'NEEDS_REVIEW',
  overallConfidence: 0,
  documentType: 'UNKNOWN_DOCUMENT_TYPE',
  uploadedAt: '2026-09-04T01:21:09Z',
  processedAt: '2026-09-04T01:22:23Z',
  reextractable: true,
  facts: [],
  entities: [],
  ...over,
});

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
          <MemoryRouter initialEntries={['/documents/doc-7']}>
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

const toastText = () => container.querySelector('.toast-message')?.textContent?.trim() ?? null;
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(b => b.textContent?.includes(label));
const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (documentService.getStats as any).mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
  (documentService.reextract as any).mockResolvedValue({ documentId: 'doc-7', reextracting: true });
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

describe('the retry button on an empty NEEDS_REVIEW document', () => {
  it('renders when the server says the row is re-extractable', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview());
    mount();
    await settle();
    expect(
      button(s.retryExtraction),
      'the 110 recoverable rows still have no way to reach the endpoint'
    ).toBeTruthy();
  });

  it('does NOT render when the server says the row is not re-extractable', async () => {
    // The 10 multi-document rows, a row holding content, a row carrying user
    // edits: all arrive with the flag false and must offer nothing.
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview({ reextractable: false }));
    mount();
    await settle();
    expect(button(s.retryExtraction)).toBeFalsy();
  });

  it('does NOT render when the field is absent, rather than guessing the shape', async () => {
    // A response served before this deploy, or from a cache. Absent must read
    // as "no" — never as a shape the client re-derives for itself.
    const doc = emptyNeedsReview();
    delete (doc as any).reextractable;
    (documentService.getDocumentDetail as any).mockResolvedValue(doc);
    mount();
    await settle();
    expect(button(s.retryExtraction)).toBeFalsy();
  });

  it('keeps approve and reject alongside it', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview());
    mount();
    await settle();
    expect(button(s.approve)).toBeTruthy();
    expect(button(s.reject)).toBeTruthy();
  });

  it('calls the endpoint once and reports that re-processing started', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview());
    mount();
    await settle();
    click(button(s.retryExtraction)!);
    await settle();
    expect(documentService.reextract).toHaveBeenCalledTimes(1);
    expect(documentService.reextract).toHaveBeenCalledWith('doc-7');
    expect(toastText()).toBe(s.reextractStarted);
  });
});

describe('the three refusal codes each get their OWN sentence, not a generic toast', () => {
  // Reachable from the server long before they were reachable from a tap. Each
  // fell through to `toastUpdateError` — "something went wrong" — which tells a
  // user refused for holding their own edits nothing they can act on.
  const codes: Array<[string, string]> = [
    ['DOCUMENT_HAS_CONTENT', s.reextractHasContent],
    ['DOCUMENT_HAS_USER_EDITS', s.reextractHasUserEdits],
    ['DOCUMENT_NOT_SINGLE', s.reextractNotSingle],
  ];

  it.each(codes)('%s shows its own copy', async (code, expected) => {
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview());
    (documentService.reextract as any).mockRejectedValue(new Error(code));
    mount();
    await settle();
    click(button(s.retryExtraction)!);
    await settle();
    expect(toastText()).toBe(expected);
    expect(toastText(), 'fell through to the generic toast').not.toBe(s.toastUpdateError);
  });

  it('an unrecognised failure still gets the generic toast', async () => {
    // A 429 from the limiter, a bare proxy 409, a dropped socket: none of these
    // is one of the five codes and none may borrow their wording.
    (documentService.getDocumentDetail as any).mockResolvedValue(emptyNeedsReview());
    (documentService.reextract as any).mockRejectedValue(new Error('RATE_LIMITED'));
    mount();
    await settle();
    click(button(s.retryExtraction)!);
    await settle();
    expect(toastText()).toBe(s.toastUpdateError);
  });
});
