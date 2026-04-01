import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

type Props = {
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
};

export const DecisionBanner: React.FC<Props> = ({ decision, reason }) => {
  if (!decision) return null;

  const config = {
    FLAGGED: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-100 dark:border-red-900/30',
      text: 'text-red-900 dark:text-red-100',
      accent: 'text-red-600 dark:text-red-400',
      icon: <AlertTriangle size={24} />,
      title: 'Flagged Expense',
      subtitle: 'This expense may be suspicious or violate rules',
    },
    NEEDS_REVIEW: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-100 dark:border-yellow-900/30',
      text: 'text-yellow-900 dark:text-yellow-100',
      accent: 'text-yellow-600 dark:text-yellow-400',
      icon: <AlertTriangle size={24} />,
      title: 'Needs Review',
      subtitle: 'This expense requires your attention',
    },
    APPROVED: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-100 dark:border-emerald-900/30',
      text: 'text-emerald-900 dark:text-emerald-100',
      accent: 'text-emerald-600 dark:text-emerald-400',
      icon: <CheckCircle size={24} />,
      title: 'Approved',
      subtitle: 'No issues detected',
    },
  };

  const current = config[decision];
  if (!current) return null;

  return (
    <div className={`mb-10 p-6 rounded-3xl border-2 ${current.bg} ${current.border} shadow-lg shadow-slate-200/20 dark:shadow-none animate-in fade-in slide-in-from-top-4 duration-500`}>
      <div className="flex items-start gap-4">
        <div className={`mt-1 ${current.accent}`}>
          {current.icon}
        </div>
        <div className="flex-1">
          <h3 className={`text-xl font-black tracking-tight mb-1 ${current.text}`}>
            {current.title}
          </h3>
          <p className={`text-sm font-bold opacity-80 mb-3 ${current.text}`}>
            {current.subtitle}
          </p>
          {reason && (
            <div className={`pt-3 border-t border-current/10 ${current.text}`}>
              <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">Findings rationale</p>
              <p className="text-sm font-medium leading-relaxed">{reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
