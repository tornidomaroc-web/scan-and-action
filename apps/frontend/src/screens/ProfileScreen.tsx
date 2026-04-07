import React from 'react';
import { User, Mail, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';

export const ProfileScreen: React.FC = () => {
  const s = useStrings();
  const { user } = useAuth();

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-10">
        <div className="w-20 h-20 rounded-[28px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xl font-black shadow-lg shadow-blue-100 dark:shadow-none rotate-3">
          {user?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">{s.profileTitle}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-bold text-lg">{s.profileDesc}</p>
        </div>
      </div>

      <div className="grid gap-8">
        <div className="saas-card dark:bg-slate-900">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-900 dark:text-white">
            <User size={24} className="text-blue-500" />
            {s.accountInfo}
          </h2>
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 pl-1">{s.emailAddress}</label>
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                <Mail size={18} className="text-slate-400 dark:text-slate-500" />
                <span className="text-slate-900 dark:text-slate-100 font-bold">{user?.email}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 pl-1">{s.accountId}</label>
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                <Shield size={18} className="text-slate-400 dark:text-slate-500" />
                <span className="text-slate-500 dark:text-slate-400 font-mono text-sm">{user?.id}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="saas-card bg-slate-50/50 dark:bg-slate-800/30 border-dashed border-2">
          <div className="text-center py-10">
            <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-2">{s.moreSettingsSoon}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Security, notifications, and subscription management are under development.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
