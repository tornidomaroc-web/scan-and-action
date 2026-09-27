import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2 } from 'lucide-react';
import { useStrings } from '../../i18n/useStrings';
import {
  SocialSignInCancelled,
  signInWithSocial,
  socialConfigFromEnv,
  socialProvidersFor,
  type SocialProvider,
} from '../../lib/socialAuth';

// ============================================================================
// The "Continue with Apple / Google" buttons under the sign-in form.
//
// BOTH WHITE, BOTH THE SAME SIZE. Apple's HIG allows a white, a white-outlined
// or a black button and asks that it be no smaller than any other sign-in
// button; Google's branding page allows a light, dark or neutral theme and
// asks that its button be at least as prominent as other third-party options.
// On the always-dark sign-in page the two white variants are the ones that
// read, so both use vendor-specified literals rather than the app's tokens:
// Google light theme is #FFFFFF fill, #747775 stroke, #1F1F1F text; Apple's
// white button is a black logo and a black title on white. The height is the
// PrimaryButton's 52px so the three buttons on the screen are one size.
//
// TITLES are the vendors' allowed forms ("Continue with ..."), translated;
// both allow localisation. The vendor names themselves are not translated.
//
// WHICH BUTTONS appear is lib/socialAuth.ts's decision (socialProvidersFor):
// Apple and Google on iOS, Google on Android and the web.
// ============================================================================

const GoogleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#000000" d="M16.37 12.73c-.02-2.35 1.92-3.48 2.01-3.54-1.1-1.6-2.8-1.82-3.4-1.85-1.45-.15-2.83.85-3.56.85-.74 0-1.87-.83-3.08-.81-1.58.02-3.04.92-3.86 2.34-1.65 2.86-.42 7.09 1.18 9.41.79 1.14 1.72 2.41 2.94 2.36 1.18-.05 1.63-.76 3.06-.76 1.42 0 1.83.76 3.08.74 1.27-.02 2.08-1.16 2.86-2.3.9-1.32 1.27-2.6 1.29-2.66-.03-.01-2.48-.95-2.52-3.78zM14.03 5.8c.65-.79 1.09-1.88.97-2.97-.94.04-2.07.62-2.74 1.41-.6.7-1.13 1.81-.99 2.88 1.05.08 2.11-.53 2.76-1.32z" />
  </svg>
);

const LABEL_KEY: Record<SocialProvider, 'authContinueWithApple' | 'authContinueWithGoogle'> = {
  apple: 'authContinueWithApple',
  google: 'authContinueWithGoogle',
};

export interface SocialSignInProps {
  /** Receives a catalog string to show; null clears the screen's error. */
  onError: (message: string | null) => void;
  /** Injected by tests; the app reads the platform from Capacitor. */
  platform?: string;
}

export const SocialSignIn: React.FC<SocialSignInProps> = ({ onError, platform = Capacitor.getPlatform() }) => {
  const s = useStrings();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const providers = socialProvidersFor(platform, socialConfigFromEnv());

  if (providers.length === 0) return null;

  const start = async (provider: SocialProvider) => {
    onError(null);
    setBusy(provider);
    try {
      await signInWithSocial(provider);
    } catch (err) {
      // A dismissed sheet is not an error the person needs to read.
      if (!(err instanceof SocialSignInCancelled)) onError(s.authSocialError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-social-sign-in className="mt-4 space-y-3">
      <div className="flex items-center gap-3 text-xs font-medium text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        {s.authOrDivider}
        <span className="h-px flex-1 bg-line" />
      </div>
      {providers.map((provider) => {
        const Mark = provider === 'apple' ? AppleMark : GoogleMark;
        const loading = busy === provider;
        return (
          <button
            key={provider}
            type="button"
            data-social-provider={provider}
            onClick={() => void start(provider)}
            disabled={busy !== null}
            aria-busy={loading || undefined}
            className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-btn bg-[#FFFFFF] px-5 text-[15px] font-semibold text-[#1F1F1F] ring-1 ring-[#747775] transition-all hover:bg-[#F2F2F2] active:scale-[0.98] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Mark />}
            {s[LABEL_KEY[provider]]}
          </button>
        );
      })}
    </div>
  );
};
