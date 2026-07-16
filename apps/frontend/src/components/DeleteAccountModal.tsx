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
      className="fixed inset-0 z-[11000] flex justify-center items-end sm:items-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300"
      onClick={isDeleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={s.deleteAccountWarningTitle}
      >
        <div className="bg-red-600 p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/30">
              <AlertTriangle size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase italic">
              {s.deleteAccountWarningTitle}
            </h2>
          </div>
          {!isDeleting && (
            <button
              onClick={onClose}
              aria-label={s.deleteAccountCancel}
              className="absolute top-2 right-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-all"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8 space-y-5">
          <p className="text-slate-600 dark:text-slate-400 font-bold leading-relaxed">
            {s.deleteAccountWarningBody}
          </p>

          {/* Store-subscription warning — required: deletion does not cancel billing. */}
          <div className="bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 p-4 rounded-r-2xl">
            <p className="text-amber-700 dark:text-amber-500 font-bold text-sm leading-relaxed">
              {s.deleteAccountSubscriptionWarning}
            </p>
          </div>

          <div>
            <label htmlFor="delete-confirm" className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2">
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
              className="w-full min-h-[44px] px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-red-500 disabled:opacity-60"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600 dark:text-red-400 font-bold text-sm">
              {translateAccountError(error, s)}
            </p>
          )}

          <div className="space-y-3">
            <button
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
              className="w-full min-h-[44px] bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-red-500/20 active:scale-[0.98] transition-all"
            >
              {isDeleting ? s.deleteAccountDeleting : s.deleteAccountConfirmButton}
            </button>
            {!isDeleting && (
              <button
                onClick={onClose}
                className="w-full min-h-[44px] text-slate-500 dark:text-slate-400 py-3 rounded-2xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
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
