import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// SIGNUP PASSWORD LENGTH — and the sign-in path it must never touch.
// ============================================================================
// The defect: ResetPasswordScreen has always rejected passwords under
// MIN_PASSWORD_LENGTH (8), while AuthScreen's signup branch had no length check
// of any kind. Supabase's project minimum was 6 at the time, so production
// accepted a 6-character signup and then refused that same password at reset
// time. One app, two policies.
//
// The dashboard minimum was raised to 8 on 2026-08-02 and the signup endpoint
// was observed rejecting six characters with weak_password. That closes the
// gap for NEW passwords and changes nothing below: accounts created before the
// raise still hold 6- and 7-character passwords, so the login assertions in
// section 2 are exactly as load-bearing as they were.
//
// THE DANGEROUS HALF OF THIS FIX IS NOT THE CHECK — IT IS ITS SCOPE.
// Accounts created before this commit exist RIGHT NOW with 6- and 7-character
// passwords. A length guard that runs on the LOGIN branch would refuse to even
// attempt sign-in for every one of those users: an instant, total lockout of
// real accounts, produced by deleting two characters (`!isLogin &&`) from a
// condition. So the login assertions below are not symmetry for its own sake.
// They are the outage test, and they are the reason this file exists:
//
//   - signup under 8  -> rejected locally, signUp() never called
//   - signup exactly 8 -> allowed through (the boundary, not just "long enough")
//   - login under 8   -> signInWithPassword() IS called, no local rejection
//   - login at 1 char -> still called; there is no floor on the login path
//
// The copy is asserted as the CATALOG VALUE in all three locales, never as an
// English literal: the message a French or Arabic user sees on this pre-login
// screen must come from the catalog, like every other string on it.
// ============================================================================

const h = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: h.signInWithPassword,
      signUp: h.signUp,
      resetPasswordForEmail: h.resetPasswordForEmail,
    },
  },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';
import {
  MIN_PASSWORD_LENGTH,
  PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH,
  SHORTEST_EXISTING_PASSWORD_LENGTH,
} from '../src/lib/passwordPolicy';

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];

let container: HTMLDivElement;
let root: Root;

function mount(lang: Locale = 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/login']}>
            <AuthScreen />
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function typeInto(id: string, value: string) {
  const input = container.querySelector(`#${id}`) as HTMLInputElement;
  expect(input, `#${id} did not render`).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Flip the card into signup mode via the real toggle, in the active locale. */
function switchToSignup(lang: Locale = 'en') {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === strings[lang].authCreateAccountCta
  );
  expect(btn, 'the create-account toggle did not render').toBeTruthy();
  flushSync(() => btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function submit() {
  const form = container.querySelector('form');
  expect(form, 'the auth form did not render').toBeTruthy();
  flushSync(() => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

/** The error box, found by its style hook — the screen renders no role="alert". */
const errorBox = () =>
  [...container.querySelectorAll('div')].find((d) => d.className.includes('bg-rose-50'))?.textContent?.trim() ??
  null;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.signUp.mockResolvedValue({ data: {}, error: null });
  h.signInWithPassword.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
});

// ────────────────────────────────────────────────────────────────────────────
// 1. SIGNUP — the check itself, at the boundary.
// ────────────────────────────────────────────────────────────────────────────
describe('signup rejects a password under MIN_PASSWORD_LENGTH', () => {
  it('a 7-character password never reaches Supabase', () => {
    mount('en');
    switchToSignup('en');
    typeInto('email', 'new-user@example.com');
    typeInto('password', '1234567');
    submit();

    expect(h.signUp, 'a too-short password was sent to Supabase anyway').not.toHaveBeenCalled();
    expect(errorBox()).toBe(strings.en.passwordTooShort);
  });

  it('rejects every length from 1 to MIN_PASSWORD_LENGTH - 1, and none of them call signUp', () => {
    for (let len = 1; len < MIN_PASSWORD_LENGTH; len++) {
      mount('en');
      switchToSignup('en');
      typeInto('email', 'new-user@example.com');
      typeInto('password', 'x'.repeat(len));
      submit();

      expect(h.signUp, `length ${len} was accepted`).not.toHaveBeenCalled();
      expect(errorBox(), `length ${len} showed no error`).toBe(strings.en.passwordTooShort);

      root.unmount();
      container.remove();
      vi.clearAllMocks();
    }
    // Leave one mounted for the shared afterEach.
    mount('en');
  });

  // The boundary, in both directions. An off-by-one (`<=` for `<`) rejects a
  // password the catalog explicitly promises is long enough, in three languages.
  it('accepts EXACTLY MIN_PASSWORD_LENGTH and calls signUp with it', () => {
    mount('en');
    switchToSignup('en');
    typeInto('email', 'new-user@example.com');
    typeInto('password', 'x'.repeat(MIN_PASSWORD_LENGTH));
    submit();

    expect(h.signUp, 'the exact minimum was rejected').toHaveBeenCalledTimes(1);
    expect(h.signUp).toHaveBeenCalledWith({
      email: 'new-user@example.com',
      password: 'x'.repeat(MIN_PASSWORD_LENGTH),
    });
    expect(errorBox(), 'the exact minimum produced an error').toBeNull();
  });

  it('the rejection is the CATALOG string in every locale, with no English leak', () => {
    for (const lang of LOCALES) {
      mount(lang);
      switchToSignup(lang);
      typeInto('email', 'new-user@example.com');
      typeInto('password', 'short');
      submit();

      expect(errorBox(), `${lang} did not render the catalog string`).toBe(strings[lang].passwordTooShort);
      if (lang !== 'en') {
        expect(errorBox(), `${lang} leaked the English sentence`).not.toBe(strings.en.passwordTooShort);
      }
      expect(h.signUp).not.toHaveBeenCalled();

      root.unmount();
      container.remove();
      vi.clearAllMocks();
    }
    mount('en');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. SIGN-IN — the outage test. This is the half that can hurt real users.
// ────────────────────────────────────────────────────────────────────────────
describe('login is NEVER gated on length (existing short passwords still work)', () => {
  it('a 6-character existing password still reaches signInWithPassword', () => {
    // 6 is not hypothetical: accounts created before the 2026-08-02 dashboard
    // raise hold passwords this short, and one was signed in successfully after
    // the raise to confirm it (lib/passwordPolicy.ts).
    //
    // VACUITY GUARD — this must come first and must never be deleted. This test
    // only proves anything if the password it types would be REJECTED on the
    // signup branch. Let SHORTEST_EXISTING_PASSWORD_LENGTH drift up to match the
    // platform minimum and the line below types 8 characters, which the signup
    // guard accepts anyway: every assertion in this test would still pass while
    // proving nothing, and the sole guard against locking every legacy user out
    // of their own account would be gone with a green suite. Fail loudly here
    // instead, at the site of the harm.
    expect(
      SHORTEST_EXISTING_PASSWORD_LENGTH,
      'SHORTEST_EXISTING_PASSWORD_LENGTH is no longer below MIN_PASSWORD_LENGTH, so this test ' +
        'types a password the signup guard would accept and proves NOTHING about the login path. ' +
        'It is frozen history (accounts predating the 2026-08-02 raise), not a copy of the ' +
        'platform minimum — restore it to 6 rather than making this assertion pass.'
    ).toBeLessThan(MIN_PASSWORD_LENGTH);

    mount('en');
    typeInto('email', 'existing-user@example.com');
    typeInto('password', 'x'.repeat(SHORTEST_EXISTING_PASSWORD_LENGTH));
    submit();

    expect(
      h.signInWithPassword,
      'an existing user with a 6-character password was locked out of their own account'
    ).toHaveBeenCalledTimes(1);
    expect(h.signInWithPassword).toHaveBeenCalledWith({
      email: 'existing-user@example.com',
      password: 'x'.repeat(SHORTEST_EXISTING_PASSWORD_LENGTH),
    });
    expect(errorBox(), 'the login path rejected a short password locally').toBeNull();
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('every length from 1 to MIN_PASSWORD_LENGTH - 1 still attempts sign-in', () => {
    for (let len = 1; len < MIN_PASSWORD_LENGTH; len++) {
      mount('en');
      typeInto('email', 'existing-user@example.com');
      typeInto('password', 'x'.repeat(len));
      submit();

      expect(h.signInWithPassword, `login with length ${len} was blocked locally`).toHaveBeenCalledTimes(1);
      expect(errorBox(), `login with length ${len} showed a local error`).toBeNull();

      root.unmount();
      container.remove();
      vi.clearAllMocks();
    }
    mount('en');
  });

  it('the login path shows no length error in any locale', () => {
    for (const lang of LOCALES) {
      mount(lang);
      typeInto('email', 'existing-user@example.com');
      typeInto('password', 'short');
      submit();

      expect(errorBox(), `${lang} login rejected a short password locally`).not.toBe(
        strings[lang].passwordTooShort
      );
      expect(h.signInWithPassword).toHaveBeenCalledTimes(1);

      root.unmount();
      container.remove();
      vi.clearAllMocks();
    }
    mount('en');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. ONE NUMBER, BOTH SCREENS — the drift this fix exists to prevent.
// ────────────────────────────────────────────────────────────────────────────
describe('the policy module is the single source of the number', () => {
  it('MIN_PASSWORD_LENGTH is 8 and is stated by the shared catalog key in all three locales', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    for (const lang of LOCALES) {
      expect(strings[lang].passwordTooShort, `${lang} no longer states the minimum`).toContain(
        String(MIN_PASSWORD_LENGTH)
      );
    }
  });

  // A tripwire, not a fact about the code. It fired once already: it was 6
  // until the dashboard was raised on 2026-08-02, and it is the reason that
  // change could not land quietly. It is worth more now than it was then,
  // because an OVERSTATEMENT here fails unsafe — a future reader who believes
  // production enforces a number it does not will conclude AuthScreen's check
  // is redundant and delete it. The note in src/lib/passwordPolicy.ts argues
  // against that deletion explicitly; keep the two in step.
  it('records the OBSERVED platform minimum (re-run the signup curl when the dashboard moves)', () => {
    expect(
      PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH,
      'If the Supabase dashboard minimum changed, update PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH ' +
        'and the note above it in src/lib/passwordPolicy.ts — the repository must not claim a ' +
        'number production does not enforce, in either direction. Do not update it from the ' +
        'settings page alone: the note carries a curl against /auth/v1/signup that OBSERVES the ' +
        'number, and a field reading is not an observation.'
    ).toBe(8);
    expect(
      PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH,
      'our screens must never ask for less than the platform already enforces'
    ).toBeLessThanOrEqual(MIN_PASSWORD_LENGTH);
  });

  // The second half of the same tripwire, and the one that protects users
  // rather than the record. SHORTEST_EXISTING_PASSWORD_LENGTH is frozen
  // history; the platform minimum is live configuration. They were both 6
  // until 2026-08-02 and merging them again would hollow out the sign-in
  // tests above — see the vacuity guard in section 2.
  it('keeps frozen history separate from live configuration', () => {
    expect(
      SHORTEST_EXISTING_PASSWORD_LENGTH,
      'SHORTEST_EXISTING_PASSWORD_LENGTH records the shortest password a REAL ACCOUNT holds ' +
        '(6, from before the 2026-08-02 raise). It is not a second name for the platform ' +
        'minimum and must not be raised to track it: the sign-in tests above would go vacuous ' +
        'and still pass. It moves only after every pre-2026-08-02 account is force-reset.'
    ).toBe(6);
    expect(
      SHORTEST_EXISTING_PASSWORD_LENGTH,
      'the login path must stay exercised with a password our own signup guard would reject'
    ).toBeLessThan(MIN_PASSWORD_LENGTH);
  });
});
