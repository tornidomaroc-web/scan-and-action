import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';
import { accountService } from '../services/accountService';
import { translateAccountError } from '../lib/accountErrors';
import { useBackDismiss } from '../native/useBackDismiss';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the account is deleted and the user is signed out. */
  onDeleted: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ isOpen, onClose, onDeleted }) => {
  const s = useStrings();
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  // Holds the RAW error code, not display text — translated at the render site
  // below, mirroring UploadModal (:155 raw -> :335 translated).
  const [error, setError] = useState<string | null>(null);

  // Mirror PaywallModal: let the native hardware back button dismiss the modal.
  useBackDismiss(isOpen && !isDeleting, onClose);

  if (!isOpen) return null;

  const email = (user?.email || '').trim();
  // Type-to-confirm: the user must type their own email exactly (case-insensitive).
  // Works for every auth method (password, OAuth, magic-link) since it needs no
  // password. The valid session is still required by the backend.
  const canDelete = !!email && confirmText.trim().toLowerCase() === email.toLowerCase();

  const handleDelete = async () => {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await accountService.deleteAccount(confirmText.trim());
      // Account is gone — clear the local session and hand back to the caller,
      // which routes to the login screen.
      await signOut().catch(() => {});
      onDeleted();
    } catch (err: any) {
      // Raw code in, raw code stored. translateAccountError absorbs anything
      // that is not a known code, so nothing the server said can reach the DOM.
      setError(err?.message || 'DELETE_FAILED');
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-modal-top flex justify-center items-end sm:items-center bg-overlay backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300"
      onClick={isDeleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-[480px] bg-surface-raised rounded-t-card sm:rounded-card shadow-lg overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 border border-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={s.deleteAccountWarningTitle}
      >
        {/*
          Destructive header on the QUIET danger idiom (ErrorState.tsx:17-21):
          danger-tint surface + danger/30 border + danger/15 icon tile +
          danger-text heading. NOT `bg-danger` behind `text-white` — --sa-danger
          is a semantic text/icon token that flips to a LIGHT red in dark mode
          (tokens.css:133 -> #F87171), so a white-on-danger fill computes to
          3.86:1 light / 2.77:1 dark, FAILING WCAG AA against the previous
          bg-red-600 (4.83:1). This treatment measures 5.17:1 light / 6.97:1
          dark. d8bModalRestyle.test.tsx locks the trap closed.
        */}
        <div className="bg-danger-tint border-b border-danger/30 p-6 sm:p-8 text-center relative">
          <div className="w-16 h-16 bg-danger/15 text-danger rounded-btn flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-title-lg font-semibold text-danger-text tracking-tight">
            {s.deleteAccountWarningTitle}
          </h2>
          {!isDeleting && (
            <button
              onClick={onClose}
              aria-label={s.deleteAccountCancel}
              className="absolute top-2 end-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink rounded-pill hover:bg-surface-muted transition-all"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8 space-y-5">
          <p className="text-sm leading-relaxed text-ink-secondary">
            {s.deleteAccountWarningBody}
          </p>

          {/*
            Store-subscription warning — REQUIRED: deletion does not cancel
            billing, and users must be told where to cancel. Guarded in BOTH
            directions by nativeAntiSteering.test.tsx (it must not steer, and it
            must not disappear). Do not remove it in a restyle.

            The accent bar is LOGICAL (border-s-4 / rounded-e-card, the
            SearchScreen.tsx:204 idiom): as `border-l-4 ... rounded-r-2xl` it
            pinned to the physical left and landed on the TRAILING edge in
            Arabic — on the one element that is a compliance disclosure.

            Body copy is `text-ink-secondary`, per ClarificationCard.tsx:16 —
            NOT `text-warning-text`, which measures only 3.61:1 on the warning
            tint and would REGRESS today's 4.84:1. This reads 5.22:1 / 7.80:1.
          */}
          <div className="bg-warning-tint border-s-4 border-warning p-4 rounded-e-card">
            <p className="text-sm leading-relaxed text-ink-secondary">
              {s.deleteAccountSubscriptionWarning}
            </p>
          </div>

          <div>
            <label htmlFor="delete-confirm" className="block text-label font-semibold text-ink-tertiary mb-2">
              {s.deleteAccountConfirmLabel}
            </label>
            <input
              id="delete-confirm"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              disabled={isDeleting}
              className="w-full min-h-[44px] px-4 py-3 rounded-btn border border-line bg-surface text-ink font-medium focus:outline-none focus:border-danger disabled:opacity-60"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {translateAccountError(error, s)}
            </p>
          )}

          <div className="space-y-3">
            {/*
              Destructive primary. Tinted fill + danger border + danger-text
              (5.17:1 light / 6.97:1 dark), not a saturated fill: there is no
              on-danger token, and `bg-danger` + `text-white` measures 2.77:1 in
              dark. A saturated destructive button would need a sourced
              --sa-danger-solid/--sa-on-danger pair — a design decision, not a
              restyle one. `bg-accent` (4.70:1) is the only safe solid fill, but
              indigo would strip the danger signal from an irreversible action.
            */}
            <button
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
              className="w-full min-h-[44px] border border-danger bg-danger-tint text-danger-text hover:bg-danger/15 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-btn font-semibold shadow-card active:scale-[0.98] transition-all"
            >
              {isDeleting ? s.deleteAccountDeleting : s.deleteAccountConfirmButton}
            </button>
            {!isDeleting && (
              <button
                onClick={onClose}
                className="w-full min-h-[44px] text-ink-tertiary py-3 rounded-btn font-medium hover:bg-surface-muted transition-all"
              >
                {s.deleteAccountCancel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
