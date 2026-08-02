import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// AUTH ERRORS — no raw Supabase English ever reaches a user, in any locale.
// ============================================================================
// This one was SEEN, not inferred. During the audit #8 acceptance test on
// PRODUCTION, AuthScreen rendered Supabase's own English "Invalid login
// credentials" on the login card. The screen is pre-login, so every user on
// every surface passes through it; an Arabic or French user got that same
// English sentence.
//
// AuthScreen now routes through lib/serverErrors.ts, which is a WHITELIST with
// a translated tail and cannot return its input. These tests pin that.
//
// The centrepiece is the negative control: hand the helper Supabase's English
// VERBATIM — the exact bytes Abo Jad saw — and translated copy must come back
// in all three locales.
//
// The second-most valuable assertion is the authGenericError guard. That string
// reads "Invalid email or password": correct for invalid_credentials, and a
// LIE for anything else. If a 500, a ban or a timeout ever routes into it the
// app tells a user their password is wrong when it is not, which is a worse
// failure than the English leak this PR removes. The generic tail must stay
// authUnexpectedError, which claims nothing.
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
import { translateAuthError } from '../src/lib/serverErrors';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];

/** The five keys this PR adds. authGenericError is REUSED, not new. */
const NEW_KEYS = [
  'authEmailNotConfirmed',
  'authWeakPassword',
  'authTooManyAttempts',
  'authNetworkError',
  'authUnexpectedError',
] as const;

/**
 * Minimal stand-in for @supabase/auth-js's AuthApiError.
 *
 * Deliberately a hand-built object rather than the real class: the helper reads
 * `code` and `status` defensively off an unknown value, and this proves it does
 * not depend on instanceof or on any auth-js import.
 */
const authError = (message: string, status?: number, code?: string) =>
  Object.assign(new Error(message), { status, code, name: 'AuthApiError' });

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);

// ────────────────────────────────────────────────────────────────────────────
// 1. The mapping.
// ────────────────────────────────────────────────────────────────────────────
describe('translateAuthError — the mapping', () => {
  it('invalid_credentials reuses the EXISTING authGenericError in every locale', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      expect(translateAuthError(authError('Invalid login credentials', 400, 'invalid_credentials'), s)).toBe(
        s.authGenericError
      );
    }
  });

  it('maps each actionable code to its own key in every locale', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      expect(translateAuthError(authError('Email not confirmed', 400, 'email_not_confirmed'), s)).toBe(
        s.authEmailNotConfirmed
      );
      expect(translateAuthError(authError('Password is too weak', 422, 'weak_password'), s)).toBe(s.authWeakPassword);
      expect(translateAuthError(authError('Request rate limit reached', 429, 'over_request_rate_limit'), s)).toBe(
        s.authTooManyAttempts
      );
      expect(translateAuthError(authError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'), s)).toBe(
        s.authTooManyAttempts
      );
    }
  });

  it('is tolerant of casing and whitespace drift in the code', () => {
    const s = strings.en;
    expect(translateAuthError(authError('x', 400, '  INVALID_CREDENTIALS  '), s)).toBe(s.authGenericError);
    expect(translateAuthError(authError('x', 400, 'Email_Not_Confirmed'), s)).toBe(s.authEmailNotConfirmed);
  });

  it('routes the NOT-ACTIONABLE bucket to authUnexpectedError, never to authGenericError', () => {
    // There is nothing the user can do about any of these, so they collapse.
    // What they must NOT do is claim the password was wrong.
    const notActionable = [
      'user_banned',
      'unexpected_failure',
      'request_timeout',
      'validation_failed',
      'signup_disabled',
      'email_provider_disabled',
      'bad_json',
      'conflict',
    ];
    for (const lang of LOCALES) {
      const s = strings[lang];
      for (const code of notActionable) {
        const out = translateAuthError(authError('some server prose', 500, code), s);
        expect(out, `${lang}/${code} must be the true generic`).toBe(s.authUnexpectedError);
        expect(out, `${lang}/${code} wrongly claims the password is invalid`).not.toBe(s.authGenericError);
      }
    }
  });

  it('gives user_already_exists / email_exists NO key of their own (enumeration oracle)', () => {
    // A distinct "that email is already registered" would turn the signup form
    // into an account-enumeration oracle — the same leak handleForgotPassword
    // already refuses to open. They must fall to the generic.
    for (const lang of LOCALES) {
      const s = strings[lang];
      for (const code of ['user_already_exists', 'email_exists']) {
        expect(translateAuthError(authError('User already registered', 422, code), s)).toBe(s.authUnexpectedError);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Network vs server outage.
// ────────────────────────────────────────────────────────────────────────────
describe('translateAuthError — status 0 is the ONLY network signal', () => {
  // auth-js sets status 0 in exactly two places (lib/fetch.js:20 and :106),
  // both meaning NO response was obtained. 502/503/504 also arrive as
  // AuthRetryableFetchError but carry their real status: those are SERVER
  // outages, and telling a user with a working connection to check their
  // internet would be wrong.
  it('status 0 (fetch rejected, no response) is the network case', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      const offline = Object.assign(new Error('Failed to fetch'), {
        status: 0,
        code: undefined,
        name: 'AuthRetryableFetchError',
      });
      expect(translateAuthError(offline, s)).toBe(s.authNetworkError);
    }
  });

  it('502/503/504 are SERVER outages, not network errors', () => {
    const s = strings.en;
    for (const status of [502, 503, 504]) {
      const outage = Object.assign(new Error('Service unavailable'), {
        status,
        code: undefined,
        name: 'AuthRetryableFetchError',
      });
      expect(translateAuthError(outage, s), `status ${status} must not blame the connection`).toBe(
        s.authUnexpectedError
      );
      expect(translateAuthError(outage, s)).not.toBe(s.authNetworkError);
    }
  });

  it('a bare 429 with no code still says "too many attempts"', () => {
    const s = strings.en;
    expect(translateAuthError(Object.assign(new Error('rate limited'), { status: 429 }), s)).toBe(
      s.authTooManyAttempts
    );
  });

  it('an undefined code alone is NOT treated as a network failure', () => {
    // Every CustomAuthError subclass (AuthSessionMissingError, ...) has
    // code === undefined. Only status 0 means the request never landed.
    const s = strings.en;
    const sessionMissing = Object.assign(new Error('Auth session missing!'), {
      status: 400,
      code: undefined,
      name: 'AuthSessionMissingError',
    });
    expect(translateAuthError(sessionMissing, s)).toBe(s.authUnexpectedError);
    expect(translateAuthError(sessionMissing, s)).not.toBe(s.authNetworkError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. NEGATIVE CONTROL — the load-bearing property.
// ────────────────────────────────────────────────────────────────────────────
describe('translateAuthError — never returns its input', () => {
  /** The exact bytes Abo Jad saw on the production login card. */
  const SEEN_ON_PRODUCTION = 'Invalid login credentials';

  it('hands back TRANSLATED copy when given Supabase English VERBATIM, in all three locales', () => {
    for (const lang of LOCALES) {
      const s = strings[lang];
      // As the error's message, with no code to key on: the shape that leaked.
      const asMessage = translateAuthError(new Error(SEEN_ON_PRODUCTION), s);
      expect(asMessage, `${lang}: the message leaked through`).toBe(s.authUnexpectedError);
      expect(asMessage).not.toContain(SEEN_ON_PRODUCTION);
      expect(asMessage).not.toContain('Invalid login');

      // As a bare string handed straight to the helper.
      const asString = translateAuthError(SEEN_ON_PRODUCTION, s);
      expect(asString, `${lang}: the raw string leaked through`).toBe(s.authUnexpectedError);
      expect(asString).not.toContain(SEEN_ON_PRODUCTION);
    }
  });

  it('hands back TRANSLATED copy for arbitrary English prose in no table at all', () => {
    const prose = [
      'Unable to validate email address: invalid format',
      'Database error saving new user',
      'For security purposes, you can only request this after 51 seconds.',
      'Signups not allowed for this instance',
      'To signup, please provide your email',
    ];
    for (const lang of LOCALES) {
      const s = strings[lang];
      for (const p of prose) {
        const out = translateAuthError(new Error(p), s);
        expect(out, `${lang}: "${p}" leaked`).toBe(s.authUnexpectedError);
        expect(out).not.toContain(p);
      }
    }
  });

  it('returns a CATALOG value for every hostile input shape, never the input', () => {
    const catalogValues = new Set(Object.values(strings.en));
    const hostile: unknown[] = [
      null,
      undefined,
      '',
      'LEAK_ME',
      42,
      true,
      [],
      {},
      { code: 'LEAK_ME' },
      { code: 'LEAK_ME', status: 999 },
      { code: null, status: null },
      { code: 123, status: '429' },
      new Error('LEAK_ME'),
      Object.assign(new Error('LEAK_ME'), { code: 'LEAK_ME', status: 400 }),
      Object.create(null),
    ];
    // Label defensively: Object.create(null) has no toString, so String(input)
    // would throw inside the assertion message rather than in the helper.
    const label = (v: unknown) => {
      try {
        return JSON.stringify(v) ?? Object.prototype.toString.call(v);
      } catch {
        return Object.prototype.toString.call(v);
      }
    };
    for (const [i, input] of hostile.entries()) {
      const out = translateAuthError(input, strings.en);
      expect(catalogValues.has(out), `hostile[${i}] ${label(input)} returned a non-catalog value`).toBe(true);
      expect(out).not.toContain('LEAK_ME');
    }
  });

  it('falls back rather than returning an empty or missing catalog entry', () => {
    // A locale gap must not render blank: the value guard catches it.
    const gapped = { ...strings.en, authEmailNotConfirmed: '' } as Record<string, string>;
    expect(translateAuthError(authError('x', 400, 'email_not_confirmed'), gapped)).toBe(gapped.authUnexpectedError);
  });

  it('a code that happens to name a catalog key cannot echo that key back', () => {
    // The input is a lookup key into the WHITELIST, never into the catalog.
    const s = strings.en;
    expect(translateAuthError(authError('x', 400, 'authGenericError'), s)).toBe(s.authUnexpectedError);
    expect(translateAuthError(authError('x', 400, 'header'), s)).toBe(s.authUnexpectedError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. THE RENDER — the half a unit test cannot see.
// ────────────────────────────────────────────────────────────────────────────
// A catalog assertion is blind to a call site that never reads the catalog.
// This mounts the REAL AuthScreen and drives a REAL failed sign-in.
let container: HTMLDivElement;
let root: Root;

function mount(lang: Locale) {
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

/** Set a controlled React input's value the way a real keystroke would. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The rose error panel (AuthScreen.tsx:278-283). Its only text is the message. */
const errorPanelText = () => container.querySelector('.bg-rose-50')?.textContent?.trim() ?? null;

/** Drive one failing sign-in to completion. */
async function failSignInWith(error: unknown) {
  h.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error });
  const email = container.querySelector('#email') as HTMLInputElement;
  const password = container.querySelector('#password') as HTMLInputElement;
  flushSync(() => type(email, 'abo.jad@example.com'));
  flushSync(() => type(password, 'whatever-was-typed'));
  const form = container.querySelector('form') as HTMLFormElement;
  flushSync(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await vi.waitFor(() => expect(errorPanelText()).toBeTruthy());
}

describe('AuthScreen render — the production leak, closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('AR: a failed sign-in shows the Arabic string EXACTLY, never the English', async () => {
    mount('ar');
    await failSignInWith(authError('Invalid login credentials', 400, 'invalid_credentials'));

    expect(errorPanelText()).toBe(strings.ar.authGenericError);
    expect(container.textContent).not.toContain('Invalid login credentials');
    expect(container.textContent).not.toContain('Invalid login');
  });

  it('FR: a failed sign-in shows the French string EXACTLY, never the English', async () => {
    mount('fr');
    await failSignInWith(authError('Invalid login credentials', 400, 'invalid_credentials'));

    expect(errorPanelText()).toBe(strings.fr.authGenericError);
    expect(container.textContent).not.toContain('Invalid login credentials');
  });

  it('AR: an unconfirmed email shows its OWN Arabic string, not the credentials claim', async () => {
    mount('ar');
    await failSignInWith(authError('Email not confirmed', 400, 'email_not_confirmed'));

    expect(errorPanelText()).toBe(strings.ar.authEmailNotConfirmed);
    expect(errorPanelText()).not.toBe(strings.ar.authGenericError);
    expect(container.textContent).not.toContain('Email not confirmed');
  });

  it('AR: a server 500 does NOT tell the user their password is wrong', async () => {
    // The regression this PR is most likely to acquire later.
    mount('ar');
    await failSignInWith(authError('Internal Server Error', 500, 'unexpected_failure'));

    expect(errorPanelText()).toBe(strings.ar.authUnexpectedError);
    expect(errorPanelText()).not.toBe(strings.ar.authGenericError);
    expect(container.textContent).not.toContain('Internal Server Error');
  });

  it('AR: a failed SIGNUP is localized too (same sink, other branch)', async () => {
    mount('ar');
    h.signUp.mockResolvedValue({
      data: { user: null, session: null },
      // The exact sentence production returned on 2026-08-02 for a six-character
      // signup, transcribed from the live 422 rather than invented.
      error: authError('Password should be at least 8 characters.', 422, 'weak_password'),
    });
    // Flip to the signup branch via its catalog CTA, not English text.
    const toggle = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === strings.ar.authCreateAccountCta
    ) as HTMLButtonElement;
    flushSync(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const email = container.querySelector('#email') as HTMLInputElement;
    const password = container.querySelector('#password') as HTMLInputElement;
    flushSync(() => type(email, 'new.user@example.com'));
    // Long enough to clear AuthScreen's own MIN_PASSWORD_LENGTH guard. This
    // test is about the SINK — that a server-side signup failure is localized —
    // so it must actually reach signUp(). It used to type 'abc', which the
    // local check now rejects before any network call, and the assertion below
    // would then be comparing against the wrong string entirely.
    //
    // Note what this implies: weak_password is not reachable by LENGTH from our
    // own signup form. That was true when the Supabase minimum was 6 (ours was
    // higher) and it stays true now the 2026-08-02 raise has made it 8 (ours is
    // equal, so anything our guard passes, the endpoint accepts). The reason
    // changed; the conclusion did not.
    //
    // The mapping stays as defence in depth, and the case for it got STRONGER,
    // not weaker: the minimum moved through a web UI with no commit, and it can
    // move again — including back down — between one request and the next. It
    // also still covers the paths this form is not: updateUser and recovery.
    flushSync(() => type(password, 'a-long-enough-password'));
    const form = container.querySelector('form') as HTMLFormElement;
    flushSync(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    await vi.waitFor(() => expect(errorPanelText()).toBeTruthy());
    expect(errorPanelText()).toBe(strings.ar.authWeakPassword);
    expect(container.textContent).not.toContain('Password should be at least');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. THE CATALOG — code-point exact (never trust the terminal).
// ────────────────────────────────────────────────────────────────────────────
// #122 discipline: the terminal renders Arabic right-to-left and will happily
// display a wrong letter, a smuggled bidi control or a silent English fallback
// as something that LOOKS correct. Glyphs are never the contract. These arrays
// are — they are what Abo Jad approves, as numbers.
const AR_EXPECTED: Record<string, number[]> = {
  // "أكّد بريدك الإلكتروني أولاً. تحقق من بريدك للحصول على رابط التأكيد."
  // SHADDA 1617 in أكّد · FATHATAN 1611 in أولاً
  authEmailNotConfirmed: [
    1571, 1603, 1617, 1583, 32, 1576, 1585, 1610, 1583, 1603, 32, 1575, 1604, 1573, 1604, 1603, 1578, 1585, 1608,
    1606, 1610, 32, 1571, 1608, 1604, 1575, 1611, 46, 32, 1578, 1581, 1602, 1602, 32, 1605, 1606, 32, 1576, 1585,
    1610, 1583, 1603, 32, 1604, 1604, 1581, 1589, 1608, 1604, 32, 1593, 1604, 1609, 32, 1585, 1575, 1576, 1591, 32,
    1575, 1604, 1578, 1571, 1603, 1610, 1583, 46,
  ],
  // "كلمة المرور ضعيفة جدًا. اختر كلمة مرور أطول."  FATHATAN 1611 in جدًا
  authWeakPassword: [
    1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1590, 1593, 1610, 1601, 1577, 32, 1580,
    1583, 1611, 1575, 46, 32, 1575, 1582, 1578, 1585, 32, 1603, 1604, 1605, 1577, 32, 1605, 1585, 1608, 1585, 32,
    1571, 1591, 1608, 1604, 46,
  ],
  // "محاولات كثيرة جدًا. انتظر قليلاً قبل المحاولة مرة أخرى."
  authTooManyAttempts: [
    1605, 1581, 1575, 1608, 1604, 1575, 1578, 32, 1603, 1579, 1610, 1585, 1577, 32, 1580, 1583, 1611, 1575, 46, 32,
    1575, 1606, 1578, 1592, 1585, 32, 1602, 1604, 1610, 1604, 1575, 1611, 32, 1602, 1576, 1604, 32, 1575, 1604,
    1605, 1581, 1575, 1608, 1604, 1577, 32, 1605, 1585, 1577, 32, 1571, 1582, 1585, 1609, 46,
  ],
  // "لا يوجد اتصال. تحقق من الإنترنت وأعد المحاولة."
  authNetworkError: [
    1604, 1575, 32, 1610, 1608, 1580, 1583, 32, 1575, 1578, 1589, 1575, 1604, 46, 32, 1578, 1581, 1602, 1602, 32,
    1605, 1606, 32, 1575, 1604, 1573, 1606, 1578, 1585, 1606, 1578, 32, 1608, 1571, 1593, 1583, 32, 1575, 1604,
    1605, 1581, 1575, 1608, 1604, 1577, 46,
  ],
  // "حدث خطأ ما. يرجى المحاولة مرة أخرى."
  authUnexpectedError: [
    1581, 1583, 1579, 32, 1582, 1591, 1571, 32, 1605, 1575, 46, 32, 1610, 1585, 1580, 1609, 32, 1575, 1604, 1605,
    1581, 1575, 1608, 1604, 1577, 32, 1605, 1585, 1577, 32, 1571, 1582, 1585, 1609, 46,
  ],
};

describe('AR auth-error catalog — code-point exact', () => {
  for (const [key, expected] of Object.entries(AR_EXPECTED)) {
    it(`strings.ar.${key} matches the approved code points exactly`, () => {
      const value = strings.ar[key as keyof typeof strings.ar];
      expect(value).toBeTypeOf('string');
      expect(cps(value as string), `strings.ar.${key} drifted from the approved code points`).toEqual(expected);
    });
  }

  it('carries NO hidden bidi / zero-width control characters (RLM, LRM, isolates, BOM)', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    for (const key of NEW_KEYS) {
      expect(cps(strings.ar[key] as string).filter(isCtrl), `${key} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('keeps its diacritics and uses no ASCII comma', () => {
    expect(cps(strings.ar.authEmailNotConfirmed), 'SHADDA 1617 lost from أكّد').toContain(1617);
    expect(cps(strings.ar.authEmailNotConfirmed), 'FATHATAN 1611 lost from أولاً').toContain(1611);
    expect(cps(strings.ar.authWeakPassword), 'FATHATAN 1611 lost from جدًا').toContain(1611);
    expect(cps(strings.ar.authTooManyAttempts), 'FATHATAN 1611 lost').toContain(1611);
    for (const key of NEW_KEYS) {
      expect(cps(strings.ar[key] as string), `an ASCII comma leaked into ${key}`).not.toContain(44);
    }
  });

  it('reuses already-approved Arabic verbatim (no second spelling of the same words)', () => {
    // تحقق من بريدك — the opener authConfirmEmailToast already uses.
    expect(strings.ar.authEmailNotConfirmed).toContain('تحقق من بريدك');
    // كلمة المرور — the label on this very screen.
    expect(strings.ar.authWeakPassword).toContain(strings.ar.authPasswordLabel);
    // حدث خطأ ما — the catalog's established "something went wrong".
    expect(strings.ar.authUnexpectedError).toContain(strings.ar.somethingWrong);
    // The rate-limit tail matches the approved forgot-password wording.
    expect(strings.ar.authTooManyAttempts.endsWith('انتظر قليلاً قبل المحاولة مرة أخرى.')).toBe(true);
    // ...but the two strings are NOT the same sentence: this one counts
    // attempts, that one counts reset requests.
    expect(strings.ar.authTooManyAttempts).not.toBe(strings.ar.forgotPasswordRateLimited);
  });
});

describe('auth-error catalog hygiene — all three locales', () => {
  it('every NEW key exists in all three locales (no missing-locale renders-empty)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LOCALES) {
        const v = strings[lang][key];
        expect(typeof v === 'string' && v.length > 0, `${lang}.${key} missing`).toBe(true);
      }
    }
  });

  it('no NEW key carries an interpolation placeholder (D1)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LOCALES) {
        expect(strings[lang][key], `${lang}.${key} has a slot`).not.toContain('{');
      }
    }
  });

  it('no NEW key contains an em dash or an en dash (house rule)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LOCALES) {
        const points = cps(strings[lang][key]);
        expect(points, `${lang}.${key} contains an em dash`).not.toContain(0x2014);
        expect(points, `${lang}.${key} contains an en dash`).not.toContain(0x2013);
      }
    }
  });

  it('no digit is spliced into the Arabic copy (D1)', () => {
    for (const key of NEW_KEYS) {
      expect(strings.ar[key], `${key} splices a digit into Arabic`).not.toMatch(/[0-9٠-٩]/);
    }
  });

  it('EN, FR and AR are all distinct (nothing was copy-pasted across locales)', () => {
    for (const key of NEW_KEYS) {
      expect(strings.en[key], `en/fr.${key} identical`).not.toBe(strings.fr[key]);
      expect(strings.en[key], `en/ar.${key} identical`).not.toBe(strings.ar[key]);
      expect(strings.fr[key], `fr/ar.${key} identical`).not.toBe(strings.ar[key]);
    }
  });

  it('authGenericError still says exactly what it said before (reused, not rewritten)', () => {
    expect(strings.en.authGenericError).toBe('Invalid email or password');
    expect(strings.fr.authGenericError).toBe('E-mail ou mot de passe invalide');
    expect(cps(strings.ar.authGenericError)).toEqual([
      1575, 1604, 1576, 1585, 1610, 1583, 32, 1575, 1604, 1573, 1604, 1603, 1578, 1585, 1608, 1606, 1610, 32, 1571,
      1608, 32, 1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1594, 1610, 1585, 32, 1589,
      1581, 1610, 1581, 1577,
    ]);
  });
});
