import React from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

// Post-payment celebration: the highest-emotion moment in the product.
// Deliberately a dismissible overlay rather than a toast — it can't be
// missed mid-load, and it holds the screen while the Paddle webhook
// flips the plan to PRO.
export const ProWelcome: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const s = useStrings();

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex justify-center items-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300"
      onClick={onClose}
      data-testid="pro-welcome"
    >
      <div
        className="w-full max-w-[420px] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-15">
            <div className="absolute top-[-20px] left-[-20px] w-40 h-40 rounded-full bg-white blur-3xl animate-pulse" />
            <div className="absolute bottom-[-20px] right-[-20px] w-40 h-40 rounded-full bg-emerald-300 blur-3xl animate-pulse" />
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/30">
              <Crown size={40} className="text-amber-300 fill-amber-300" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">{s.proWelcomeTitle}</h2>
          </div>
        </div>

        <div className="p-6 md:p-8 text-center">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
            {s.proWelcomeBody}
          </p>
          <button
            onClick={onClose}
            className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-base shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            {s.proWelcomeCta}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
