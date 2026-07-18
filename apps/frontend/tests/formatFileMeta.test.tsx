import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// D8b PR 4b — formatFileMeta: localised + dir-safe file-meta line.
// ============================================================================
// The meta line ("0.00 MB • PDF") was byte-identical at UploadModal:328 and
// CaptureSheet:226, and broken in Arabic on TWO axes: unlocalised ("MB"/"FILE"
// hardcoded, no locale decimal separator) AND rendered in a dir-less <p>, so in
// the RTL document (LanguageContext sets documentElement.dir='rtl') the Latin
// runs bidi-reordered to "MB • PDF 0.00" — the size displaced to the end.
//
// Two layers of test:
//   1. Pure — formatFileMeta yields a localised, logically-ordered string in
//      en/fr/ar (verified by Unicode code points for Arabic).
//   2. Render — both meta <p>s carry dir="auto", the structural half of the fix.
//
// jsdom has NO layout engine, so neither layer proves the Arabic PIXELS are in
// the right visual order — only that the string is localised+ordered and the
// paragraph is dir-safe. The visual RTL result still needs a real browser (the
// Vercel preview); see the PR body.
// ============================================================================

import { formatFileMeta } from '../src/lib/formatFileMeta';
import { strings } from '../src/i18n/strings';

const NBSP = ' ';

// 2 MB exactly, and a 1.5 MB image, so the decimal separator is exercised.
const pdf2mb = { size: 2 * 1024 * 1024, type: 'application/pdf' };
const png1_5mb = { size: 1.5 * 1024 * 1024, type: 'image/png' };
const typeless = { size: 0, type: '' };

describe('formatFileMeta — localised, correctly-ordered output', () => {
  it('EN: "2.00 MB • PDF" with a no-break space before the unit', () => {
    expect(formatFileMeta(pdf2mb, strings.en, 'en')).toBe(`2.00${NBSP}MB • PDF`);
  });

  it('FR: comma decimal, "Mo" unit, "FICHIER" fallback (localised, not English)', () => {
    expect(formatFileMeta(png1_5mb, strings.fr, 'fr')).toBe(`1,50${NBSP}Mo • PNG`);
    expect(formatFileMeta(typeless, strings.fr, 'fr')).toBe(`0,00${NBSP}Mo • FICHIER`);
  });

  it('AR: localised unit + LATIN digits, and the reversal-prone order is preserved logically', () => {
    const ar = formatFileMeta(pdf2mb, strings.ar, 'ar');

    // Localised unit is genuine Arabic script (the whole point vs the old "MB").
    expect(ar).toContain('ميغابايت');
    // Bare 'ar' subtag emits LATIN digits (matches lib/formatNumber.ts) — so the
    // number reads "2.00", never Arabic-Indic "٢٫٠٠".
    expect(ar).toContain('2.00');

    // Logical order number → unit → type. dir="auto" on the <p> (asserted below)
    // then flips this to the correct VISUAL order in RTL. Before this PR the
    // string was "2.00 MB • PDF" and the dir-less <p> scrambled it to
    // "MB • PDF 2.00"; keeping the number ahead of the unit ahead of the type is
    // what makes that fixable.
    const iNum = ar.indexOf('2.00');
    const iUnit = ar.indexOf('ميغابايت');
    const iType = ar.indexOf('PDF');
    expect(iNum).toBeGreaterThanOrEqual(0);
    expect(iNum).toBeLessThan(iUnit);
    expect(iUnit).toBeLessThan(iType);
  });

  it('AR unit is pure Arabic-block code points (no Latin left in place, no smuggled bidi controls)', () => {
    const unit = strings.ar.fileSizeMb;
    expect(unit).toBe('ميغابايت');
    const points = [...unit].map((c) => c.codePointAt(0)!);
    // Every glyph in the Arabic block U+0600–U+06FF.
    expect(points.every((p) => p >= 0x0600 && p <= 0x06ff)).toBe(true);
    // No zero-width / bidi-control characters hidden in the key.
    expect(points.some((p) => (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || p === 0xfeff)).toBe(false);
  });

  it('the extension token is upper-cased; an empty type falls back to the localised "unknown"', () => {
    expect(formatFileMeta({ size: 0, type: 'image/jpeg' }, strings.en, 'en')).toContain('JPEG');
    expect(formatFileMeta(typeless, strings.en, 'en')).toBe(`0.00${NBSP}MB • FILE`);
    expect(formatFileMeta(typeless, strings.ar, 'ar')).toContain('ملف');
  });

  it('all three locales expose the two new keys (parity)', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(typeof strings[lang].fileSizeMb).toBe('string');
      expect(typeof strings[lang].fileTypeUnknown).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Render layer: the meta <p> must carry dir="auto" in the real (RTL) DOM.
// ---------------------------------------------------------------------------
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
// Both components render <PaywallModal> (a child that calls useAuth) even while
// it is closed, so auth must resolve without a real AuthProvider.
vi.mock('../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'meta-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));

import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { UploadModal } from '../src/components/UploadModal';
import { CaptureSheet } from '../src/components/CaptureSheet';

let container: HTMLDivElement;
let root: Root;

function mount(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <ProcessingProvider>{element}</ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

// The meta <p> is the only paragraph carrying the bullet separator; the filename
// <p> beside it does not.
const metaParagraph = () =>
  [...document.querySelectorAll('p')].find((p) => p.textContent?.includes('•'));

describe('the meta <p> is dir-safe (dir="auto") in the Arabic render', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('UploadModal: the file-meta paragraph renders dir="auto" and the localised Arabic unit', async () => {
    mount(<UploadModal isOpen onClose={() => {}} plan="PRO" />);

    const input = document.body.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['pdf'], 'facture.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));

    await vi.waitFor(() => expect(metaParagraph()).toBeTruthy());
    const meta = metaParagraph()!;
    expect(meta.getAttribute('dir')).toBe('auto');
    expect(meta.textContent).toContain('ميغابايت'); // localised unit is wired through
    expect(meta.textContent).toContain('PDF');
  });

  it('CaptureSheet: the file-meta paragraph renders dir="auto" and the localised Arabic unit', async () => {
    mount(<CaptureSheet plan="PRO" />);

    // A PDF (not an image) keeps previewUrl empty, so the file-info card with the
    // meta line renders instead of an <img> preview.
    const fileInput = document.body.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    const file = new File(['pdf'], 'recu.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    flushSync(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));

    await vi.waitFor(() => expect(metaParagraph()).toBeTruthy());
    const meta = metaParagraph()!;
    expect(meta.getAttribute('dir')).toBe('auto');
    expect(meta.textContent).toContain('ميغابايت');
    expect(meta.textContent).toContain('PDF');
  });
});
