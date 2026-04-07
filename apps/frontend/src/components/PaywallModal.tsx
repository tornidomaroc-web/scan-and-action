import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, CheckCircle2, Crown, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Plan = 'monthly' | 'yearly';

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose }) => {
  const s = useStrings();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');

  if (!isOpen) return null;

  const handleUpgrade = () => {
    const email = user?.email || '';
    
    // Variant ID Mapping
    const variants = {
      monthly: 'b199b8bc-8a26-4bc2-b6b7-ed7b4c6a6c16',
      yearly: 'ff283ed2-aeeb-4027-b102-38ee70fab31f'
    };

    const variantId = variants[selectedPlan];
    const checkoutUrl = `https://jadtrader.lemonsqueezy.com/checkout/buy/${variantId}?checkout[email]=${encodeURIComponent(email)}`;

    window.open(checkoutUrl, '_blank');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex justify-center items-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div className="bg-blue-600 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute top-[-20px] left-[-20px] w-40 h-40 rounded-full bg-white blur-3xl animate-pulse" />
            <div className="absolute bottom-[-20px] right-[-20px] w-40 h-40 rounded-full bg-white blur-3xl animate-pulse" />
          </div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/30">
              <Zap size={32} className="text-white fill-white" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase italic">
              Upgrade to PRO
            </h2>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-slate-600 dark:text-slate-400 font-bold text-center mb-8 leading-relaxed">
            Unlock the full power of Scan & Action. <span className="text-slate-900 dark:text-white">PRO</span> gives you the ultimate productivity workflow.
          </p>

          {/* Plan Selection */}
          <div className="mb-8">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Star size={14} className="fill-slate-400 dark:fill-slate-500" />
              Choose your plan
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Monthly Plan */}
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`flex flex-col p-4 rounded-2xl border-2 text-left transition-all relative ${selectedPlan === 'monthly'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 shadow-lg shadow-blue-500/5'
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
              >
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-tight mb-1">Monthly</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white italic">$9<span className="text-sm font-bold opacity-50">/mo</span></span>
              </button>

              {/* Yearly Plan */}
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`flex flex-col p-4 rounded-2xl border-2 text-left transition-all relative ${selectedPlan === 'yearly'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 shadow-lg shadow-blue-500/5 ring-4 ring-blue-500/10'
                  : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
              >
                <div className="absolute top-[-10px] right-2 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg">
                  Save 45%
                </div>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight mb-1 flex items-center gap-1">
                  Yearly <Star size={10} className="fill-emerald-500" />
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white italic">$59<span className="text-sm font-bold opacity-50">/yr</span></span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">Best Value</span>
              </button>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-3 mb-8">
            {[
              "Unlimited Document Scans",
              "Upload multiple files at once",
              "Faster processing workflow",
              "Export your data (CSV)"
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </div>
                <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight italic">
                  {feature}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleUpgrade}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group"
            >
              <Crown size={20} fill="white" className="group-hover:rotate-12 transition-transform" />
              Upgrade Now - {selectedPlan === 'monthly' ? '$9/mo' : '$59/yr'}
            </button>
            <button
              onClick={onClose}
              className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-2 rounded-xl font-bold text-sm transition-all"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
