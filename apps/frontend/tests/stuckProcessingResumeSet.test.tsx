import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// THE RESUME SET — why a stuck PROCESSING row costs the user something.
// ============================================================================
// The backend half of this change (ingestionService) makes a document whose
// markAsNeedsReview write failed land in FAILED instead of being left in
// PROCESSING. The status write is the easy half. What that write actually BUYS
// is here, in the client, and it is what these tests pin:
//
//   ProcessingContext.tsx:55-57  resume-on-mount reads localStorage and keeps
//                                every job still marked PROCESSING whose
//                                startedAt is inside RESUME_WINDOW_MS (2h).
//   ProcessingContext.tsx:70-76  ONLY PROCESSING jobs are persisted, so a job
//                                leaves the resume set the moment it settles.
//   ProcessingContext.tsx:175-177 on native, every foreground restarts polling
//                                for each job still marked PROCESSING, and
//                                startPolling (:109) resets pollStart — a
//                                FRESH 90s window each time.
//
// So while the row stays PROCESSING the job stays in the resume set, gets
// re-polled, and has its 90-second timeout window reset on every foreground.
// Once the server reports FAILED the job settles on the very first poll
// (startPolling calls check() immediately, :139), drops out of storage, and
// stops matching both filters.
//
// THESE ARE PINS, NOT REDS. The frontend is unchanged by this PR; both tests
// pass before and after. Their job is to lock the linkage between "the server
// reports a terminal status" and "the job leaves the resume set", so a later
// edit to the persist filter or to settle() cannot silently reintroduce the
// stuck-poll behaviour that the backend change exists to prevent.
// ============================================================================

const h = vi.hoisted(() => ({
  native: { value: true },
  appStateCb: { current: null as null | ((s: { isActive: boolean }) => void) },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native.value },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, cb: (s: { isActive: boolean }) => void) => {
      if (name === 'appStateChange') h.appStateCb.current = cb;
      return Promise.resolve({ remove: vi.fn() });
    },
  },
}));

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'resume-set@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getDocumentDetail: vi.fn(), getStats: vi.fn() },
}));

import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';

const LS_KEY = 'sa_processing_jobs';

let container: HTMLDivElement;
let root: Root;
let settled: ReturnType<typeof vi.fn>;

/** Seed the resume set with one in-flight job, well inside the 2h window. */
function seedResumeSet(documentId: string) {
  localStorage.setItem(
    LS_KEY,
    JSON.stringify([
      { documentId, fileName: 'receipt.jpg', status: 'PROCESSING', startedAt: Date.now() - 60_000 },
    ])
  );
}

function storedJobs(): Array<{ documentId: string; status: string }> {
  return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
}

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <ProcessingProvider onJobSettled={settled}>
              <div />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

describe('a terminal server status removes the job from the resume set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.native.value = true;
    h.appStateCb.current = null;
    settled = vi.fn();
  });

  afterEach(() => {
    root?.unmount();
    container?.remove();
  });

  it('server says FAILED: the job settles at once and stops matching BOTH filters', async () => {
    seedResumeSet('doc-failed');
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'FAILED' });

    mount();

    await vi.waitFor(() =>
      expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-failed')
    );
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());

    // ProcessingContext.tsx:70-76 — only PROCESSING jobs persist, so a settled
    // job is gone from storage and :55-57 cannot resume it on a cold start.
    await vi.waitFor(() => expect(storedJobs()).toHaveLength(0));

    // ProcessingContext.tsx:175-177 — a foreground no longer matches it, so no
    // further poll and no further toast.
    expect(h.appStateCb.current).not.toBeNull();
    const before = (documentService.getDocumentDetail as any).mock.calls.length;
    h.appStateCb.current!({ isActive: true });
    await new Promise(r => setTimeout(r, 50));
    expect((documentService.getDocumentDetail as any).mock.calls.length).toBe(before);
  });

  it('server stays PROCESSING: the job stays in the resume set and a foreground re-polls it', async () => {
    // This is the state the backend change removes. Nothing settles, so the job
    // is still in storage (resumable on the next cold start) and still matches
    // the foreground filter — which restarts polling and resets the 90s window.
    seedResumeSet('doc-stuck');
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });

    mount();

    await vi.waitFor(() =>
      expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-stuck')
    );

    expect(settled).not.toHaveBeenCalled();
    expect(storedJobs()).toHaveLength(1);
    expect(storedJobs()[0].status).toBe('PROCESSING');

    expect(h.appStateCb.current).not.toBeNull();
    const before = (documentService.getDocumentDetail as any).mock.calls.length;
    h.appStateCb.current!({ isActive: true });
    await vi.waitFor(() =>
      expect((documentService.getDocumentDetail as any).mock.calls.length).toBeGreaterThan(before)
    );
  });
});
