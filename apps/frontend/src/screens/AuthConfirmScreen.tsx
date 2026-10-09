import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck, MailX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStrings } from '../i18n/useStrings';
import { readAuthLinkParams } from '../lib/authLinks';
import { isRequestTimeout, REQUEST_TIMEOUT_MS, withTimeout } from '../lib/fetchWithTimeout';
import { AuthFrame } from '../components/auth/AuthFrame';
import { IconTile } from '../components/ui/IconTile';

// ============================================================================
// Where an email's confirmation or password-reset link lands, on the web and,
// through a universal link or App Link, inside the app (lib/authLinks.ts).
//
// It spends the token once with verifyOtp. Then:
//   - email / signup: the person is signed in; go to the home.
//   - recovery: Supabase emits PASSWORD_RECOVERY (auth-js 2.99.3,
//     GoTrueClient verifyOtp), AuthContext raises isRecovering, and App's
//     recovery branch takes over and shows /reset-password. This screen does
//     not navigate for that case; the branch already outranks every route.
//
// A token is single-use, so the call is guarded by a ref: React StrictMode
// runs effects twice in development, and a second verifyOtp on a spent token
// would replace a success with "this link no longer works".
//
// Errors: a 4xx from Supabase means the link is spent or expired; no status
// means the request never got an answer, which is said as such.
// ============================================================================

type State = 'working' | 'failed' | 'network' | 'timeout' | 'confirmed';

export const AuthConfirmScreen: React.FC = () => {
  const s = useStrings();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const params = readAuthLinkParams(search);
  const [state, setState] = useState<State>(params ? 'working' : 'failed');
  const started = useRef(false);

  useEffect(() => {
    if (!params || started.current) return;
    started.current = true;
    (async () => {
      try {
        const { error } = await withTimeout(
          supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type }),
          REQUEST_TIMEOUT_MS,
          'confirm link',
        );
        if (error) {
          const status = (error as { status?: number }).status;
          setState(typeof status === 'number' && status >= 400 && status < 500 ? 'failed' : 'network');
          return;
        }
        // Recovery is handed to App's recovery branch by the auth event.
        if (params.type !== 'recovery') setState('confirmed');
      } catch (err) {
        setState(isRequestTimeout(err) ? 'timeout' : 'network');
      }
    })();
    // params is derived from the URL, which this screen never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'confirmed') return <Navigate to="/dashboard" replace />;

  if (state === 'working') {
    return (
      <AuthFrame title={s.authConfirmWorkingTitle}>
        <div data-auth-confirm="working" role="status" className="rounded-panel bg-surface-raised p-5 ring-1 ring-line">
          <IconTile icon={MailCheck} tone="success" size="lg" />
          <p className="mt-4 text-start text-sm leading-relaxed text-ink-secondary">{s.authConfirmWorkingBody}</p>
        </div>
      </AuthFrame>
    );
  }

  const body = state === 'timeout' ? s.requestTimedOut : state === 'network' ? s.authNetworkError : s.authConfirmFailedBody;
  return (
    <AuthFrame title={s.authConfirmFailedTitle}>
      <div data-auth-confirm={state} role="alert" className="rounded-panel bg-surface-raised p-5 ring-1 ring-line">
        <IconTile icon={MailX} tone="danger" size="lg" />
        <p className="mt-4 text-start text-sm leading-relaxed text-ink-secondary">{body}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="mt-6 text-sm font-semibold text-accent-text hover:underline"
        >
          {s.authBackToSignIn}
        </button>
      </div>
    </AuthFrame>
  );
};
