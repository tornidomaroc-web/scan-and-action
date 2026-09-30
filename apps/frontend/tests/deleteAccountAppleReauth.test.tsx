import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// Account deletion and Sign in with Apple (2026-09-30). On iOS an Apple-linked
// user gets one more Apple sheet before the request; its authorization code
// travels with the confirmation and the backend revokes before deleting. What
// is pinned, per case, is what happens to the DELETION:
//
//   sheet confirmed      DELETE is sent with the code
//   sheet cancelled      DELETE is never sent; the modal stays, says so, and
//                        the button is live again
//   sheet returns no code  same as cancelled, different copy
//   backend says failed  the account is gone; the person is told Apple still
//                        lists us (a toast on the way out)
//   web / Android        no sheet, no code, the note names the residue
//   not Apple-linked     nothing about Apple anywhere
// ============================================================================

const TEST_EMAIL = 'apple-delete@example.com';
const h = vi.hoisted(() => ({
  platform: 'ios',
  identities: [{ provider: 'apple' }] as Array<{ provider: string }>,
  reauth: vi.fn(),
  deleteAccount: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' } }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: TEST_EMAIL, identities: h.identities }, session: null, loading: false, signOut: vi.fn(async () => {}) }),
}));
vi.mock('../src/services/accountService', () => ({ accountService: { deleteAccount: h.deleteAccount } }));
vi.mock('../src/lib/socialAuth', () => {
  class SocialSignInCancelled extends Error {}
  return { reauthenticateWithApple: h.reauth, SocialSignInCancelled };
});
vi.mock('../src/contexts/ToastContext', () => ({ useOptionalToast: () => ({ showToast: h.showToast }) }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DeleteAccountModal, hasAppleIdentity } from '../src/components/DeleteAccountModal';
import { SocialSignInCancelled } from '../src/lib/socialAuth';

let container: HTMLDivElement;
let root: Root;
const onDeleted = vi.fn();
const onClose = vi.fn();

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <DeleteAccountModal isOpen onClose={onClose} onDeleted={onDeleted} />
      </LanguageProvider>
    );
  });
}
const dialog = () => document.querySelector('[role="dialog"]')!;
const text = () => dialog().textContent ?? '';
const typeEmail = () => {
  const input = dialog().querySelector<HTMLInputElement>('#delete-confirm')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, TEST_EMAIL);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const confirmButton = () => Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent === strings.en.deleteAccountConfirmButton || b.textContent === strings.en.deleteAccountDeleting)!;
const press = async () => {
  flushSync(() => confirmButton().click());
  await vi.waitFor(() => expect(confirmButton().textContent).toBe(strings.en.deleteAccountConfirmButton));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.platform = 'ios';
  h.identities = [{ provider: 'apple' }];
  h.reauth.mockResolvedValue('c0de.from.the.sheet');
  h.deleteAccount.mockResolvedValue({ appleRevocation: 'revoked' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('hasAppleIdentity', () => {
  it('reads Supabase identities, one per provider', () => {
    expect(hasAppleIdentity({ identities: [{ provider: 'email' }, { provider: 'apple' }] })).toBe(true);
    expect(hasAppleIdentity({ identities: [{ provider: 'google' }] })).toBe(false);
    expect(hasAppleIdentity({})).toBe(false);
    expect(hasAppleIdentity(null)).toBe(false);
  });
});

describe('iOS, Apple-linked', () => {
  it('shows the sheet note, and on confirmation sends DELETE with the code, then leaves', async () => {
    mount();
    expect(dialog().querySelector('[data-apple-note="sheet"]')!.textContent).toBe(strings.en.deleteAccountAppleReauthNote);
    typeEmail();
    flushSync(() => confirmButton().click());
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(h.reauth).toHaveBeenCalledTimes(1);
    expect(h.deleteAccount).toHaveBeenCalledWith(TEST_EMAIL, 'c0de.from.the.sheet');
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('the person cancels the Apple sheet: nothing is sent, the account stays, the modal says so and stays open', async () => {
    h.reauth.mockRejectedValue(new SocialSignInCancelled());
    mount();
    typeEmail();
    await press();
    expect(h.deleteAccount).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(strings.en.deleteAccountAppleCancelled);
    expect(confirmButton().disabled).toBe(false);
  });

  it('the sheet returns no code (or any other failure): nothing is sent, different copy', async () => {
    h.reauth.mockRejectedValue(new Error('APPLE_NO_CODE'));
    mount();
    typeEmail();
    await press();
    expect(h.deleteAccount).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(strings.en.deleteAccountAppleSheetFailed);
  });

  for (const status of ['failed', 'not_configured', 'skipped'] as const) {
    it(`backend reports ${status}: the account is deleted and the person is told Apple still lists us`, async () => {
      h.deleteAccount.mockResolvedValue({ appleRevocation: status });
      mount();
      typeEmail();
      flushSync(() => confirmButton().click());
      await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
      expect(h.showToast).toHaveBeenCalledWith(strings.en.deleteAccountAppleStillListed, 'info');
    });
  }

  it('the request itself fails after the sheet: the existing error path, account untouched as far as the app knows', async () => {
    h.deleteAccount.mockRejectedValue(new Error('RATE_LIMITED'));
    mount();
    typeEmail();
    await press();
    expect(h.reauth).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(strings.en.deleteAccountRateLimited);
  });
});

describe('no sheet on this surface', () => {
  for (const platform of ['web', 'android']) {
    it(`${platform}, Apple-linked: no sheet, no code, the note names where Apple still lists us`, async () => {
      h.platform = platform;
      mount();
      expect(dialog().querySelector('[data-apple-note="web"]')!.textContent).toBe(strings.en.deleteAccountAppleWebNote);
      typeEmail();
      h.deleteAccount.mockResolvedValue({ appleRevocation: 'skipped' });
      flushSync(() => confirmButton().click());
      await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
      expect(h.reauth).not.toHaveBeenCalled();
      expect(h.deleteAccount).toHaveBeenCalledWith(TEST_EMAIL, undefined);
      expect(h.showToast).toHaveBeenCalledWith(strings.en.deleteAccountAppleStillListed, 'info');
    });
  }

  it('iOS, not Apple-linked: no note, no sheet, no toast', async () => {
    h.identities = [{ provider: 'email' }];
    mount();
    expect(dialog().querySelector('[data-apple-note]')).toBeNull();
    expect(text()).not.toMatch(/Apple/);
    typeEmail();
    h.deleteAccount.mockResolvedValue({ appleRevocation: 'not_applicable' });
    flushSync(() => confirmButton().click());
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(h.reauth).not.toHaveBeenCalled();
    expect(h.showToast).not.toHaveBeenCalled();
  });
});

describe('the copy', () => {
  it('exists in all three catalogues, parity kept, no en or em dash (a French hyphen as in "retirez-le" is grammar, not punctuation)', () => {
    const keys = ['deleteAccountAppleReauthNote', 'deleteAccountAppleWebNote', 'deleteAccountAppleCancelled', 'deleteAccountAppleSheetFailed', 'deleteAccountAppleStillListed'] as const;
    for (const lang of ['en', 'fr', 'ar'] as const) {
      for (const k of keys) {
        expect(strings[lang][k], `${lang}.${k}`).toBeTruthy();
        expect(strings[lang][k]).not.toMatch(/[–—]/);
      }
    }
    expect(Object.keys(strings.fr).sort()).toEqual(Object.keys(strings.en).sort());
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort());
  });
});
