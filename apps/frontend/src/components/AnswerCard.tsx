import React from 'react';
import { Sparkles, Clock } from 'lucide-react';

export const AnswerCard = ({ text, meta }: { text: string, meta?: any }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[32px] p-8 lg:p-10 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
    <div className="flex items-start gap-6">
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-[18px] flex items-center justify-center shrink-0 border border-blue-100/50 dark:border-blue-800/50">
          <Sparkles size={24} />
        </div>
        {meta && (
          <div className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-tighter vertical-text py-2">
            AI INSIGHT
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-black text-blue-600/70 dark:text-blue-400/70 uppercase tracking-[0.2em]">
            Executive Summary
          </h3>
          {meta && (
            <div className="flex items-center text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-100 dark:border-slate-800">
              <Clock size={12} className="mr-1.5 opacity-50" />
              {meta.executionTimeMs}ms Processing
            </div>
          )}
        </div>
        <div className="text-xl lg:text-2xl text-slate-900 dark:text-slate-100 leading-relaxed font-bold tracking-tight italic">
          "{text}"
        </div>
        
        <div className="mt-8 flex items-center gap-4">
           <div className="h-[2px] w-12 bg-blue-500/20 dark:bg-blue-400/20 rounded-full" />
           <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Synthesized from workspace data
           </p>
        </div>
      </div>
    </div>
  </div>
);
