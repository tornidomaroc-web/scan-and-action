import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Zap, 
  Brain, 
  BarChart, 
  CheckCircle, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useToast } from '../contexts/ToastContext';
import { translateAuthError } from '../lib/serverErrors';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

// Where the password-reset email lands. ABSOLUTE and CANONICAL, deliberately
// NOT window.location.origin — the same reasoning (and the same www host) as
// CHECKOUT_SUCCESS_URL in components/PaywallModal.tsx.
//
// window.location.origin is WRONG here on two of the three surfaces we ship:
//   - Android: capacitor.config.ts sets androidScheme 'https', so the WebView
//     origin is literally `https://localhost` (the backend's own CORS allowlist
//     names it, apps/backend/src/corsOrigin.ts). A reset link pointing at
//     https://localhost/reset-password resolves to nothing in the user's mail
//     client, and Supabase would reject the unlisted redirect and silently fall
//     back to the Site URL.
//   - Vercel previews: the origin is a per-deploy *.vercel.app host that is not
//     in Supabase's redirect allowlist, so the same silent fallback applies.
// Pinning the canonical URL means every surface — web, preview, Android —
// sends a link that actually works.
//
// REQUIRES (Supabase dashboard, Authentication -> URL Configuration): this exact
// URL must be on the Redirect URLs allowlist. If it is not, Supabase ignores
// redirectTo and falls back to the Site URL. See the PR body.
const RESET_PASSWORD_REDIRECT_URL = 'https://www.scan-action.com/reset-password';

export const AuthScreen: React.FC = () => {
  const s = useStrings();
  const { showToast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // SIGNUP ONLY — never gate the login branch on length.
    //
    // Supabase's project minimum is 6 (lib/passwordPolicy.ts records the
    // dashboard reading), so accounts created before this check exist in
    // production RIGHT NOW with 6- and 7-character passwords. Moving this
    // condition above the isLogin branch, or dropping the `!isLogin`, would
    // refuse to even ATTEMPT sign-in for every one of those users and lock them
    // out of their own accounts without a single network call. That is the one
    // way this screen can cause an outage; authPasswordLength.test.tsx holds it
    // down from both sides.
    //
    // The rule this closes: ResetPasswordScreen has always rejected under
    // MIN_PASSWORD_LENGTH, so without this a user could sign up with six
    // characters and then be refused that same password at reset time.
    if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      setError(s.passwordTooShort);
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showToast(s.authConfirmEmailToast, 'success');
      }
    } catch (err: any) {
      // Supabase's `err.message` is server-side English ("Invalid login
      // credentials") and used to render verbatim here, in every locale. Only
      // catalog strings are ever shown; lib/serverErrors.ts picks which one and
      // cannot return its input. Control flow is unchanged.
      setError(translateAuthError(err, s));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send the password-reset email.
   *
   * ENUMERATION: the success notice is deliberately conditional wording —
   * "if an account exists for that address" — and is shown for EVERY accepted
   * request. Supabase's resetPasswordForEmail already refuses to distinguish a
   * known address from an unknown one, so the response cannot leak; the only
   * remaining leak vector was our own copy, and it is closed. Never change this
   * to "we sent you an email": that turns the login screen into an oracle for
   * which addresses hold accounts.
   *
   * RATE LIMITING: three layers, because Supabase's own limit is a shared
   * project-wide budget that Abo Jad has already had to raise once.
   *   1. `sendingReset` disables the control for the whole round trip, so a
   *      double-click cannot produce two sends.
   *   2. `resetNotice` keeps it disabled AFTER a success, until the user edits
   *      the email field — so "did it work?" clicking cannot burn the budget.
   *   3. If Supabase rejects with 429 / over_email_send_rate_limit anyway, that
   *      is surfaced as its OWN catalog string, not the generic failure, so the
   *      user is told to wait rather than to retry immediately.
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: RESET_PASSWORD_REDIRECT_URL,
      });
      if (resetError) {
        // Supabase's own message is server-side English and would leak
        // untranslated into an Arabic or French screen; only catalog strings
        // are ever shown.
        const status = (resetError as { status?: number }).status;
        const code = (resetError as { code?: string }).code;
        const limited = status === 429 || code === 'over_email_send_rate_limit';
        setError(limited ? s.forgotPasswordRateLimited : s.forgotPasswordError);
        return;
      }
      setResetNotice(s.forgotPasswordSent);
    } catch {
      setError(s.forgotPasswordError);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)] overflow-hidden lg:gap-0">
      {/* Left Side: Product Value Panel (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-16">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-lg w-full">
          <div className="mb-12 flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Zap size={28} className="text-white" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">{s.header}</span>
          </div>

          <p className="text-blue-400 font-bold uppercase tracking-[0.2em] text-xs mb-4">
            {s.authKicker}
          </p>
          <h1 className="text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
            {s.authHeadlinePre}<span className="text-blue-500">{s.authHeadlineEmphasis}</span>{s.authHeadlinePost}
          </h1>
          <p className="text-xl text-slate-300 font-bold mb-10">
            {s.authSubheadline}
          </p>

          <div className="space-y-8">
            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <Zap size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">{s.authFeat1Title}</h4>
                <p className="text-slate-500 text-sm font-medium">{s.authFeat1Desc}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <Brain size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">{s.authFeat2Title}</h4>
                <p className="text-slate-500 text-sm font-medium">{s.authFeat2Desc}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700 transition-colors group-hover:border-blue-500/50">
                <BarChart size={20} className="text-blue-500" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">{s.authFeat3Title}</h4>
                <p className="text-slate-500 text-sm font-medium">{s.authFeat3Desc}</p>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-12 border-t border-white/5">
             <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                <ShieldCheck size={18} className="text-emerald-500" />
                {s.authTrust}
             </div>
          </div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 lg:p-16 animate-in fade-in slide-in-from-right-4 duration-700">
        <div className="w-full max-w-[440px]">
          {/* Mobile Only Header */}
          <div className="lg:hidden mb-12 flex flex-col items-center">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 rotate-3">
               <Zap size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{s.header}</h2>
          </div>

          <div className="bg-white dark:bg-slate-800 p-10 lg:p-12 rounded-[40px] shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-200/50 dark:border-slate-700/50">
            <div className="mb-10 lg:text-left text-center">
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-3 italic">
                {isLogin ? s.authWelcomeBack : s.authCreateWorkspace}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-base leading-relaxed">
                {isLogin ? s.authLoginSubtitle : s.authSignupSubtitle}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] pl-1 flex items-center gap-2">
                  <Mail size={12} /> {s.authEmailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    // Editing the address re-arms the reset control: a typo is
                    // correctable, but idle re-clicking is not (see layer 2 in
                    // handleForgotPassword).
                    if (resetNotice) setResetNotice(null);
                  }}
                  required
                  autoFocus
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl text-slate-900 dark:text-white font-bold placeholder-slate-350 dark:placeholder-slate-600 transition-all outline-none"
                  placeholder={s.authEmailPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="password" className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Lock size={12} /> {s.authPasswordLabel}
                  </label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      // Disabled while in flight AND after a successful send —
                      // see handleForgotPassword for why both matter.
                      disabled={sendingReset || resetNotice !== null}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      {sendingReset ? s.forgotPasswordSending : s.authForgotPassword}
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl text-slate-900 dark:text-white font-bold placeholder-slate-350 dark:placeholder-slate-600 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl text-sm font-bold border border-rose-100 dark:border-rose-900/30 flex items-center gap-3 animate-in fade-in zoom-in-95">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  {error}
                </div>
              )}

              {resetNotice && (
                <div
                  role="status"
                  data-testid="reset-notice"
                  className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl text-sm font-bold border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-3 animate-in fade-in zoom-in-95"
                >
                  <ShieldCheck size={16} className="shrink-0" />
                  {resetNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 hover:-translate-y-0.5 hover:brightness-110 text-white rounded-2xl font-black text-base transition-all shadow-xl shadow-slate-200 dark:shadow-none active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-3 group"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isLogin ? s.authSigningIn : s.authRegistering}
                  </>
                ) : (
                  <>
                    {isLogin ? s.authContinueCta : s.authAccessCta}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <ShieldCheck size={12} className="text-emerald-500" />
                  {s.authSecureNote}
                </p>
              </div>
            </form>

            <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {isLogin ? s.authNoAccount : s.authHaveAccount}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(null); }}
                  className="ml-2 text-blue-600 dark:text-blue-400 hover:underline font-black"
                >
                  {isLogin ? s.authCreateAccountCta : s.authSignInCta}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
