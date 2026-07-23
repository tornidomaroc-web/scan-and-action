import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// UPLOAD ERRORS — no raw API enum ever reaches a user, in any locale.
// ============================================================================
// The upload endpoint fails with machine codes (LIMIT_REACHED,
// DAILY_LIMIT_REACHED, ...). They used to be written straight into the file-error
// card and the error toast, so a French or Arabic user saw the bare English token
// "LIMIT_REACHED". DAILY_LIMIT_REACHED was not handled at all — a PRO user hitting
// the 200/day cap saw the raw enum on every platform.
//
// Components now keep the raw code in state and translate ONLY at the render site
// (lib/uploadErrors.ts). These tests pin that: known codes render their key,
// unknown codes render translated generic copy, and the token itself never
// appears. The native/anti-steering half of this contract (the backend's upsell
// `message` must never render) lives in nativeAntiSteering.test.tsx.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'i18n-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getDocumentDetail: vi.fn(), getStats: vi.fn() },
}));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));

import { uploadDocument } from '../src/services/uploadService';
import { strings } from '../src/i18n/strings';
import { translateUploadError } from '../src/lib/uploadErrors';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { UploadModal } from '../src/components/UploadModal';

type Locale = 'en' | 'fr' | 'ar';

let container: HTMLDivElement;
let root: Root;

function mountModal(lang: Locale, plan?: 'FREE' | 'PRO') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <ProcessingProvider>
              <UploadModal isOpen onClose={() => {}} onSuccess={() => {}} plan={plan} />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

const photo = (name: string) => new File(['img'], name, { type: 'image/jpeg' });

/** Drive one failing upload and settle. */
async function failUploadWith(code: string) {
  (uploadDocument as any).mockRejectedValue(new Error(code));
  const input = document.body.querySelector('input[multiple]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [photo('a.jpg')], configurable: true });
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));

  // Locate the submit button by testid, not by English text — the label is now
  // localized (item #7 PR 1), so a substring match on 'Start Extraction' would
  // miss the FR/AR renders. The testid is locale-agnostic and stable.
  await vi.waitFor(() => {
    expect(document.body.querySelector('[data-testid="start-extraction"]')).toBeTruthy();
  });
  const start = document.body.querySelector('[data-testid="start-extraction"]') as HTMLButtonElement;
  flushSync(() => start.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('translateUploadError (unit)', () => {
  it('maps the known codes to translated copy in every locale', () => {
    for (const lang of ['en', 'fr', 'ar'] as Locale[]) {
      const s = strings[lang];
      expect(translateUploadError('LIMIT_REACHED', s)).toBe(s.freePlanLimitReached);
      expect(translateUploadError('DAILY_LIMIT_REACHED', s)).toBe(s.dailyLimitReached);
    }
  });

  it('falls back to TRANSLATED generic copy for unknown codes, empty and null — never the raw input', () => {
    for (const lang of ['en', 'fr', 'ar'] as Locale[]) {
      const s = strings[lang];
      for (const unknown of ['SOME_FUTURE_ENUM', 'Upload failed with status: 500', '', null, undefined]) {
        expect(translateUploadError(unknown as any, s)).toBe(s.uploadFailedGeneric);
      }
    }
  });

  it('never returns the backend upsell message, even when handed it verbatim', () => {
    const s = strings.en;
    const backendMessage = 'Free plan limit reached (10 scans). Please upgrade to PRO.';
    expect(translateUploadError(backendMessage, s)).toBe(s.uploadFailedGeneric);
    expect(translateUploadError(backendMessage, s)).not.toContain('upgrade');
  });
});

describe('UploadModal file-error card — no raw enum in any locale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('FR: LIMIT_REACHED renders the French copy, never the raw token', async () => {
    mountModal('fr', 'FREE');
    await failUploadWith('LIMIT_REACHED');

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.fr.freePlanLimitReached)
    );
    expect(document.body.textContent).not.toContain('LIMIT_REACHED');
  });

  it('AR: LIMIT_REACHED renders the Arabic copy, never the raw token', async () => {
    mountModal('ar', 'FREE');
    await failUploadWith('LIMIT_REACHED');

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.freePlanLimitReached)
    );
    expect(document.body.textContent).not.toContain('LIMIT_REACHED');
  });

  // The highest-value case: this hits PAYING customers. plan === 'PRO' skips the
  // FREE gating entirely, so before the fix the raw enum went straight to the card
  // and the toast on every platform.
  it('PRO hitting the daily cap: DAILY_LIMIT_REACHED renders neutral copy with NO upsell, never the raw token', async () => {
    mountModal('en', 'PRO');
    await failUploadWith('DAILY_LIMIT_REACHED');

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.dailyLimitReached)
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('DAILY_LIMIT_REACHED');
    // A PRO user has nothing to upgrade to: the copy must not sell.
    expect(text).not.toContain('upgrade');
    expect(text).not.toContain('PRO plan');
  });

  it('an unknown/future code renders translated generic copy, never the raw token', async () => {
    mountModal('fr', 'FREE');
    await failUploadWith('SOME_FUTURE_ENUM');

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.fr.uploadFailedGeneric)
    );
    expect(document.body.textContent).not.toContain('SOME_FUTURE_ENUM');
  });
});
