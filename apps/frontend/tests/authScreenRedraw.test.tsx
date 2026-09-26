import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The sign-in and sign-up screens, redrawn from zero on 2026-09-26 (board,
// step 5). Through the real screen with only the Supabase client mocked:
// every state a person can see, in the three languages, and the rule the
// Search redraw set for errors: only no response at all may blame the
// connection.
//
// What the older suites hold (the length guard, the catalog-only errors, the
// forgot-password wiring, the recovery routing) is not repeated here; this
// file covers what the redraw added or could have broken.
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
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';
import { MIN_PASSWORD_LENGTH } from '../src/lib/passwordPolicy';
import { REQUEST_TIMEOUT_MS } from '../src/lib/fetchWithTimeout';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang = 'en') {
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
      </LanguageProvider>,
    );
  });
}

const q = (sel: string) => container.querySelector(sel);
const qa = (sel: string) => Array.from(container.querySelectorAll(sel));
const text = () => container.textContent ?? '';
const buttonByText = (label: string) => qa('button').find((b) => b.textContent === label) as HTMLButtonElement | undefined;

function type(id: string, value: string) {
  const input = q(`#${id}`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const submit = () => flushSync(() => q('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
const click = (el: Element) => flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/** The refusal panel: role=alert, its text is the sentence alone. */
const alert = () => q('[role="alert"]')?.textContent ?? null;

const authError = (status: number, code?: string) => ({ name: 'AuthApiError', message: 'server english', status, code });

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
  h.signInWithPassword.mockResolvedValue({ data: { user: {}, session: {} }, error: null });
  h.signUp.mockResolvedValue({ data: {}, error: null });
  h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.restoreAllMocks();
});

describe('what the first screen shows', () => {
  it('the mark, the name, the language switcher, a title, two fields and one button; no feature list', () => {
    mount();
    expect(q('[data-auth-frame] svg[role="presentation"]')).not.toBeNull();
    expect(text()).toContain(strings.en.header);
    expect(qa('[role="group"] button').map((b) => b.textContent)).toEqual(['EN', 'FR', 'AR']);
    expect(q('h1')!.textContent).toBe(strings.en.authSignInTitle);
    expect(qa('input').map((i) => i.id)).toEqual(['email', 'password']);
    expect(qa('button[type="submit"]')).toHaveLength(1);
    // The admin-panel copy the board named is gone from the catalog itself.
    for (const key of ['authKicker', 'authHeadlinePre', 'authFeat1Title', 'authTrust', 'authSecureNote', 'authAccessCta']) {
      expect(strings.en).not.toHaveProperty(key);
    }
    expect(text()).not.toMatch(/intelligence|automation|workspace/i);
  });

  it('the fields carry what a phone keyboard and a password manager need', () => {
    mount();
    const email = q('#email') as HTMLInputElement;
    const password = q('#password') as HTMLInputElement;
    expect(email.type).toBe('email');
    expect(email.getAttribute('inputmode')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(email.getAttribute('autocapitalize')).toBe('none');
    expect(email.getAttribute('enterkeyhint')).toBe('next');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(password.getAttribute('enterkeyhint')).toBe('go');
    // Both are typed left to right whatever the page direction.
    expect(email.getAttribute('dir')).toBe('ltr');
    expect(password.getAttribute('dir')).toBe('ltr');
  });

  it('sign-up asks for a new password, states the rule up front, and the rule is the policy constant', () => {
    mount();
    click(buttonByText(strings.en.authCreateAccountCta)!);
    expect(q('h1')!.textContent).toBe(strings.en.authSignUpTitle);
    expect((q('#password') as HTMLInputElement).getAttribute('autocomplete')).toBe('new-password');
    expect(text()).toContain(strings.en.authPasswordHint);
    for (const lang of LANGS) expect(strings[lang].authPasswordHint).toContain(String(MIN_PASSWORD_LENGTH));
    // The hint is a rule, not an error: nothing is red before anything was typed.
    expect(alert()).toBeNull();
    expect(q('#password')!.getAttribute('aria-invalid')).toBeNull();
  });

  it('show / hide is a word the reader can read, and it toggles the field', () => {
    mount();
    expect((q('#password') as HTMLInputElement).type).toBe('password');
    click(buttonByText(strings.en.authShowPassword)!);
    expect((q('#password') as HTMLInputElement).type).toBe('text');
    click(buttonByText(strings.en.authHidePassword)!);
    expect((q('#password') as HTMLInputElement).type).toBe('password');
  });

  it('the legal line with its two links is on the sign-up form, and not on sign-in', () => {
    mount();
    expect(q('[data-auth-legal]')).toBeNull();
    click(buttonByText(strings.en.authCreateAccountCta)!);
    const legal = q('[data-auth-legal]')!;
    expect(legal.textContent).toContain(strings.en.authLegalNotice);
    expect(qa('[data-auth-legal] a').map((a) => a.getAttribute('href'))).toEqual(['/terms', '/privacy']);
  });
});

describe('the states, and what each one says', () => {
  it('wrong credentials: the catalog sentence, both fields marked, the values kept, the button live again', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError(400, 'invalid_credentials') });
    mount();
    type('email', 'abo.jad@example.com');
    type('password', 'not-the-password');
    submit();
    await vi.waitFor(() => expect(alert()).toBe(strings.en.authGenericError));
    expect(q('#email')!.getAttribute('aria-invalid')).toBe('true');
    expect(q('#password')!.getAttribute('aria-invalid')).toBe('true');
    expect((q('#password') as HTMLInputElement).value).toBe('not-the-password');
    expect((q('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    expect(text()).not.toContain('server english');
  });

  it('too many attempts (429) is named as such, and marks no field', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError(429, 'over_request_rate_limit') });
    mount();
    type('email', 'a@b.co');
    type('password', 'x');
    submit();
    await vi.waitFor(() => expect(alert()).toBe(strings.en.authTooManyAttempts));
    expect(q('#email')!.getAttribute('aria-invalid')).toBeNull();
  });

  it('no response at all (status 0) is the ONE failure that may blame the connection', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError(0) });
    mount();
    type('email', 'a@b.co');
    type('password', 'x');
    submit();
    await vi.waitFor(() => expect(alert()).toBe(strings.en.authNetworkError));
  });

  // The rule from the Search redraw: a status that arrived came over a
  // working connection, and is worded as a server answer.
  for (const status of [500, 502, 503]) {
    it(`a ${status} says something went wrong, never the connection`, async () => {
      h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError(status) });
      mount();
      type('email', 'a@b.co');
      type('password', 'x');
      submit();
      await vi.waitFor(() => expect(alert()).toBe(strings.en.authUnexpectedError));
      expect(alert()).not.toBe(strings.en.authNetworkError);
    });
  }

  it('a request that never answers ends in the timeout copy, not a button that spins forever', async () => {
    vi.useFakeTimers();
    h.signInWithPassword.mockReturnValue(new Promise(() => {}));
    mount();
    type('email', 'a@b.co');
    type('password', 'x');
    submit();
    const button = q('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(strings.en.authSigningIn);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    expect(alert()).toBe(strings.en.requestTimedOut);
    expect(button.disabled).toBe(false);
  });

  it('a sign-up that succeeds replaces the form with "check your inbox", naming the address, with a way back', async () => {
    mount();
    click(buttonByText(strings.en.authCreateAccountCta)!);
    type('email', 'new.user@example.com');
    type('password', 'long-enough-password');
    submit();
    await vi.waitFor(() => expect(q('[data-auth-check-inbox]')).not.toBeNull());
    expect(h.signUp).toHaveBeenCalledWith({ email: 'new.user@example.com', password: 'long-enough-password' });
    expect(q('h1')!.textContent).toBe(strings.en.authCheckInboxTitle);
    expect(text()).toContain('new.user@example.com');
    expect(text()).toContain(strings.en.authCheckInboxBody);
    expect(q('form')).toBeNull();
    click(buttonByText(strings.en.authBackToSignIn)!);
    expect(q('h1')!.textContent).toBe(strings.en.authSignInTitle);
    expect((q('#email') as HTMLInputElement).value).toBe('new.user@example.com');
  });

  it('a sign-up refused for length never leaves the screen, and marks the password only', () => {
    mount();
    click(buttonByText(strings.en.authCreateAccountCta)!);
    type('email', 'a@b.co');
    type('password', 'short');
    submit();
    expect(alert()).toBe(strings.en.passwordTooShort);
    expect(h.signUp).not.toHaveBeenCalled();
    expect(q('#email')!.getAttribute('aria-invalid')).toBeNull();
    expect(q('#password')!.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('in three languages', () => {
  for (const lang of LANGS) {
    it(`${lang}: every visible string is the catalog's, the direction is right, and the digits are Western`, async () => {
      h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: authError(400, 'invalid_credentials') });
      mount(lang);
      const s = strings[lang];
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      expect(q('h1')!.textContent).toBe(s.authSignInTitle);
      expect(text()).toContain(s.authSignInSubtitle);
      expect(text()).toContain(s.authEmailLabel);
      expect(text()).toContain(s.authPasswordLabel);
      expect(buttonByText(s.authForgotPassword)).toBeDefined();
      expect(buttonByText(s.authShowPassword)).toBeDefined();
      expect(buttonByText(s.authCreateAccountCta)).toBeDefined();
      expect((q('button[type="submit"]') as HTMLButtonElement).textContent).toBe(s.authSignInCta);
      type('email', 'a@b.co');
      type('password', 'x');
      submit();
      await vi.waitFor(() => expect(alert()).toBe(s.authGenericError));
      click(buttonByText(s.authCreateAccountCta)!);
      expect(q('h1')!.textContent).toBe(s.authSignUpTitle);
      expect(text()).toContain(s.authPasswordHint);
      expect(text()).not.toMatch(/[٠-٩]/);
    });
  }
});

describe('the reset screen shares the pieces', () => {
  const src = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
  it('sign-in, sign-up and reset are drawn with the same frame, field, button and notice', () => {
    for (const rel of ['screens/AuthScreen.tsx', 'screens/ResetPasswordScreen.tsx']) {
      const code = src(rel);
      for (const piece of ['components/auth/AuthFrame', 'components/ui/TextField', 'components/ui/PrimaryButton', 'components/ui/Notice']) {
        expect(code, `${rel} does not use ${piece}`).toContain(piece);
      }
      // No palette literal left over from the screens they replace.
      expect(code).not.toMatch(/\b(?:bg|text|border)-slate-\d{2,3}\b/);
      expect(code).not.toMatch(/rounded-\[40px\]/);
    }
  });
});
