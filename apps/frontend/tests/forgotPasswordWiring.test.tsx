import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// FORGOT-PASSWORD WIRING — audit #8 Part 2.
// ============================================================================
// Part 1 built the destination and fenced it. This file covers the trigger, and
// with it the first change in this audit that can send a REAL EMAIL.
//
// The assertion that earns its keep is redirectTo. Everything else here fails
// loudly and locally; redirectTo fails SILENTLY IN PRODUCTION — Supabase
// accepts the call, returns no error, sends the mail, and the link simply lands
// somewhere useless. Nothing in the UI would look wrong. So the exact URL is
// pinned as a literal string below, deliberately NOT imported from the source:
// importing the constant would make the test agree with whatever the source
// says, which is precisely the bug it must catch.
//
// Why an absolute canonical URL and not window.location.origin, restated here
// so a future reader does not "simplify" it back:
//   - Android WebView origin is https://localhost (capacitor.config.ts sets
//     androidScheme https; apps/backend/src/corsOrigin.ts names the origin).
//   - Vercel preview origins are per-deploy *.vercel.app hosts.
// Neither is on Supabase's redirect allowlist, and neither resolves to anything
// in a mail client.
// ============================================================================

/** The exact URL a reset link must come back to. Pinned, not imported. */
const EXPECTED_REDIRECT = 'https://www.scan-action.com/reset-password';

const h = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: h.resetPasswordForEmail,
      signInWithPassword: h.signInWithPassword,
      signUp: h.signUp,
    },
  },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr' | 'ar') {
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

/** The forgot-password control, found by its catalog label in the active locale. */
function forgotButton(lang: 'en' | 'fr' | 'ar'): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find(
    (b) =>
      b.textContent === strings[lang].authForgotPassword ||
      b.textContent === strings[lang].forgotPasswordSending
  );
  expect(btn, 'the forgot-password button did not render').toBeTruthy();
  return btn as HTMLButtonElement;
}

function typeEmail(value: string) {
  const input = container.querySelector('#email') as HTMLInputElement;
  expect(input, '#email did not render').toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const notice = () => container.querySelector('[data-testid="reset-notice"]')?.textContent ?? null;
const errorBox = () =>
  [...container.querySelectorAll('div')].find((d) =>
    d.className.includes('bg-rose-50')
  )?.textContent ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
});

// ────────────────────────────────────────────────────────────────────────────
// 1. THE CALL — email and redirectTo.
// ────────────────────────────────────────────────────────────────────────────
describe('the forgot-password button actually sends, with the right redirect', () => {
  it('calls resetPasswordForEmail with the typed email AND the canonical redirectTo', async () => {
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));

    await vi.waitFor(() => {
      expect(h.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });
    expect(
      h.resetPasswordForEmail,
      'redirectTo is the part that breaks SILENTLY in production: Supabase accepts ' +
        'the call, sends the mail, and the link lands somewhere that resolves to ' +
        'nothing. It must be the canonical absolute URL — not window.location.origin, ' +
        'which is https://localhost inside the Android WebView.'
    ).toHaveBeenCalledWith('user@example.com', { redirectTo: EXPECTED_REDIRECT });
  });

  it('the redirectTo host is the canonical www domain over https, and the path is /reset-password', async () => {
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalled());

    const passed = h.resetPasswordForEmail.mock.calls[0][1].redirectTo as string;
    const url = new URL(passed);
    expect(url.protocol, 'a reset link must be https').toBe('https:');
    expect(url.hostname, 'must be the canonical customer-facing host').toBe('www.scan-action.com');
    expect(url.pathname, 'must land on the Part 1 recovery route').toBe('/reset-password');
    expect(url.hostname, 'localhost is the Capacitor WebView origin, never a mail target').not.toBe(
      'localhost'
    );
    expect(passed, 'a per-deploy preview host would not be on the Supabase allowlist').not.toContain(
      'vercel.app'
    );
  });

  it('trims the address before sending', async () => {
    mount('en');
    typeEmail('  spaced@example.com  ');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalled());
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith('spaced@example.com', {
      redirectTo: EXPECTED_REDIRECT,
    });
  });

  it('an empty email never reaches Supabase and asks for the address instead', () => {
    mount('en');
    click(forgotButton('en'));
    expect(h.resetPasswordForEmail, 'an empty address must not burn a send').not.toHaveBeenCalled();
    expect(errorBox()).toContain(strings.en.forgotPasswordEmailRequired);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. ENUMERATION — the success copy must not confirm an account exists.
// ────────────────────────────────────────────────────────────────────────────
describe('the success notice does not leak whether an account exists', () => {
  it('shows the SAME neutral notice regardless of the address', async () => {
    mount('en');
    typeEmail('definitely-real@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(notice()).toBe(strings.en.forgotPasswordSent));
    const first = notice();

    root.unmount();
    container.remove();
    mount('en');
    typeEmail('definitely-not-real@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(notice()).toBe(strings.en.forgotPasswordSent));

    expect(
      notice(),
      'Two different addresses must produce byte-identical copy. Anything else turns ' +
        'the login screen into an oracle for which addresses hold accounts.'
    ).toBe(first);
  });

  it('the EN/FR/AR copy is CONDITIONAL — it never asserts that a message was sent to them', () => {
    // Guards the wording itself, in every locale, against a well-meaning
    // "clearer" rewrite. The catalog must not claim delivery.
    expect(strings.en.forgotPasswordSent).toContain('If an account exists');
    expect(strings.fr.forgotPasswordSent).toContain('Si un compte existe');
    // AR by CODE POINTS: إذا كان هناك حساب = "if there is an account".
    const arConditional = [1573, 1584, 1575, 32, 1603, 1575, 1606, 32, 1607, 1606, 1575, 1603];
    expect([...strings.ar.forgotPasswordSent].slice(0, 12).map((c) => c.codePointAt(0))).toEqual(
      arConditional
    );

    for (const lang of ['en', 'fr', 'ar'] as const) {
      for (const forbidden of ['We sent', 'we sent', 'Nous avons envoyé', 'Check your email']) {
        expect(
          strings[lang].forgotPasswordSent,
          `${lang}.forgotPasswordSent asserts delivery — that confirms the account exists`
        ).not.toContain(forbidden);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RATE LIMITING — three layers.
// ────────────────────────────────────────────────────────────────────────────
describe('the button cannot be used to spam the shared Supabase email budget', () => {
  it('a double-click while in flight produces exactly ONE send', async () => {
    let release: (v: unknown) => void = () => {};
    h.resetPasswordForEmail.mockReturnValue(new Promise((r) => { release = r; }));
    mount('en');
    typeEmail('user@example.com');

    const btn = forgotButton('en');
    click(btn);
    click(btn);
    click(btn);

    expect(h.resetPasswordForEmail, 'the in-flight guard let a second send through').toHaveBeenCalledTimes(1);
    expect(btn.disabled, 'the control must be disabled while in flight').toBe(true);
    expect(btn.textContent).toBe(strings.en.forgotPasswordSending);

    flushSync(() => release({ data: {}, error: null }));
  });

  it('stays disabled AFTER a success, so idle re-clicking cannot burn the budget', async () => {
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(notice()).toBe(strings.en.forgotPasswordSent));

    const btn = forgotButton('en');
    expect(btn.disabled, 'the control re-armed itself after a successful send').toBe(true);
    click(btn);
    expect(h.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('editing the email re-arms the control (a typo stays correctable)', async () => {
    mount('en');
    typeEmail('typo@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(notice()).toBe(strings.en.forgotPasswordSent));

    typeEmail('correct@example.com');
    expect(notice(), 'the stale notice must clear when the address changes').toBeNull();
    const btn = forgotButton('en');
    expect(btn.disabled).toBe(false);
    click(btn);
    await vi.waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalledTimes(2));
    expect(h.resetPasswordForEmail).toHaveBeenLastCalledWith('correct@example.com', {
      redirectTo: EXPECTED_REDIRECT,
    });
  });

  it('a Supabase 429 is surfaced as WAIT, not as a generic retry', async () => {
    h.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'For security purposes, you can only request this after 51 seconds.', status: 429 },
    });
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));

    await vi.waitFor(() => expect(errorBox()).toContain(strings.en.forgotPasswordRateLimited));
    expect(
      errorBox(),
      "Supabase's own English message must never reach the user — it would render " +
        'untranslated inside an Arabic or French screen.'
    ).not.toContain('For security purposes');
  });

  it('the over_email_send_rate_limit code is treated the same as a 429 status', async () => {
    h.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'rate limited', code: 'over_email_send_rate_limit' },
    });
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));
    await vi.waitFor(() => expect(errorBox()).toContain(strings.en.forgotPasswordRateLimited));
  });

  it('any other failure shows the generic catalog error, never the Supabase text', async () => {
    h.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'Invalid API key', status: 401 },
    });
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));

    await vi.waitFor(() => expect(errorBox()).toContain(strings.en.forgotPasswordError));
    expect(errorBox()).not.toContain('Invalid API key');
  });

  it('a thrown network error is caught and shown as the generic catalog error', async () => {
    h.resetPasswordForEmail.mockRejectedValue(new Error('network down'));
    mount('en');
    typeEmail('user@example.com');
    click(forgotButton('en'));

    await vi.waitFor(() => expect(errorBox()).toContain(strings.en.forgotPasswordError));
    expect(errorBox()).not.toContain('network down');
    // The control must re-arm after a failure — the user has to be able to retry.
    expect(forgotButton('en').disabled).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. RENDER under lang=ar and lang=fr.
// ────────────────────────────────────────────────────────────────────────────
describe('the forgot-password surface renders the catalog exactly', () => {
  it('under lang=ar the success notice is exactly strings.ar.forgotPasswordSent', async () => {
    mount('ar');
    typeEmail('user@example.com');
    click(forgotButton('ar'));

    await vi.waitFor(() => expect(notice()).toBeTruthy());
    expect(
      notice(),
      'The notice must render the AR catalog string ALONE. Anything else means the ' +
        'screen does not read the catalog, or English was concatenated on.'
    ).toBe(strings.ar.forgotPasswordSent);
  });

  it('under lang=ar the in-flight label is exactly strings.ar.forgotPasswordSending', () => {
    h.resetPasswordForEmail.mockReturnValue(new Promise(() => {}));
    mount('ar');
    typeEmail('user@example.com');
    click(forgotButton('ar'));
    expect(forgotButton('ar').textContent).toBe(strings.ar.forgotPasswordSending);
  });

  it('under lang=ar the rate-limit error is exactly strings.ar.forgotPasswordRateLimited', async () => {
    h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'x', status: 429 } });
    mount('ar');
    typeEmail('user@example.com');
    click(forgotButton('ar'));
    await vi.waitFor(() => expect(errorBox()).toBeTruthy());
    expect(errorBox()).toBe(strings.ar.forgotPasswordRateLimited);
  });

  it('under lang=fr the success notice is exactly strings.fr.forgotPasswordSent (no English fallback)', async () => {
    mount('fr');
    typeEmail('user@example.com');
    click(forgotButton('fr'));
    await vi.waitFor(() => expect(notice()).toBeTruthy());
    expect(notice()).toBe(strings.fr.forgotPasswordSent);
    expect(notice()).not.toContain('If an account exists');
  });

  it('the redirectTo does NOT vary by locale', async () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      vi.clearAllMocks();
      h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
      mount(lang);
      typeEmail('user@example.com');
      click(forgotButton(lang));
      await vi.waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalled());
      expect(h.resetPasswordForEmail.mock.calls[0][1]).toEqual({ redirectTo: EXPECTED_REDIRECT });
      root.unmount();
      container.remove();
    }
    mount('en'); // leave something for the shared afterEach to tear down
  });
});
