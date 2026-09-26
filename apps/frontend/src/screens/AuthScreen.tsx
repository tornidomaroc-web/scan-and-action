import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStrings } from '../i18n/useStrings';
import { useToast } from '../contexts/ToastContext';
import { translateAuthError } from '../lib/serverErrors';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';
import { isRequestTimeout, REQUEST_TIMEOUT_MS, withTimeout } from '../lib/fetchWithTimeout';
import { isNativePlatform } from '../native/shell';
import { AuthFrame } from '../components/auth/AuthFrame';
import { TextField } from '../components/ui/TextField';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { Notice } from '../components/ui/Notice';
import { IconTile } from '../components/ui/IconTile';

// ============================================================================
// Sign in and sign up, in the visual language of 2026-09-26.
//
// The anatomy: a dark page; the brand, the title and one line in the big
// accent card (AuthFrame); a pill switch between "Sign in" and "Create
// account"; the two fields as pills; the one button as the accent pill. The
// fields still come first under the card, so on a phone they and the button
// sit above the keyboard.
//
// WHAT DID NOT CHANGE, on purpose, and is held by the tests named:
//   the sign-up length guard and the sign-in path that is never gated on
//   length (authPasswordLength.test.tsx); every error rendered from the
//   catalog through translateAuthError (authErrorI18n.test.tsx); the
//   forgot-password wiring, its enumeration-safe copy and its three rate
//   limits (forgotPasswordWiring.test.tsx); the recovery redirect URL below;
//   and the behaviour the first redraw added (authScreenRedraw.test.tsx):
//   the 20 s timeout, the truthful error copy, the autofill attributes, the
//   "check your inbox" state, the language switcher on the first screen.
// ============================================================================

// Where the password-reset email lands. ABSOLUTE and CANONICAL, deliberately
// NOT window.location.origin: on Android the WebView origin is
// `https://localhost` and on a Vercel preview it is a per-deploy host, and
// neither is on Supabase's redirect allowlist, so Supabase would fall back to
// the Site URL silently. REQUIRES (Supabase dashboard, Authentication -> URL
// Configuration): this exact URL on the Redirect URLs allowlist.
const RESET_PASSWORD_REDIRECT_URL = 'https://www.scan-action.com/reset-password';

type Mode = 'login' | 'signup';

export const AuthScreen: React.FC = () => {
  const s = useStrings();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  // The address a confirmation link was just sent to; the form gives way to
  // the "check your inbox" panel while this is set.
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  const isLogin = mode === 'login';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // SIGNUP ONLY. Never gate the login branch on length: accounts created
    // against the old 6-character minimum still exist and must still sign in
    // (lib/passwordPolicy.ts, SHORTEST_EXISTING_PASSWORD_LENGTH).
    if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      setError(s.passwordTooShort);
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), REQUEST_TIMEOUT_MS, 'sign in');
        if (error) throw error;
      } else {
        const { error } = await withTimeout(supabase.auth.signUp({ email, password }), REQUEST_TIMEOUT_MS, 'sign up');
        if (error) throw error;
        showToast(s.authConfirmEmailToast, 'success');
        setSignedUpEmail(email);
      }
    } catch (err: unknown) {
      // Only catalog strings are ever shown. A timeout is the one failure
      // translateAuthError cannot name, since it is ours, not Supabase's.
      setError(isRequestTimeout(err) ? s.requestTimedOut : translateAuthError(err, s));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send the password-reset email.
   *
   * ENUMERATION: the notice says "if an account exists for that address" and
   * is shown for EVERY accepted request. Never change it to "we sent you an
   * email": that makes this screen an oracle for which addresses hold
   * accounts.
   *
   * RATE LIMITING, three layers: `sendingReset` disables the control for the
   * round trip; `resetNotice` keeps it disabled after a success until the
   * address is edited; a 429 from Supabase gets its own copy so the person
   * is told to wait rather than to retry.
   */
  const handleForgotPassword = async () => {
    const address = email.trim();
    if (!address) {
      setResetNotice(null);
      setError(s.forgotPasswordEmailRequired);
      return;
    }

    setSendingReset(true);
    setError(null);
    setResetNotice(null);

    try {
      const { error: resetError } = await withTimeout(
        supabase.auth.resetPasswordForEmail(address, { redirectTo: RESET_PASSWORD_REDIRECT_URL }),
        REQUEST_TIMEOUT_MS,
        'reset password',
      );
      if (resetError) {
        const status = (resetError as { status?: number }).status;
        const code = (resetError as { code?: string }).code;
        const limited = status === 429 || code === 'over_email_send_rate_limit';
        setError(limited ? s.forgotPasswordRateLimited : s.forgotPasswordError);
        return;
      }
      setResetNotice(s.forgotPasswordSent);
    } catch (err: unknown) {
      setError(isRequestTimeout(err) ? s.requestTimedOut : s.forgotPasswordError);
    } finally {
      setSendingReset(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSignedUpEmail(null);
  };

  // Which field the refusal was about, so its ring says so. A connection or
  // server failure marks nothing: the fields were not the problem.
  const emailInvalid = error === s.authGenericError;
  const passwordInvalid = error === s.authGenericError || error === s.passwordTooShort || error === s.authWeakPassword;

  if (signedUpEmail !== null) {
    return (
      <AuthFrame title={s.authCheckInboxTitle}>
        <div data-auth-check-inbox className="rounded-panel bg-surface-raised p-5 ring-1 ring-line">
          <IconTile icon={Mail} tone="success" size="lg" />
          <p dir="ltr" className="mt-4 break-all text-start font-semibold text-ink">
            <bdi>{signedUpEmail}</bdi>
          </p>
          <p className="mt-2 text-start text-sm leading-relaxed text-ink-secondary">{s.authCheckInboxBody}</p>
          <button type="button" onClick={() => switchMode('login')} className="mt-6 text-sm font-semibold text-accent-text hover:underline">
            {s.authBackToSignIn}
          </button>
        </div>
      </AuthFrame>
    );
  }

  const segment = (active: boolean) =>
    `flex-1 rounded-pill py-2 text-center text-sm font-semibold transition-colors motion-reduce:transition-none ${active ? 'bg-ink text-surface shadow-card' : 'text-ink-secondary hover:text-ink'}`;

  return (
    <AuthFrame title={isLogin ? s.authSignInTitle : s.authSignUpTitle} subtitle={isLogin ? s.authSignInSubtitle : s.authSignUpSubtitle}>
      {/* The pill switch: two segments, the active one raised. The segments
          carry the two CTA strings, so the tests that flip the mode by its
          catalog label find them here. */}
      <div role="radiogroup" aria-label={s.authSignInTitle} className="flex gap-1 rounded-pill bg-surface-raised p-1 ring-1 ring-line" data-auth-mode-switch>
        <button type="button" role="radio" aria-checked={isLogin} onClick={() => switchMode('login')} className={segment(isLogin)}>
          {s.authSignInCta}
        </button>
        <button type="button" role="radio" aria-checked={!isLogin} onClick={() => switchMode('signup')} className={segment(!isLogin)}>
          {s.authCreateAccountCta}
        </button>
      </div>

      {/* mt-4 and space-y-3: with the frame's short card these put the
          button's bottom at 483 px (sign-in) and 505 px (sign-up) on a
          390 x 844 phone, above the 508 px a 336 pt keyboard leaves. */}
      <form onSubmit={handleAuth} className="mt-4 space-y-3" data-auth-form={mode}>
        <TextField
          id="email"
          shape="pill"
          label={s.authEmailLabel}
          type="email"
          inputMode="email"
          autoComplete={isLogin ? 'username' : 'email'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          dir="ltr"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Editing the address re-arms the reset control (layer 2 above).
            if (resetNotice) setResetNotice(null);
          }}
          required
          autoFocus
          invalid={emailInvalid}
          placeholder={s.authEmailPlaceholder}
        />

        <TextField
          id="password"
          shape="pill"
          label={s.authPasswordLabel}
          type={showPassword ? 'text' : 'password'}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          enterKeyHint="go"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          invalid={passwordInvalid}
          hint={isLogin ? undefined : s.authPasswordHint}
          className="pe-20"
          labelEnd={
            isLogin ? (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset || resetNotice !== null}
                className="text-label font-semibold text-accent-text hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
              >
                {sendingReset ? s.forgotPasswordSending : s.authForgotPassword}
              </button>
            ) : undefined
          }
          end={
            // A word, not an eye: it says what it does in the reader's language.
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-accent-text hover:underline"
            >
              {showPassword ? s.authHidePassword : s.authShowPassword}
            </button>
          }
        />

        {error && (
          // `bg-rose-50` is the hook the auth tests find this panel by
          // (authErrorI18n, authPasswordLength, forgotPasswordWiring). It is
          // overridden to transparent so the Notice's tint paints; it carries
          // no colour of its own, so it pairs with nothing.
          <Notice tone="danger" role="alert" textClassName="bg-rose-50 !bg-transparent">
            {error}
          </Notice>
        )}

        {resetNotice && (
          <Notice tone="success" role="status" data-testid="reset-notice">
            {resetNotice}
          </Notice>
        )}

        <PrimaryButton type="submit" loading={loading} loadingLabel={isLogin ? s.authSigningIn : s.authRegistering}>
          {isLogin ? s.authSignInCta : s.authCreateAccountCta}
          <ArrowRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
        </PrimaryButton>

        {!isLogin && !isNativePlatform() && (
          // The legal line, on the web only for now: the in-app privacy link
          // is its own board item (APPLE TRACK, "No privacy-policy link
          // inside the native app"), and that page's wording is what it
          // waits on, not this screen.
          <p className="text-start text-xs leading-relaxed text-ink-muted" data-auth-legal>
            {s.authLegalNotice}{' '}
            <Link to="/terms" className="font-semibold text-ink-secondary underline">{s.authTermsLink}</Link>
            {' · '}
            <Link to="/privacy" className="font-semibold text-ink-secondary underline">{s.authPrivacyLink}</Link>
          </p>
        )}
      </form>
    </AuthFrame>
  );
};
