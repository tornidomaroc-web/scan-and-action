import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useStrings } from '../i18n/useStrings';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';
import { Panel } from './ui/Panel';
import { IconTile } from './ui/IconTile';
import { TextField } from './ui/TextField';
import { PrimaryButton } from './ui/PrimaryButton';
import { Notice } from './ui/Notice';

// ============================================================================
// "Sign in on other devices": the way out of a provider-only account.
//
// An account created with Sign in with Apple on an iPhone has no password,
// and Apple sign-in is offered on iOS only (board, "Apple on the web and
// Android"). On the web and on Android such a person has an email address
// (real or a Hide-My-Email relay) and no way to prove it is theirs. This card
// gives them one while they are signed in: set a password here, and the same
// address plus that password signs in anywhere.
//
// WHY THIS AND NOT A RESET MAIL. Supabase's password recovery does reach a
// provider-only user (auth/recover looks the user up by address alone), but
// for a relay address the mail arrives only once scan-action.com is
// registered with Apple's private relay and passes its SPF/DKIM check, and
// the person must first find their relay address in iOS Settings. This card
// depends on none of that: supabase.auth.updateUser({ password }) on a user
// with no password creates the email identity (supabase/auth, user.go,
// ensureEmailIdentityForPassword), which is the documented way to add
// email-and-password sign-in to an OAuth account.
//
// SHOWN ONLY when the session's identities carry no `email` provider. A user
// object without an identities array (older sessions, tests) is assumed to
// have a password, so nothing new appears for anyone who signed up by email.
// ============================================================================

export const hasPasswordIdentity = (user: Pick<User, 'identities'> | null | undefined): boolean => {
  const identities = user?.identities;
  if (!Array.isArray(identities)) return true;
  return identities.some((identity) => identity.provider === 'email');
};

export interface SetPasswordCardProps {
  user: Pick<User, 'email' | 'identities'> | null | undefined;
}

export const SetPasswordCard: React.FC<SetPasswordCardProps> = ({ user }) => {
  const s = useStrings();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user || hasPasswordIdentity(user)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(s.passwordTooShort);
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      setPassword('');
    } catch {
      setError(s.resetPasswordGenericError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel className="p-4" data-set-password-card>
      <h3 className="flex items-center gap-3 text-[15px] font-bold text-ink">
        <IconTile icon={KeyRound} tone="accent" size="sm" />
        {s.setPasswordTitle}
      </h3>
      <p className="mt-2 text-start text-sm leading-relaxed text-ink-secondary">{s.setPasswordBody}</p>
      {/* dir="ltr" on the address: an identifier with LTR structure (see the
          same choice on the account card above). */}
      <p dir="ltr" className="mt-2 break-all text-start text-sm font-semibold text-ink">
        <bdi>{user.email}</bdi>
      </p>
      {done ? (
        <Notice tone="success" role="status" className="mt-4" data-set-password-done>
          {s.setPasswordDone}
        </Notice>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3" data-set-password-form>
          <TextField
            id="set-password"
            shape="pill"
            label={s.resetPasswordNewLabel}
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            invalid={error === s.passwordTooShort}
            hint={s.authPasswordHint}
          />
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <PrimaryButton type="submit" loading={loading} loadingLabel={s.resetPasswordSubmitting}>
            {s.setPasswordSubmit}
          </PrimaryButton>
        </form>
      )}
    </Panel>
  );
};
