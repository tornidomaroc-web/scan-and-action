import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// ACCOUNT-DELETE ERRORS — no raw server prose ever reaches a user, in any locale.
// ============================================================================
// The delete path (DELETE /api/account) can fail in six distinct HTTP shapes plus
// a network TypeError. Only three carry a machine code (CONFIRMATION_REQUIRED,
// SHARED_WORKSPACE, RATE_LIMITED). The rest put ENGLISH PROSE in `data.error`:
// errorHandler.ts:48 ('Internal Server Error'), authMiddleware.ts:130
// ('Unauthorized: Invalid or expired token'), and the browser's own
// 'Failed to fetch' on a dropped connection.
//
// accountService used to throw `data.message || data.error` — prose FIRST — and
// DeleteAccountModal rendered it verbatim, so every failure showed English to
// French and Arabic users. The 409 is merely the case someone noticed.
//
// The fix mirrors lib/uploadErrors.ts: a WHITELIST with a translated fallback,
// applied at the render site, with the raw code kept in state. These tests pin
// that. The centrepiece is the negative control below: hand the helper the
// backend's English verbatim and it must still return translated generic copy —
// which holds even if someone later flips the precedence back in accountService.
// ============================================================================

vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const TEST_EMAIL = 'delete-check@example.com';
const signOut = vi.fn(async () => {});

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: TEST_EMAIL },
    session: null,
    loading: false,
    signOut,
  }),
}));
vi.mock('../src/services/accountService', () => ({
  accountService: { deleteAccount: vi.fn() },
}));

import { accountService } from '../src/services/accountService';
import { strings } from '../src/i18n/strings';
import { translateAccountError } from '../src/lib/accountErrors';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];

// The backend's raw English, quoted verbatim from source. If any of these ever
// reaches the DOM, a non-English user is reading English.
const BACKEND_PROSE = [
  // accountController.ts:72
  'You belong to a workspace with other members. Remove the other members or contact support before deleting your account.',
  // accountController.ts:40
  'Type your account email exactly to confirm deletion.',
  // rateLimits.ts:69
  'Too many account-deletion attempts. Please wait a while and try again.',
  // errorHandler.ts:48 — production, any 500
  'Internal Server Error',
  // errorHandler.ts:16 — Prisma P2002
  'Conflict: A record with that unique value already exists.',
  // authMiddleware.ts:130
  'Unauthorized: Invalid or expired token',
  // authMiddleware.ts:114
  'Missing or malformed access token',
  // Browser-generated on a dropped connection — locale-independent English.
  'Failed to fetch',
];

describe('translateAccountError (unit)', () => {
  it('maps the known codes to translated copy in every locale', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      expect(translateAccountError('SHARED_WORKSPACE', s)).toBe(s.deleteAccountSharedWorkspace);
      expect(translateAccountError('RATE_LIMITED', s)).toBe(s.deleteAccountRateLimited);
      expect(translateAccountError('CONFIRMATION_REQUIRED', s)).toBe(s.deleteAccountConfirmRequired);
    }
  });

  it('normalises case and surrounding whitespace before lookup', () => {
    const s = strings.fr;
    expect(translateAccountError('  shared_workspace  ', s)).toBe(s.deleteAccountSharedWorkspace);
  });

  it('falls back to TRANSLATED generic copy for unknown codes, empty, whitespace and null — never the raw input', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      for (const unknown of ['SOME_FUTURE_ENUM', 'DELETE_FAILED', 'NETWORK_ERROR', '', '   ', null, undefined]) {
        expect(translateAccountError(unknown as any, s)).toBe(s.deleteAccountError);
      }
    }
  });

  // THE NEGATIVE CONTROL. This is what proves the leak is closed by construction:
  // it passes regardless of what accountService's precedence chain does.
  it('never returns the backend message, even when handed the English prose verbatim', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      for (const prose of BACKEND_PROSE) {
        expect(translateAccountError(prose, s)).toBe(s.deleteAccountError);
      }
    }
    // And specifically: the English never survives into the returned string.
    const ar = strings.ar;
    expect(translateAccountError(BACKEND_PROSE[0], ar)).not.toContain('workspace');
    expect(translateAccountError(BACKEND_PROSE[3], ar)).not.toContain('Internal');
    expect(translateAccountError('Failed to fetch', ar)).not.toContain('fetch');
  });
});

// ============================================================================
// i18n parity for the 3 new keys. renderScreens.test.tsx:167-171 asserts the key
// SETS match across locales; it does not catch an empty string. This does.
// ============================================================================
describe('account-error i18n keys', () => {
  const NEW_KEYS = [
    'deleteAccountSharedWorkspace',
    'deleteAccountRateLimited',
    'deleteAccountConfirmRequired',
  ];

  for (const lang of LOCALES) {
    it(`${lang}: every account-error key is a non-empty string`, () => {
      const s = strings[lang] as Record<string, string>;
      for (const key of [...NEW_KEYS, 'deleteAccountError']) {
        expect(typeof s[key]).toBe('string');
        expect(s[key].trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('the three locales do not share the same copy (i.e. FR/AR are really translated)', () => {
    for (const key of NEW_KEYS) {
      const en = (strings.en as Record<string, string>)[key];
      expect((strings.fr as Record<string, string>)[key]).not.toBe(en);
      expect((strings.ar as Record<string, string>)[key]).not.toBe(en);
    }
  });

  it('the Arabic copy is actually Arabic script, not English left in place', () => {
    for (const key of [...NEW_KEYS, 'deleteAccountError']) {
      // U+0600–U+06FF is the Arabic block. Asserting on code points, because a
      // terminal that renders Arabic correctly proves nothing about the bytes.
      expect((strings.ar as Record<string, string>)[key]).toMatch(/[؀-ۿ]/);
    }
  });
});

// ============================================================================
// DOM — DeleteAccountModal renders translated copy, never English, never a code.
// ============================================================================
let container: HTMLDivElement;
let root: Root;

function mountModal(lang: Locale) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />
      </LanguageProvider>
    );
  });
}

/** Satisfy canDelete (DeleteAccountModal.tsx:32), then submit and let it reject. */
async function failDeleteWith(err: Error) {
  (accountService.deleteAccount as any).mockRejectedValue(err);

  const input = document.body.querySelector('#delete-confirm') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  flushSync(() => {
    setValue.call(input, TEST_EMAIL);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const confirm = [...document.body.querySelectorAll('button')].find(
    (b) => !(b as HTMLButtonElement).disabled && b.textContent?.trim() === strings[
      (localStorage.getItem('lang') || 'en') as Locale
    ].deleteAccountConfirmButton
  );
  expect(confirm, 'confirm button should be enabled once the email matches').toBeTruthy();
  flushSync(() => confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('DeleteAccountModal error copy — no raw English, no raw enum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('FR: SHARED_WORKSPACE renders the French copy, never the token', async () => {
    mountModal('fr');
    await failDeleteWith(new Error('SHARED_WORKSPACE'));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.fr.deleteAccountSharedWorkspace)
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('SHARED_WORKSPACE');
    expect(text).not.toContain('You belong to a workspace');
  });

  it('AR: SHARED_WORKSPACE renders the Arabic copy, never the token', async () => {
    mountModal('ar');
    await failDeleteWith(new Error('SHARED_WORKSPACE'));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountSharedWorkspace)
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('SHARED_WORKSPACE');
    expect(text).not.toContain('You belong to a workspace');
  });

  it('AR: RATE_LIMITED renders the Arabic copy, never the token', async () => {
    mountModal('ar');
    await failDeleteWith(new Error('RATE_LIMITED'));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountRateLimited)
    );
    expect(document.body.textContent).not.toContain('RATE_LIMITED');
  });

  // DOM negative control: simulates a regression at accountService.ts:19 that
  // reintroduces `data.message`. The render site must still refuse the prose.
  it('AR: raw English prose thrown by the service still renders translated generic copy', async () => {
    mountModal('ar');
    await failDeleteWith(new Error(BACKEND_PROSE[0]));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountError)
    );
    expect(document.body.textContent).not.toContain('You belong to a workspace');
  });

  it('AR: a 500 (Internal Server Error) renders translated generic copy', async () => {
    mountModal('ar');
    await failDeleteWith(new Error('Internal Server Error'));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountError)
    );
    expect(document.body.textContent).not.toContain('Internal Server Error');
  });

  // The failure a mobile user is most likely to hit: a dropped connection.
  it('AR: a network failure renders translated generic copy, never "Failed to fetch"', async () => {
    mountModal('ar');
    await failDeleteWith(new TypeError('Failed to fetch'));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountError)
    );
    expect(document.body.textContent).not.toContain('Failed to fetch');
  });

  it('AR: an error with no message at all renders translated generic copy', async () => {
    mountModal('ar');
    await failDeleteWith(new Error(''));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.ar.deleteAccountError)
    );
  });
});
