import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// DELETE-ACCOUNT MODAL — the "LOCKED WHILE DELETING" contract.
// ============================================================================
// Account deletion is IRREVERSIBLE. Once the request is in flight the modal must
// not be dismissable, because dismissing it does NOT cancel the server-side
// delete — it just hides the operation from the user and leaves them staring at
// a settings screen while their account is destroyed underneath them.
//
// That safety property is expressed in FOUR independent places, each of which
// looks like removable noise on its own:
//
//   1. DeleteAccountModal.tsx:27   useBackDismiss(isOpen && !isDeleting, ...)
//                                  -> Android hardware back is UNREGISTERED
//   2. DeleteAccountModal.tsx:58   onClick={isDeleting ? undefined : onClose}
//                                  -> scrim click-to-close is DISABLED
//   3. DeleteAccountModal.tsx:76   {!isDeleting && ( ... )}
//                                  -> the close (X) button is UNMOUNTED
//   4. DeleteAccountModal.tsx:127  disabled={!canDelete || isDeleting}
//                                  -> the confirm button cannot double-fire
//
// Before this file, NONE of them had a test. accountErrorI18n.test.tsx (PR #96)
// is the only other suite touching this modal and it drives the FAILURE path
// exclusively — by the time it asserts, :51 has already set isDeleting back to
// false, so it can never observe this contract.
//
// The `&& !isDeleting` at :27 is the one most likely to be lost: a future shared
// modal shell (D8b PR 3+) that owns useBackDismiss would naturally flatten it to
// a bare `useBackDismiss(isOpen, onClose)` and silently delete guard #1.
//
// NOTE: useBackDismiss is deliberately NOT mocked here. We drive the REAL
// overlay stack (src/native/overlayStack.ts) so guard #1 is tested through the
// actual Android back-button mechanism rather than a stub.
// ============================================================================

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const TEST_EMAIL = 'delete-safety@example.com';
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
import { closeTopOverlay } from '../src/native/overlayStack';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn>;
let onDeleted: ReturnType<typeof vi.fn>;

function mount(lang: 'en' | 'fr' | 'ar' = 'en') {
  localStorage.setItem('lang', lang);
  onClose = vi.fn();
  onDeleted = vi.fn();
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

const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
/** The scrim is the dialog's parent — stable across any restyle of the classes. */
const scrim = () => dialog().parentElement as HTMLElement;

/** Satisfy canDelete (DeleteAccountModal.tsx:35) by typing the user's own email. */
function typeEmail(value = TEST_EMAIL) {
  const input = document.body.querySelector('#delete-confirm') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

const buttonsInDialog = () => [...dialog().querySelectorAll('button')] as HTMLButtonElement[];
const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/**
 * Put the modal into the in-flight state and KEEP it there: deleteAccount
 * returns a promise that never settles, so isDeleting stays true for the whole
 * assertion window. This is the state accountErrorI18n.test.tsx can never reach.
 */
function beginDeleteAndHang() {
  (accountService.deleteAccount as any).mockImplementation(() => new Promise<void>(() => {}));
  typeEmail();
  const confirm = buttonsInDialog().find((b) => !b.disabled && b.textContent?.trim() === strings.en.deleteAccountConfirmButton);
  expect(confirm, 'confirm button should be enabled once the email matches').toBeTruthy();
  click(confirm!);
}

describe('DeleteAccountModal — cannot be dismissed while the delete is in flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Drain any stray overlay registrations so each test starts from an empty stack.
    while (closeTopOverlay()) { /* noop */ }
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    while (closeTopOverlay()) { /* noop */ }
  });

  // ── Positive controls: every path DOES work while idle. Without these, the
  //    four guard tests below would pass on a modal that is simply inert.
  it('CONTROL (idle): the Android back button closes the modal', () => {
    mount();
    expect(closeTopOverlay()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('CONTROL (idle): clicking the scrim closes the modal', () => {
    mount();
    click(scrim());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('CONTROL (idle): the close (X) button is present and closes the modal', () => {
    mount();
    const x = dialog().querySelector(`button[aria-label="${strings.en.deleteAccountCancel}"]`);
    expect(x, 'the X button should exist while idle').toBeTruthy();
    click(x!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── GUARD 1 — DeleteAccountModal.tsx:27
  it('GUARD 1 (:27): the Android back button is UNREGISTERED while deleting', () => {
    mount();
    beginDeleteAndHang();

    // The overlay stack must hold no registration for this modal: back should
    // find nothing to close and fall through to normal navigation.
    expect(closeTopOverlay()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── GUARD 2 — DeleteAccountModal.tsx:58
  it('GUARD 2 (:58): clicking the scrim does NOT close while deleting', () => {
    mount();
    beginDeleteAndHang();

    click(scrim());
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── GUARD 3 — DeleteAccountModal.tsx:76
  it('GUARD 3 (:76): the close (X) button is UNMOUNTED while deleting', () => {
    mount();
    beginDeleteAndHang();

    expect(dialog().querySelector(`button[aria-label="${strings.en.deleteAccountCancel}"]`)).toBeNull();
  });

  // ── GUARD 4 — DeleteAccountModal.tsx:127 (+ 3 again, from the other side)
  it('GUARD 4 (:127): the confirm button is DISABLED while deleting, and is the only button left', () => {
    mount();
    beginDeleteAndHang();

    // While deleting, both the X (:76) and the footer cancel (:132) are gone, so
    // exactly one button remains — the confirm button, disabled.
    const btns = buttonsInDialog();
    expect(btns).toHaveLength(1);
    expect(btns[0].disabled).toBe(true);
    expect(btns[0].textContent?.trim()).toBe(strings.en.deleteAccountDeleting);
  });

  it('the delete cannot be double-fired by clicking the confirm button again', () => {
    mount();
    beginDeleteAndHang();
    expect(accountService.deleteAccount).toHaveBeenCalledTimes(1);

    click(buttonsInDialog()[0]);
    expect(accountService.deleteAccount).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteAccountModal — type-to-confirm gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    while (closeTopOverlay()) { /* noop */ }
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    while (closeTopOverlay()) { /* noop */ }
  });

  const confirmBtn = () =>
    buttonsInDialog().find((b) => b.textContent?.trim() === strings.en.deleteAccountConfirmButton)!;

  it('the confirm button is disabled until the typed email matches', () => {
    mount();
    expect(confirmBtn().disabled).toBe(true);

    typeEmail('someone-else@example.com');
    expect(confirmBtn().disabled).toBe(true);

    typeEmail();
    expect(confirmBtn().disabled).toBe(false);
  });

  it('the match is case-insensitive and whitespace-tolerant (:35)', () => {
    mount();
    typeEmail(`  ${TEST_EMAIL.toUpperCase()}  `);
    expect(confirmBtn().disabled).toBe(false);
  });

  it('a non-matching email cannot fire the delete', () => {
    mount();
    typeEmail('someone-else@example.com');
    click(confirmBtn());
    expect(accountService.deleteAccount).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountModal — accessibility and direction invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    while (closeTopOverlay()) { /* noop */ }
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    while (closeTopOverlay()) { /* noop */ }
  });

  it('the dialog exposes role/aria-modal/aria-label', () => {
    mount();
    const d = dialog();
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe(strings.en.deleteAccountWarningTitle);
  });

  it('the email input keeps dir="ltr" even in Arabic — an email is LTR in every locale', () => {
    mount('ar');
    const input = document.body.querySelector('#delete-confirm') as HTMLInputElement;
    expect(input.getAttribute('dir')).toBe('ltr');
  });

  it('the label is wired to the input (htmlFor/id)', () => {
    mount();
    const label = document.body.querySelector('label[for="delete-confirm"]');
    expect(label).toBeTruthy();
    expect(document.body.querySelector('#delete-confirm')).toBeTruthy();
  });

  it('every interactive control keeps a >=44px touch target', () => {
    mount();
    for (const b of buttonsInDialog()) {
      expect(b.className, `button "${b.textContent?.trim() || b.getAttribute('aria-label')}"`).toMatch(/min-h-\[44px\]/);
    }
  });
});
