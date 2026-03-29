import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  User, 
  Settings, 
  CreditCard, 
  ShieldCheck, 
  Zap,
  ChevronRight,
  Info
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PaywallModal } from '../components/PaywallModal';

export const SettingsScreen = ({ t }: { t: any }) => {
  const { user } = useAuth();
  // Safe extraction with fallback to {} if context is missing
  const context = useOutletContext<{ plan?: 'FREE' | 'PRO', onSuccess?: () => void }>() || {};
  const { plan = 'FREE', onSuccess } = context;
  
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  const userName = user?.email?.split('@')[0] || 'User';

  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
          Workspace Settings
        </h1>
        <p className="text-lg font-bold text-slate-500 dark:text-slate-400">
          Manage your account, subscription, and preferences.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
        <div className="space-y-8">
          {/* Identity Card */}
          <section className="bg-white dark:bg-slate-800 rounded-[32px] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-500/20">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">
                  {userName}
                </h3>
                <p className="text-slate-500 font-bold">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <User className="text-slate-400" size={20} />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Account Type</span>
                </div>
                <span className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Personal Workspace</span>
              </div>
            </div>
          </section>

          {/* Billing Card */}
          <section className="bg-white dark:bg-slate-800 rounded-[32px] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-blue-50 dark:bg-blue-900/30 p-2.5 rounded-xl text-blue-600 dark:text-blue-400">
                <CreditCard size={20} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Subscription & Billing
              </h3>
            </div>

            {plan === 'PRO' ? (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-[24px] p-6 flex items-start gap-4">
                <div className="bg-emerald-500 p-2 rounded-lg text-white mt-1">
                  <ShieldCheck size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 className="font-black text-emerald-900 dark:text-emerald-400 mb-1">PRO Subscription Active</h4>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-500/80 leading-relaxed">
                    Your workspace is currently verified for unlimited document intelligence and priority extraction.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-[32px] p-8 text-center shadow-sm">
                <div className="inline-flex bg-blue-100 dark:bg-blue-900/30 p-4 rounded-3xl text-blue-600 dark:text-blue-400 mb-6 group-hover:scale-110 transition-transform">
                  <Zap size={32} strokeWidth={2.5} className="fill-blue-500" />
                </div>
                <h4 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Free Tier (Limited Access)</h4>
                <p className="text-slate-500 font-bold mb-6 max-w-[320px] mx-auto text-base">
                  Process more documents without limits and eliminate manual bottlenecks. Upgrade to PRO to keep your workflow fast, consistent, and interruption-free.
                </p>
                <div className="bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 p-5 rounded-r-2xl mb-8 max-w-[360px] mx-auto text-left">
                  <p className="text-amber-700 dark:text-amber-500 font-black text-sm leading-relaxed italic">
                    Free workspaces are limited to 10 document scans. Once the limit is reached, new uploads will be blocked until you upgrade.
                  </p>
                </div>
                <div className="space-y-3 mb-10 inline-block text-left mx-auto">
                   <div className="flex items-center gap-3 text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-tight">
                      <ShieldCheck size={16} className="text-blue-500" />
                      Unlimited document scans
                   </div>
                   <div className="flex items-center gap-3 text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-tight">
                      <ShieldCheck size={16} className="text-blue-500" />
                      High-volume batch uploads
                   </div>
                   <div className="flex items-center gap-3 text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-tight">
                      <ShieldCheck size={16} className="text-blue-500" />
                      Faster processing workflow
                   </div>
                </div>
                <button 
                  onClick={() => setIsPaywallOpen(true)}
                  className="btn btn-primary w-full py-4 rounded-2xl shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 flex items-center justify-center gap-2 group transition-all"
                >
                  Go PRO — Activate Unlimited Access
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
           <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-2xl shadow-slate-900/20 border border-slate-800">
              <div className="flex items-center gap-3 mb-6">
                 <Info size={20} className="text-blue-400" />
                 <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">System Information</h4>
              </div>
              <p className="text-sm font-bold text-slate-400 leading-relaxed mb-6">
                This is a v1 preview of your workspace controls. 
              </p>
              <div className="space-y-3 opacity-60">
                <div className="h-px bg-slate-800" />
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Coming Soon:</p>
                <ul className="text-xs font-bold text-slate-400 space-y-2">
                   <li>• Invoice history & PDF downloads</li>
                   <li>• Team member management</li>
                   <li>• API key generation</li>
                   <li>• Webhook configurations</li>
                </ul>
              </div>
           </div>
        </div>
      </div>

      <PaywallModal 
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
      />
    </div>
  );
};
