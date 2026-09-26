import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';
import { AuthFrame } from '../components/auth/AuthFrame';
import { TextField } from '../components/ui/TextField';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { Notice } from '../components/ui/Notice';
import { IconTile } from '../components/ui/IconTile';

/**
 * The password-recovery screen.
 *
 * Reached ONLY through App's recovery precedence branch, which is entered when
 * AuthContext reports isRecovering (a PASSWORD_RECOVERY event from Supabase).
 * By the time this renders the user already holds a valid session, which is
 * the whole hazard, so the single job here is to make them commit a NEW
 * password before anything else in the app becomes reachable.
 *
 * Redrawn onto the sign-in screen's pieces on 2026-09-26. The logic is the
 * one from before, line for line: the length and match checks, updateUser,
 * the generic catalog error, and clearRecovery() only after the password has
 * actually changed (passwordRecoveryRouting.test.tsx holds it).
 *
 * Every user-visible string comes from the s.* catalog. Supabase's own error
 * text is deliberately NOT surfaced: it is server-side English.
 */
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
      setError(s.passwordTooShort);
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
  // every other route out of reach, which is the point.
  const handleContinue = () => {
    clearRecovery();
    navigate('/dashboard', { replace: true });
  };

  if (done) {
    return (
      <AuthFrame>
        <div data-reset-done>
          <IconTile icon={CheckCircle2} tone="success" size="lg" />
          <h1 className="mt-4 text-start text-title-lg font-semibold text-ink">{s.resetPasswordSuccessTitle}</h1>
          {/* text-balance evens the two lines out. TYPOGRAPHY ONLY: the catalog
              string is byte-identical in all three locales and must stay so
              (resetPasswordSuccessWrap.test.tsx). */}
          <p className="text-balance mt-2 text-start text-sm leading-relaxed text-ink-secondary">{s.resetPasswordSuccessBody}</p>
          <PrimaryButton type="button" onClick={handleContinue} className="mt-6">
            {s.resetPasswordContinueCta}
            <ArrowRight size={18} className="rtl:rotate-180" aria-hidden="true" />
          </PrimaryButton>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1 className="text-start text-title-lg font-semibold text-ink">{s.resetPasswordTitle}</h1>
      <p className="mt-1 text-start text-sm text-ink-secondary">{s.resetPasswordSubtitle}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" data-reset-form>
        <TextField
          id="new-password"
          label={s.resetPasswordNewLabel}
          type="password"
          autoComplete="new-password"
          enterKeyHint="next"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          invalid={error === s.passwordTooShort}
          hint={s.authPasswordHint}
        />
        <TextField
          id="confirm-password"
          label={s.resetPasswordConfirmLabel}
          type="password"
          autoComplete="new-password"
          enterKeyHint="go"
          dir="ltr"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          invalid={error === s.resetPasswordMismatch}
        />

        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}

        <PrimaryButton type="submit" loading={loading} loadingLabel={s.resetPasswordSubmitting}>
          {s.resetPasswordSubmit}
        </PrimaryButton>
      </form>
    </AuthFrame>
  );
};
