import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// D1 RENDER GUARD — audit #7 PR 3, Part 2.
// ============================================================================
// scanUploadCompletionLocalization.test.tsx asserts D1 on the CATALOG:
// `strings[lang].scanProcessed` contains no '{' placeholder. That is not the
// regression path. Before PR 1 the filename was spliced in at the CALL SITE:
//
//     showToast(`${name} processed successfully.`, 'success');   // pre-PR 1
//
// A catalog assertion cannot see that. Verified empirically on 7dccac7: putting
// the concatenation back into ProcessingContext.settle() left the ENTIRE 2090-
// test suite green while every completed scan showed a Latin filename spliced
// into an Arabic sentence.
//
// This test closes that hole by asserting on what the user actually SEES: mount
// the real ProcessingProvider + ToastProvider under lang=ar, settle a job, and
// compare the rendered toast text with toBe() — EQUALITY, not toContain().
// Equality is the whole point: toContain() passes under concatenation.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'toast-check@example.com' },
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
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider, useProcessing } from '../src/contexts/ProcessingContext';

const LS_KEY = 'sa_processing_jobs';

// A deliberately Latin, deliberately conspicuous filename. If any call-site
// concatenation returns, THIS is the string that shows up mid-Arabic — so it
// doubles as the payload and as the thing the equality assertion excludes.
const LATIN_FILENAME = 'Invoice_Q3_2026_ACME.pdf';

let container: HTMLDivElement;
let root: Root;

const TrackButton: React.FC = () => {
  const { trackUpload } = useProcessing();
  return (
    <button data-testid="track" onClick={() => trackUpload('doc-ar-1', LATIN_FILENAME)}>
      TRACK
    </button>
  );
};

function mount(lang: 'ar' | 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <ProcessingProvider>
              <TrackButton />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

/** Settle one job with `status` and return the rendered toast text verbatim. */
async function settleAndReadToast(status: string): Promise<string> {
  (documentService.getDocumentDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'doc-ar-1',
    status,
  });
  const btn = document.querySelector('[data-testid="track"]') as HTMLButtonElement;
  flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  // trackUpload -> startPolling -> immediate check() -> settle() -> showToast.
  await vi.waitFor(() => {
    expect(document.querySelector('.toast-message')).toBeTruthy();
  });
  return document.querySelector('.toast-message')!.textContent ?? '';
}

describe('per-scan completion toast RENDER — exact AR text, no filename spliced in (D1)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.removeItem(LS_KEY);
    vi.clearAllMocks();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  // The three terminal statuses ProcessingContext.settle() can reach.
  const CASES = [
    { status: 'COMPLETED', key: 'scanProcessed' },
    { status: 'NEEDS_REVIEW', key: 'scanNeedsReview' },
    { status: 'FAILED', key: 'scanFailed' },
  ] as const;

  for (const { status, key } of CASES) {
    it(`${status} renders exactly strings.ar.${key} under lang=ar`, async () => {
      mount('ar');
      const rendered = await settleAndReadToast(status);

      // EQUALITY. `toContain` would still pass if the filename were prepended
      // or appended — which is precisely the bug this guard exists to catch.
      expect(
        rendered,
        `The ${status} toast must render the catalog string ALONE. Anything extra ` +
          `means a value was concatenated at the call site in ProcessingContext.settle() ` +
          `— see ruling D1 in docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md.`
      ).toBe(strings.ar[key]);

      // Stated independently so a failure says WHICH hazard occurred: the Latin
      // filename must not appear anywhere in the Arabic toast.
      expect(rendered, 'a Latin filename leaked into the Arabic toast').not.toContain(
        LATIN_FILENAME
      );
      expect(rendered, 'a filename stem leaked into the Arabic toast').not.toContain('Invoice');
      // The dropped pre-PR-1 fallback must not come back either.
      expect(rendered, "the retired 'Document' fallback came back").not.toContain('Document');
    });
  }

  it('the same path under lang=en also renders the catalog string alone', async () => {
    mount('en');
    const rendered = await settleAndReadToast('COMPLETED');
    expect(rendered).toBe(strings.en.scanProcessed);
    expect(rendered).not.toContain(LATIN_FILENAME);
  });
});
