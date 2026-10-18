import React from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useBackDismiss } from '../native/useBackDismiss';
import { sheetClass } from './ui/Panel';
import { primaryButtonClass } from './ui/PrimaryButton';

// Post-payment celebration: the highest-emotion moment in the product.
// Deliberately a dismissible overlay rather than a toast — it can't be
// missed mid-load, and it holds the screen while the Paddle webhook
// flips the plan to PRO.
export const ProWelcome: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const s = useStrings();

  // Android back button dismisses the celebration (no-op on web). It's only
  // mounted while open, so it's always active.
  useBackDismiss(true, onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-celebration flex justify-center items-center bg-overlay backdrop-blur-md p-4 animate-in fade-in duration-300"
      onClick={onClose}
      data-testid="pro-welcome"
    >
      <div
        className={`w-full max-w-[420px] ${sheetClass} rounded-panel overflow-hidden animate-in zoom-in-95 duration-300`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-accent text-on-accent p-8 text-center relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-20 h-20 bg-accent-hover rounded-tile flex items-center justify-center mx-auto mb-4 shadow-pressed">
              <Crown size={40} fill="currentColor" aria-hidden="true" />
            </div>
            <h2 className="text-[1.375rem] font-semibold leading-tight tracking-tight">{s.proWelcomeTitle}</h2>
          </div>
        </div>

        <div className="p-6 md:p-8 text-center">
          <p className="text-[0.9375rem] font-medium text-ink-secondary leading-relaxed mb-6">
            {s.proWelcomeBody}
          </p>
          <button
            onClick={onClose}
            className={primaryButtonClass}
          >
            <Sparkles size={18} aria-hidden="true" />
            {s.proWelcomeCta}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
