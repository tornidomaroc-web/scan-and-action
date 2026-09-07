import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// The retry affordance for a FAILED document.
// ============================================================================
// A FAILED row is ALREADY listed and ALREADY tappable — documentController's
// getAllDocuments filters on organizationId only (no status filter), the
// Activity row navigates to /documents/:id, and searchResultCard already maps
// FAILED to a red dot + statusFailed. What it has today is NO ACTION: the
// sticky bar is gated `doc.status === 'NEEDS_REVIEW'`, so the one screen a user
// can reach a failed document on offers them nothing.
//
// So this is a widened gate, not a new screen. NEEDS_REVIEW keeps approve /
// reject; FAILED gets a single retry button in the SAME sticky container; every
// other status keeps showing no bar at all.
//
// The two 409 codes are surfaced here rather than swallowed, and by EXACT code
// (lib/identityConflict.ts:20-22 sets the convention: services throw
// `new Error(<server code>)`, so the code arrives as the Error message). They
// mean opposite things — one says re-upload, the other says wait — so a shared
// "something went wrong" toast would be a regression, not a simplification.
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
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
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

const docWithStatus = (status: string) => ({
  id: 'doc-7',
  originalFileName: 'Invoice.pdf',
  status,
  overallConfidence: 0,
  uploadedAt: '2026-07-01T10:00:00Z',
  facts: [],
  entities: [],
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
  vi.restoreAllMocks();
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
});

async function renderWithStatus(status: string) {
  (documentService.getDocumentDetail as any).mockResolvedValue(docWithStatus(status));
  mount();
  await settle();
  flushSync(() => {});
}

describe('DocumentDetailScreen — retry control for a FAILED document', () => {
  it('shows the retry button for a FAILED document', async () => {
    await renderWithStatus('FAILED');
    expect(button(s.retryExtraction)).toBeTruthy();
  });

  it('does NOT show approve/reject for a FAILED document', async () => {
    await renderWithStatus('FAILED');
    expect(button(s.approve)).toBeFalsy();
  });

  it('keeps approve/reject for NEEDS_REVIEW, and shows no retry there', async () => {
    await renderWithStatus('NEEDS_REVIEW');
    expect(button(s.approve)).toBeTruthy();
    expect(button(s.retryExtraction)).toBeFalsy();
  });

  it.each(['COMPLETED', 'REJECTED', 'PROCESSING', 'LIMIT_REACHED'])(
    'shows neither control for %s',
    async status => {
      await renderWithStatus(status);
      expect(button(s.retryExtraction)).toBeFalsy();
      expect(button(s.approve)).toBeFalsy();
    }
  );

  it('calls the re-extract service with the document id', async () => {
    await renderWithStatus('FAILED');
    click(button(s.retryExtraction)!);
    await settle();
    expect(documentService.reextract).toHaveBeenCalledWith('doc-7');
  });

  // ---- the two 409 codes get DIFFERENT words ----

  it('SOURCE_FILE_UNAVAILABLE surfaces the re-upload copy', async () => {
    await renderWithStatus('FAILED');
    (documentService.reextract as any).mockRejectedValue(new Error('SOURCE_FILE_UNAVAILABLE'));

    click(button(s.retryExtraction)!);
    await settle();
    flushSync(() => {});

    expect(toastText()).toBe(s.reextractSourceUnavailable);
  });

  it('REEXTRACTION_IN_PROGRESS surfaces the wait copy, NOT the re-upload copy', async () => {
    await renderWithStatus('FAILED');
    (documentService.reextract as any).mockRejectedValue(new Error('REEXTRACTION_IN_PROGRESS'));

    click(button(s.retryExtraction)!);
    await settle();
    flushSync(() => {});

    expect(toastText()).toBe(s.reextractInProgress);
    expect(toastText()).not.toBe(s.reextractSourceUnavailable);
  });

  it('an unrecognised failure keeps the generic toast — the two codes are matched EXACTLY', async () => {
    await renderWithStatus('FAILED');
    // A bare 409 from a proxy, a 500, a dropped socket: none of these are the
    // two conditions, and none may borrow their copy.
    (documentService.reextract as any).mockRejectedValue(new Error('Failed to fetch'));

    click(button(s.retryExtraction)!);
    await settle();
    flushSync(() => {});

    expect(toastText()).not.toBe(s.reextractSourceUnavailable);
    expect(toastText()).not.toBe(s.reextractInProgress);
  });

  it('RATE_LIMITED is not mistaken for either 409', async () => {
    await renderWithStatus('FAILED');
    (documentService.reextract as any).mockRejectedValue(new Error('RATE_LIMITED'));

    click(button(s.retryExtraction)!);
    await settle();
    flushSync(() => {});

    expect(toastText()).not.toBe(s.reextractSourceUnavailable);
    expect(toastText()).not.toBe(s.reextractInProgress);
  });
});
