import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, CheckCircle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';

/**
 * The password-recovery screen.
 *
 * Reached ONLY through App's recovery precedence branch, which is entered when
 * AuthContext reports isRecovering (a PASSWORD_RECOVERY event from Supabase).
 * By the time this renders the user already holds a valid session — that is the
 * whole hazard — so the single job here is to make them commit a NEW password
 * before anything else in the app becomes reachable.
 *
 * Every user-visible string comes from the s.* catalog. Supabase's own error
 * text is deliberately NOT surfaced: it is server-side English and would leak
 * untranslated into an Arabic or French screen. The catalog's generic message
 * is shown instead. Mapping specific Supabase failures onto their own catalog
 * keys is a follow-up, not a silent English fallback.
 */

/**
 * Minimum accepted length. The catalog states this number in words
 * (resetPasswordTooShort) rather than interpolating it, so that no number is
 * spliced into Arabic at render time (ruling D1). resetPasswordLocalization
 * .test.tsx asserts the constant and the three catalog strings agree, so the
 * two cannot drift apart.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const ResetPasswordScreen: React.FC = () => {
  const s = useStrings();
  const navigate = useNavigate();
  const { clearRecovery } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(s.resetPasswordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(s.resetPasswordMismatch);
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch {
      setError(s.resetPasswordGenericError);
    } finally {
      setLoading(false);
    }
  };

  // Leaving the recovery state is an EXPLICIT act, taken only after the
  // password has actually changed. Until this runs, App's recovery branch keeps
  // every other route out of reach — which is the point.
  const handleContinue = () => {
    clearRecovery();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-8">
      <div className="w-full max-w-[440px]">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[40px] shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-200/50 dark:border-slate-700/50">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={28} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
                {s.resetPasswordSuccessTitle}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-base leading-relaxed mb-8">
                {s.resetPasswordSuccessBody}
              </p>
              <button
                type="button"
                onClick={handleContinue}
                className="w-full py-5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white rounded-2xl font-black text-base transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {s.resetPasswordContinueCta}
                <ArrowRight size={18} className="rtl:rotate-180" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-10 text-center lg:text-start">
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
                  {s.resetPasswordTitle}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-base leading-relaxed">
                  {s.resetPasswordSubtitle}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="new-password"
                    className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ps-1 flex items-center gap-2"
                  >
                    <Lock size={12} /> {s.resetPasswordNewLabel}
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 rounded-2xl text-slate-900 dark:text-white font-bold transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirm-password"
                    className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ps-1 flex items-center gap-2"
                  >
                    <Lock size={12} /> {s.resetPasswordConfirmLabel}
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700/50 focus:border-blue-500 rounded-2xl text-slate-900 dark:text-white font-bold transition-all outline-none"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl text-sm font-bold border border-rose-100 dark:border-rose-900/30 flex items-center gap-3"
                  >
                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white rounded-2xl font-black text-base transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {s.resetPasswordSubmitting}
                    </>
                  ) : (
                    s.resetPasswordSubmit
                  )}
                </button>

                <div className="pt-2 text-center">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    {s.authSecureNote}
                  </p>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
