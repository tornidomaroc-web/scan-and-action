import React from 'react';
import { Loader2 } from 'lucide-react';

// ============================================================================
// The one primary action of a screen: full width, 52px, the accent on the
// raised-surface ink (token on token, so both sides flip together in dark
// mode). `loading` swaps the label for the busy one and disables the button
// without changing its size, so nothing under it moves.
//
// The same shape as CaptureSheet's main action (rounded-btn, accent, quiet
// shadow), lifted out for the sign-in screens (2026-09-26).
// ============================================================================

export const primaryButtonClass =
  'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 text-[15px] font-semibold text-surface-raised shadow-card transition-all hover:bg-accent-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60';

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  /** The label while `loading`; the children are hidden meanwhile. */
  loadingLabel?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ loading = false, loadingLabel, disabled, children, className = '', ...rest }) => (
  <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={`${primaryButtonClass} ${className}`}>
    {loading ? (
      <>
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        {loadingLabel ?? children}
      </>
    ) : (
      children
    )}
  </button>
);
