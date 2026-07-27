import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// THE ROUTING RACE — audit #8 Part 1.
// ============================================================================
// The client is created with supabase-js defaults: implicit flow, and
// detectSessionInUrl: true. A password-reset link therefore arrives as a URL
// fragment that Supabase consumes on load, and by the time React renders the
// user HOLDS A VALID SESSION. Nothing in `user` or `session` says "this person
// has not changed their password yet" — the PASSWORD_RECOVERY event is the only
// thing that does, and AuthContext used to throw it away (`(_event, session)`).
//
// With the event discarded, App's route table sees an ordinary authenticated
// user: the catch-all inside the Layout route forwards every unmatched path to
// /dashboard. The user lands INSIDE THE APP, signed in, with the password they
// came to replace still valid and never sees a reset screen. That is the harm.
// It is a silent login, not a recovery.
//
// These tests exist BEFORE any reset email can be sent (the forgot-password
// button is still deliberately inert). They are what distinguishes a real
// recovery from a magic link, and they must fail loudly if the precedence in
// App.tsx is ever removed or outranked by a route added later.
//
// WHAT IS AND IS NOT MOCKED. The two things under test — AuthContext's event
// handling and App's route table — are the REAL modules. Only the network
// boundaries are stubbed: the Supabase client (so the auth event can be fired
// on demand) and documentService (so that if the precedence FAILS, the app
// reaches a rendering dashboard and the assertion reports "landed on the
// dashboard" rather than an unrelated fetch crash).
// ============================================================================

type AuthListener = (event: string, session: unknown) => void;

const h = vi.hoisted(() => ({
  listeners: [] as Array<(event: string, session: unknown) => void>,
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getStats: vi.fn(),
  getRecentActivity: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: h.getSession,
      onAuthStateChange: (cb: AuthListener) => {
        h.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      updateUser: h.updateUser,
      signOut: h.signOut,
    },
  },
}));

// Web, not the Capacitor shell: LandingRoute's native branch is a different
// test's subject (nativeAntiSteering) and would mask the redirect under test.
vi.mock('../src/native/shell', () => ({
  hideSplash: () => {},
  isNativePlatform: () => false,
}));

vi.mock('../src/services/documentService', () => ({
  documentService: {
    getStats: h.getStats,
    getRecentActivity: h.getRecentActivity,
    getAllActivity: vi.fn(),
    exportCsv: vi.fn(),
    getDocumentDetail: vi.fn(),
  },
}));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));

import App from '../src/App';
import { AuthProvider } from '../src/contexts/AuthContext';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { strings } from '../src/i18n/strings';

// A perfectly ordinary, fully valid session — exactly what Supabase hands the
// app after consuming a recovery link. It is deliberately indistinguishable
// from a normal sign-in, because that is the point.
const RECOVERY_SESSION = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'c0ffee00-0000-4000-8000-000000000001', email: 'recovering@example.com' },
};

let container: HTMLDivElement;
let root: Root;

/** Mounts the REAL App under the REAL AuthProvider at the given browser path. */
function mountApp(path: string) {
  window.history.pushState({}, '', path);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    );
  });
}

/** Fires an auth event exactly as supabase-js would, through the real listener. */
function emit(event: string, session: unknown) {
  flushSync(() => {
    for (const cb of h.listeners) cb(event, session);
  });
}

const headings = () => [...container.querySelectorAll('h1')].map((e) => e.textContent);

/**
 * Waits until React has COMMITTED the screen a redirect leads to.
 *
 * <Navigate> pushes history from an effect, so a route change costs two
 * commits: the effect updates window.location, and only the following render
 * paints the destination. Polling window.location alone therefore succeeds
 * while the DOM is still empty — verified: the URL read /reset-password with
 * nothing but the toast container mounted. Every wait below is anchored on
 * RENDERED CONTENT for that reason, and the URL is asserted afterwards.
 */
async function settleOn(predicate: () => boolean, what: string) {
  await vi.waitFor(() => {
    expect(predicate(), diagnose(what)).toBe(true);
  });
}

/**
 * Builds the failure message.
 *
 * A bare "expected false to be true" is useless here: the whole point of this
 * file is that a specific USER-VISIBLE HARM must be named when the precedence
 * breaks. So the message reports where the user actually ended up, and when
 * that is the dashboard it says plainly what that means.
 */
function diagnose(expected: string): string {
  const at = window.location.pathname;
  const showing = JSON.stringify(headings());
  const harm =
    at === '/dashboard'
      ? ' THE RECOVERING USER REACHED THE DASHBOARD INSTEAD OF THE RESET SCREEN. ' +
        'They are now inside the app, signed in, with the password they came to replace ' +
        'still valid — a silent login, not a recovery. The recovery precedence in ' +
        'App.tsx is missing or has been outranked.'
      : '';
  return `The user never reached ${expected}. They are at ${at} showing ${showing}.${harm}`;
}

const onResetScreen = () => headings().includes(strings.en.resetPasswordTitle);

describe('PASSWORD_RECOVERY routing — the reset screen wins over the authenticated redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.listeners.length = 0;
    localStorage.clear();
    localStorage.setItem('lang', 'en');
    h.getStats.mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0, plan: 'FREE' });
    h.getRecentActivity.mockResolvedValue([]);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  // ── The realistic ordering. ───────────────────────────────────────────────
  // supabase-js resolves getSession() only after it has finished processing the
  // URL, so the PASSWORD_RECOVERY event reaches the app at or before the moment
  // the session becomes readable. Modelled by leaving getSession() pending and
  // firing the event first: the listener itself clears `loading`.
  it('a recovery landing on / renders the reset screen, and the dashboard never mounts', async () => {
    h.getSession.mockReturnValue(new Promise(() => {})); // never resolves
    mountApp('/');

    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');

    expect(
      headings(),
      'The recovering user must be looking at the reset screen. Any other heading ' +
        'means they were routed into the app while their old password still works.'
    ).toContain(strings.en.resetPasswordTitle);
    // Layout fetches the plan the instant it mounts. Zero calls proves the
    // authenticated shell was never rendered — not even for one frame.
    expect(h.getStats, 'the authenticated Layout mounted during a recovery').not.toHaveBeenCalled();
  });

  // ── The direct case named in the task. ────────────────────────────────────
  it('/reset-password renders the reset screen instead of being stolen to /dashboard', async () => {
    h.getSession.mockReturnValue(new Promise(() => {}));
    mountApp('/reset-password');

    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');

    expect(window.location.pathname, diagnose('the reset screen')).toBe('/reset-password');
    expect(h.getStats, 'the authenticated Layout mounted during a recovery').not.toHaveBeenCalled();
  });

  // ── The worst-case ordering. ──────────────────────────────────────────────
  // If the event ever arrived LATE — after the app had already resolved a
  // session and rendered the authenticated tree — the precedence must still pull
  // the user back out. This is the assertion that survives a change in how
  // supabase-js sequences initialisation.
  it('an event arriving after the app already rendered authenticated still lands on the reset screen', async () => {
    h.getSession.mockResolvedValue({ data: { session: RECOVERY_SESSION } });
    mountApp('/reset-password');

    // Let the getSession() promise settle: the app is now an ordinary
    // authenticated app and has already redirected to /dashboard.
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });

    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');

    expect(headings()).toContain(strings.en.resetPasswordTitle);
  });

  // ── The state is not sticky by accident. ──────────────────────────────────
  it('an ordinary SIGNED_IN event does NOT enter the recovery branch', async () => {
    h.getSession.mockReturnValue(new Promise(() => {}));
    mountApp('/reset-password');

    emit('SIGNED_IN', RECOVERY_SESSION);
    await settleOn(() => window.location.pathname === '/dashboard' && h.getStats.mock.calls.length > 0, 'the dashboard');

    expect(
      headings(),
      'A normal sign-in must not be treated as a recovery — that would trap every ' +
        'logged-in user on the reset screen.'
    ).not.toContain(strings.en.resetPasswordTitle);
  });

  it('a sign-out ends a pending recovery instead of stranding the app on the reset screen', async () => {
    h.getSession.mockReturnValue(new Promise(() => {}));
    mountApp('/');

    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');

    emit('SIGNED_OUT', null);
    await settleOn(() => window.location.pathname === '/' && container.querySelectorAll('h1').length > 0, 'the landing page');

    expect(headings()).not.toContain(strings.en.resetPasswordTitle);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Leaving the recovery state is an explicit act, and only after a real change.
// ────────────────────────────────────────────────────────────────────────────
describe('the recovery state is released only once the password has actually changed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.listeners.length = 0;
    localStorage.clear();
    localStorage.setItem('lang', 'en');
    h.getStats.mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0, plan: 'FREE' });
    h.getRecentActivity.mockResolvedValue([]);
    h.getSession.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  const typeInto = (id: string, value: string) => {
    const input = container.querySelector(`#${id}`) as HTMLInputElement;
    expect(input, `#${id} did not render`).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    flushSync(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const submit = () =>
    flushSync(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

  it('a FAILED update keeps the user on the reset screen (no escape without a new password)', async () => {
    h.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    mountApp('/');
    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');


    typeInto('new-password', 'a-long-enough-password');
    typeInto('confirm-password', 'a-long-enough-password');
    submit();

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(strings.en.resetPasswordGenericError);
    });
    expect(window.location.pathname).toBe('/reset-password');
    expect(headings()).toContain(strings.en.resetPasswordTitle);
  });

  it('a SUCCESSFUL update then Continue releases the state and reaches the dashboard', async () => {
    h.updateUser.mockResolvedValue({ data: { user: RECOVERY_SESSION.user }, error: null });
    mountApp('/');
    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');


    typeInto('new-password', 'a-long-enough-password');
    typeInto('confirm-password', 'a-long-enough-password');
    submit();

    await vi.waitFor(() => {
      expect(headings()).toContain(strings.en.resetPasswordSuccessTitle);
    });
    // Still fenced in until the user acts — the success screen is inside the
    // recovery branch, not outside it.
    expect(window.location.pathname).toBe('/reset-password');
    expect(h.updateUser).toHaveBeenCalledWith({ password: 'a-long-enough-password' });

    const cta = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.resetPasswordContinueCta)
    )!;
    expect(cta, 'the continue CTA did not render').toBeTruthy();
    flushSync(() => cta.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('validation failures are caught locally and never call updateUser', async () => {
    mountApp('/');
    emit('PASSWORD_RECOVERY', RECOVERY_SESSION);
    await settleOn(onResetScreen, 'the reset screen');


    typeInto('new-password', 'short');
    typeInto('confirm-password', 'short');
    submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(strings.en.resetPasswordTooShort);

    typeInto('new-password', 'a-long-enough-password');
    typeInto('confirm-password', 'a-different-password');
    submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(strings.en.resetPasswordMismatch);

    expect(h.updateUser).not.toHaveBeenCalled();
  });
});
