import React from 'react';
import { HelpCircle } from 'lucide-react';

export const ClarificationCard = ({ message }: { message: string }) => (
  <div className="card border-amber-100 bg-amber-50/50 flex items-start gap-4">
    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
      <HelpCircle size={24} />
    </div>
    <div className="flex-1">
      <h3 className="text-sm font-bold text-amber-800 uppercase tracking-widest mb-1">Clarification Needed</h3>
      <p className="text-slate-700 font-medium leading-relaxed">{message}</p>
    </div>
  </div>
);
