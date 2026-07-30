import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// FIX-ACTION PANEL — audit #7 Class B, PR 3 of 3. The last site.
// ============================================================================
// FixActionPanel.tsx:48 carried TWO defects on one line:
//
//     setError(err.message || s.fixErrorJustification);
//
//   1. THE LEAK. `err.message` rendered verbatim into the panel's error <p>.
//      documentService.ts:114 throws `errorData.error || 'Failed to submit
//      action'`, and the backend puts PROSE in `data.error`:
//        documentController.ts:268  'Document not found or access denied'  404
//        authMiddleware.ts:114      'Missing or malformed access token'    401
//        authMiddleware.ts:130      'Unauthorized: Invalid or expired token' 401
//        errorHandler.ts:71/76      'Internal Server Error'                5xx
//      plus the browser's own TypeError('Failed to fetch'). All English.
//
//   2. THE WRONG FALLBACK. s.fixErrorJustification is the FORM-VALIDATION
//      message used eleven lines earlier at :39 when the textarea is EMPTY.
//      As the fallback for a failed SERVER call it told a user who had filled
//      the field in correctly to fill it in.
//
// No Supabase-style code reaches this path (getJsonHeaders -> getAuthHeaders
// ignores the auth error and simply omits the header), so lib/serverErrors.ts
// is deliberately NOT used here — same reasoning as PR 2.
//
// The distinctness test below is the heart of this file: defect 2 is invisible
// to a leak-only assertion, because both strings are legitimate catalog copy.
// Only driving BOTH paths and comparing them proves the two uses separated.
// ============================================================================

vi.mock('../src/services/documentService', () => ({
  documentService: { applyFixAction: vi.fn() },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { FixActionPanel } from '../src/components/FixActionPanel';

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let container: HTMLDivElement;
let root: Root;

/** Mount the panel in its FLAGGED mode (textarea + two action buttons). */
function mountFlagged(lang: Locale) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <FixActionPanel documentId="doc-9" decision="FLAGGED" onSuccess={() => {}} />
      </LanguageProvider>
    );
  });
}

/** Mount the panel in its NEEDS_REVIEW / missing-amount mode (number input). */
function mountMissingAmount(lang: Locale) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <FixActionPanel documentId="doc-9" decision="NEEDS_REVIEW" reason="Missing amount on invoice" onSuccess={() => {}} />
      </LanguageProvider>
    );
  });
}

/** The panel's error paragraph (FixActionPanel.tsx:123-124). */
const errorText = () => container.querySelector('.text-danger-text')?.textContent?.trim() ?? null;

/** Type into a controlled React input/textarea the way a real keystroke would. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Click a button by its CATALOG label in the active locale (never English). */
function clickButton(label: string) {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`button not found for label: ${JSON.stringify(label)}`);
  flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('FixActionPanel — the leak, closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('AR: a failed server call shows the Arabic string EXACTLY, never the English', async () => {
    (documentService.applyFixAction as any).mockRejectedValue(new Error('Document not found or access denied'));
    mountFlagged('ar');

    type(container.querySelector('textarea')!, 'هذا مبرر صحيح');
    clickButton(strings.ar.fixMarkValid);

    await vi.waitFor(() => expect(errorText()).toBeTruthy());
    expect(errorText()).toBe(strings.ar.toastUpdateError);
    expect(container.textContent).not.toContain('Document not found or access denied');
  });

  it('FR: a failed server call shows the French string EXACTLY, never the English', async () => {
    (documentService.applyFixAction as any).mockRejectedValue(new Error('Internal Server Error'));
    mountFlagged('fr');

    type(container.querySelector('textarea')!, 'Une justification valable');
    clickButton(strings.fr.fixMarkValid);

    await vi.waitFor(() => expect(errorText()).toBeTruthy());
    expect(errorText()).toBe(strings.fr.toastUpdateError);
    expect(container.textContent).not.toContain('Internal Server Error');
  });

  // Every prose shape this endpoint and the browser can produce, quoted from
  // source. If any reaches the DOM, a non-English user is reading English.
  const BACKEND_PROSE = [
    'Failed to submit action', // documentService.ts:114 fallback literal
    'Document not found or access denied', // documentController.ts:268
    'Missing or malformed access token', // authMiddleware.ts:114
    'Unauthorized: Invalid or expired token', // authMiddleware.ts:130
    'Internal Server Error', // errorHandler.ts:71/76
    'Missing justification', // documentController.ts:292, thrown in the transaction
    'Failed to fetch', // browser TypeError on a dropped connection
  ];

  for (const prose of BACKEND_PROSE) {
    it(`AR: "${prose}" never reaches the screen`, async () => {
      (documentService.applyFixAction as any).mockRejectedValue(new Error(prose));
      mountFlagged('ar');

      type(container.querySelector('textarea')!, 'مبرر مكتوب بالكامل');
      clickButton(strings.ar.fixMarkValid);

      await vi.waitFor(() => expect(errorText()).toBeTruthy());
      expect(errorText()).toBe(strings.ar.toastUpdateError);
      expect(container.textContent, `"${prose}" leaked into the Arabic render`).not.toContain(prose);
    });
  }

  it('a non-Error rejection cannot leak either (no .message to read)', async () => {
    (documentService.applyFixAction as any).mockRejectedValue('LEAK_ME_STRING');
    mountFlagged('ar');

    type(container.querySelector('textarea')!, 'مبرر');
    clickButton(strings.ar.fixMarkValid);

    await vi.waitFor(() => expect(errorText()).toBeTruthy());
    expect(errorText()).toBe(strings.ar.toastUpdateError);
    expect(container.textContent).not.toContain('LEAK_ME_STRING');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// THE SECOND DEFECT — the two uses are now distinct.
// ────────────────────────────────────────────────────────────────────────────
// This is the assertion the whole PR turns on. Before the fix BOTH paths ended
// at s.fixErrorJustification, so a leak-only test would have passed while the
// bug survived: a user who filled the textarea in correctly and hit a 500 was
// told to "enter a justification or note".
describe('FixActionPanel — validation and server failure say DIFFERENT things', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('AR: EMPTY field -> validation copy; FILLED field + failed call -> update-error copy', async () => {
    (documentService.applyFixAction as any).mockRejectedValue(new Error('Internal Server Error'));
    mountFlagged('ar');

    // 1. Empty textarea: the client-side guard at :39 still fires, unchanged.
    clickButton(strings.ar.fixMarkValid);
    expect(errorText(), 'the empty-field validation message regressed').toBe(strings.ar.fixErrorJustification);
    expect(documentService.applyFixAction, 'an empty field must not reach the server').not.toHaveBeenCalled();

    // 2. Same panel, field now filled, server rejects.
    type(container.querySelector('textarea')!, 'مبرر مكتوب بالكامل');
    clickButton(strings.ar.fixMarkValid);
    await vi.waitFor(() => expect(errorText()).toBe(strings.ar.toastUpdateError));
    expect(documentService.applyFixAction).toHaveBeenCalledTimes(1);

    // 3. The two are genuinely different strings.
    expect(strings.ar.toastUpdateError).not.toBe(strings.ar.fixErrorJustification);
  });

  it('a user who filled the field in is NEVER told to fill it in', async () => {
    // The exact regression this PR removes, asserted in all three locales.
    // The final iteration is left mounted for afterEach to tear down.
    for (const [i, lang] of LOCALES.entries()) {
      (documentService.applyFixAction as any).mockRejectedValue(new Error('Internal Server Error'));
      mountFlagged(lang);

      type(container.querySelector('textarea')!, 'filled in by the user');
      clickButton(strings[lang].fixMarkValid);

      await vi.waitFor(() => expect(errorText()).toBeTruthy());
      expect(errorText(), `${lang}: server failure still shows the form-validation copy`).not.toBe(
        strings[lang].fixErrorJustification
      );
      expect(errorText()).toBe(strings[lang].toastUpdateError);

      if (i < LOCALES.length - 1) {
        root.unmount();
        container.remove();
        document.body.innerHTML = '';
      }
    }
  });

  it('the note_added button behaves the same as marked_valid', async () => {
    (documentService.applyFixAction as any).mockRejectedValue(new Error('Internal Server Error'));
    mountFlagged('ar');

    type(container.querySelector('textarea')!, 'ملاحظة مكتوبة');
    clickButton(strings.ar.fixSaveNote);

    await vi.waitFor(() => expect(errorText()).toBeTruthy());
    expect(errorText()).toBe(strings.ar.toastUpdateError);
  });

  it('AR amount mode: EMPTY amount -> amount validation; FILLED + failed call -> update-error', async () => {
    (documentService.applyFixAction as any).mockRejectedValue(new Error('Internal Server Error'));
    mountMissingAmount('ar');

    clickButton(strings.ar.saveCorrection);
    expect(errorText(), 'the empty-amount validation message regressed').toBe(strings.ar.fixErrorAmount);
    expect(documentService.applyFixAction).not.toHaveBeenCalled();

    type(container.querySelector('input[type="number"]')!, '1250');
    clickButton(strings.ar.saveCorrection);
    await vi.waitFor(() => expect(errorText()).toBe(strings.ar.toastUpdateError));
    expect(errorText()).not.toBe(strings.ar.fixErrorAmount);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Structural guard — the source line itself.
// ────────────────────────────────────────────────────────────────────────────
describe('FixActionPanel source — no raw message render survives', () => {
  const SRC = readSrc('../src/components/FixActionPanel.tsx');
  const CODE = SRC.split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  it('renders no err.message / error.message in code (comments excepted)', () => {
    expect(CODE, 'a raw .message render came back').not.toMatch(/setError\(\s*\w+\.message/);
  });

  it('the server-failure catch routes to s.toastUpdateError', () => {
    expect(CODE).toMatch(/setError\(s\.toastUpdateError\)/);
  });

  it('the client-side validation at :39 is UNCHANGED and still uses its own strings', () => {
    expect(CODE).toMatch(/if\s*\(!amount\)\s*return setError\(s\.fixErrorAmount\)/);
    expect(CODE).toMatch(/if\s*\(!justification\)\s*return setError\(s\.fixErrorJustification\)/);
  });

  it('s.fixErrorJustification is no longer used as a server-failure fallback', () => {
    expect(CODE).not.toMatch(/\|\|\s*s\.fixErrorJustification/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// The catalog strings — code-point exact (never trust the terminal).
// ────────────────────────────────────────────────────────────────────────────
// Both keys are PRE-EXISTING. This PR adds no copy; the arrays pin the values
// they already had so neither use can be silently re-pointed at other words.
describe('AR catalog — code-point exact', () => {
  // "تعذّر تحديث هذا العنصر. يرجى المحاولة مرة أخرى."  SHADDA 1617 in تعذّر
  const AR_TOAST_UPDATE_ERROR = [
    1578, 1593, 1584, 1617, 1585, 32, 1578, 1581, 1583, 1610, 1579, 32, 1607, 1584, 1575, 32, 1575, 1604, 1593,
    1606, 1589, 1585, 46, 32, 1610, 1585, 1580, 1609, 32, 1575, 1604, 1605, 1581, 1575, 1608, 1604, 1577, 32, 1605,
    1585, 1577, 32, 1571, 1582, 1585, 1609, 46,
  ];
  // "يرجى إدخال مبرر أو ملاحظة."
  const AR_FIX_ERROR_JUSTIFICATION = [
    1610, 1585, 1580, 1609, 32, 1573, 1583, 1582, 1575, 1604, 32, 1605, 1576, 1585, 1585, 32, 1571, 1608, 32, 1605,
    1604, 1575, 1581, 1592, 1577, 46,
  ];

  it('strings.ar.toastUpdateError matches the approved code points exactly', () => {
    expect(cps(strings.ar.toastUpdateError), 'strings.ar.toastUpdateError drifted').toEqual(AR_TOAST_UPDATE_ERROR);
  });

  it('strings.ar.fixErrorJustification is untouched by this PR', () => {
    expect(cps(strings.ar.fixErrorJustification), 'strings.ar.fixErrorJustification drifted').toEqual(
      AR_FIX_ERROR_JUSTIFICATION
    );
  });

  it('keeps the SHADDA in تعذّر and uses no ASCII comma', () => {
    expect(cps(strings.ar.toastUpdateError), 'SHADDA 1617 lost').toContain(1617);
    expect(cps(strings.ar.toastUpdateError), 'an ASCII comma leaked into Arabic copy').not.toContain(44);
  });

  it('carries NO hidden bidi / zero-width control characters', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    for (const k of ['toastUpdateError', 'fixErrorJustification', 'fixErrorAmount'] as const) {
      expect(cps(strings.ar[k]).filter(isCtrl), `${k} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('both strings exist and are distinct in all three locales', () => {
    for (const lang of LOCALES) {
      expect(typeof strings[lang].toastUpdateError === 'string' && strings[lang].toastUpdateError.length > 0).toBe(
        true
      );
      expect(strings[lang].toastUpdateError).not.toBe(strings[lang].fixErrorJustification);
    }
  });

  it('is unchanged copy: this PR adds no catalog keys', () => {
    expect(strings.en.toastUpdateError).toBe("We couldn't update this review item. Please try again.");
    expect(strings.en.fixErrorJustification).toBe('Please enter a justification or note.');
  });
});
