import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// DOCUMENT DETAIL LOAD FAILURE — no raw server English, in any locale.
// ============================================================================
// audit #7 Class B, PR 2 of 3. PR 1 closed the auth screen; this closes the
// most PROMINENT of the three sites. DocumentDetailScreen.tsx:70 did
//
//     .catch((err) => setErrorMsg(err.message))
//
// and :100 renders that string as the `message` of a full-screen ErrorState
// that REPLACES the entire document view. The raw English was not a footnote
// on the page; it WAS the page.
//
// What could land there, all English, none of it a machine code:
//   documentService.ts:12  throw new Error(errorData.error || 'Failed to load document')
//   documentController.ts:25   'Document not found'                        404
//   authMiddleware.ts:114      'Missing or malformed access token'         401
//   authMiddleware.ts:130      'Unauthorized: Invalid or expired token'    401
//   errorHandler.ts:29         'Conflict: A record with that unique value…' 409
//   errorHandler.ts:34         'Bad Request: A referenced record does not…' 400
//   errorHandler.ts:39         'Not Found: The requested record does not…'  404
//   errorHandler.ts:45         'Validation Error'
//   errorHandler.ts:71/76      'Internal Server Error'                     5xx
//   plus the browser's own TypeError('Failed to fetch') on a dropped socket.
//
// NO Supabase-style error code reaches this path, so lib/serverErrors.ts is
// deliberately NOT used here — it would be the wrong tool, and would put auth
// copy on a document screen. A plain catalog key is correct.
//
// s.somethingWrong is that key: it is ErrorState's OWN default title for an
// unspecified failure (components/ErrorState.tsx:21), and it is the one
// existing string true for every shape above at once.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'detail-error@example.com' },
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
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let container: HTMLDivElement;
let root: Root;

const OutletStub = () => (
  <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />
);

function mount(lang: Locale) {
  localStorage.setItem('lang', lang);
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

/** The ErrorState body paragraph (components/ErrorState.tsx:22). */
const errorBody = () => container.querySelector('.border-danger\\/30 p')?.textContent?.trim() ?? null;

/** Mount under `lang`, fail the load with `error`, and settle. */
async function mountAndFail(lang: Locale, error: unknown) {
  (documentService.getDocumentDetail as any).mockRejectedValue(error);
  mount(lang);
  await vi.waitFor(() => expect(errorBody()).toBeTruthy());
}

describe('DocumentDetail load failure — the leak, closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getStats as any).mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  // The assertion this PR exists for.
  it('AR: a failed load shows the Arabic string EXACTLY, never the English', async () => {
    await mountAndFail('ar', new Error('Document not found'));

    expect(errorBody()).toBe(strings.ar.somethingWrong);
    expect(container.textContent).not.toContain('Document not found');
  });

  it('FR: a failed load shows the French string EXACTLY, never the English', async () => {
    await mountAndFail('fr', new Error('Document not found'));

    expect(errorBody()).toBe(strings.fr.somethingWrong);
    expect(container.textContent).not.toContain('Document not found');
  });

  // Every prose shape the backend and the browser can produce on this path,
  // quoted verbatim from source. If any of these reaches the DOM, a non-English
  // user is reading English.
  const BACKEND_PROSE = [
    'Failed to load document', // documentService.ts:12 fallback literal
    'Document not found', // documentController.ts:25
    'Missing or malformed access token', // authMiddleware.ts:114
    'Unauthorized: Invalid or expired token', // authMiddleware.ts:130
    'Conflict: A record with that unique value already exists.', // errorHandler.ts:29
    'Bad Request: A referenced record does not exist.', // errorHandler.ts:34
    'Not Found: The requested record does not exist.', // errorHandler.ts:39
    'Validation Error', // errorHandler.ts:45
    'Internal Server Error', // errorHandler.ts:71/76
    'Failed to fetch', // browser TypeError on a dropped connection
  ];

  for (const prose of BACKEND_PROSE) {
    it(`AR: "${prose}" never reaches the screen`, async () => {
      await mountAndFail('ar', new Error(prose));

      expect(errorBody()).toBe(strings.ar.somethingWrong);
      expect(container.textContent, `"${prose}" leaked into the Arabic render`).not.toContain(prose);
    });
  }

  it('a non-Error rejection cannot leak either (no .message to read)', async () => {
    await mountAndFail('ar', 'LEAK_ME_STRING');

    expect(errorBody()).toBe(strings.ar.somethingWrong);
    expect(container.textContent).not.toContain('LEAK_ME_STRING');
  });

  it('the retry affordance is UNCHANGED (still offered, still localized)', async () => {
    await mountAndFail('ar', new Error('Internal Server Error'));

    const retry = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === strings.ar.tryAgain
    );
    expect(retry, 'the Try again button disappeared').toBeTruthy();
    // The title slot is untouched by this PR.
    expect(container.textContent).toContain(strings.ar.errorTitle);
  });

  it('does NOT claim the document is missing when the failure was something else', async () => {
    // s.docNotFound would be a specific CLAIM, false for a 401/500/offline.
    // :101 keeps it for the genuine not-found case; :70 must not borrow it.
    await mountAndFail('ar', new Error('Internal Server Error'));

    expect(errorBody()).not.toBe(strings.ar.docNotFound);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Structural guard — the source line itself.
// ────────────────────────────────────────────────────────────────────────────
describe('DocumentDetailScreen source — no raw message render survives', () => {
  const SRC = readSrc('../src/screens/DocumentDetailScreen.tsx');

  it('renders no err.message / error.message in code (comments excepted)', () => {
    const code = SRC.split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code, 'a raw .message render came back').not.toMatch(/setErrorMsg\(\s*\w+\.message/);
    expect(code).not.toMatch(/\.catch\(\s*\(\s*err\s*\)\s*=>\s*setErrorMsg\(err\.message\)/);
  });

  it('routes the catch through the catalog', () => {
    expect(SRC).toMatch(/\.catch\(\(\)\s*=>\s*setErrorMsg\(s\.somethingWrong\)\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// The catalog string — code-point exact (never trust the terminal).
// ────────────────────────────────────────────────────────────────────────────
// #122 discipline: the terminal renders Arabic right-to-left and will happily
// display a wrong letter or a silent English fallback as something that LOOKS
// correct. The numbers are the contract.
//
// somethingWrong is a PRE-EXISTING key. This PR adds no copy; the array below
// pins the value it already had so this screen cannot be silently re-pointed at
// different words.
describe('AR somethingWrong — code-point exact', () => {
  // "حدث خطأ ما"
  const AR_SOMETHING_WRONG = [1581, 1583, 1579, 32, 1582, 1591, 1571, 32, 1605, 1575];

  it('strings.ar.somethingWrong matches the approved code points exactly', () => {
    expect(cps(strings.ar.somethingWrong), 'strings.ar.somethingWrong drifted').toEqual(AR_SOMETHING_WRONG);
  });

  it('carries NO hidden bidi / zero-width control characters', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    expect(cps(strings.ar.somethingWrong).filter(isCtrl)).toEqual([]);
  });

  it('exists and is non-empty in all three locales', () => {
    for (const lang of LOCALES) {
      expect(typeof strings[lang].somethingWrong === 'string' && strings[lang].somethingWrong.length > 0).toBe(true);
    }
  });

  it('EN, FR and AR are all distinct', () => {
    expect(strings.en.somethingWrong).not.toBe(strings.fr.somethingWrong);
    expect(strings.en.somethingWrong).not.toBe(strings.ar.somethingWrong);
    expect(strings.fr.somethingWrong).not.toBe(strings.ar.somethingWrong);
  });

  it('is unchanged copy: this PR adds no catalog keys', () => {
    expect(strings.en.somethingWrong).toBe('Something went wrong');
    expect(strings.fr.somethingWrong).toBe('Une erreur est survenue');
  });
});
