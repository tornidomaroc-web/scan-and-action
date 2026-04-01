import React, { useState } from 'react';
import { documentService } from '../services/documentService';

type Props = {
  documentId: string;
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
  onSuccess: () => void;
};

export const FixActionPanel: React.FC<Props> = ({ documentId, decision, reason, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  if (!decision || decision === 'APPROVED') return null;

  const isMissingAmount = decision === 'NEEDS_REVIEW' && reason?.toLowerCase().includes('missing amount');
  const isFlagged = decision === 'FLAGGED';

  if (!isMissingAmount && !isFlagged) return null;

  const handleAction = async (actionType: 'amount_corrected' | 'marked_valid' | 'note_added') => {
    setError('');
    
    const payload: any = {};
    if (actionType === 'amount_corrected') {
      if (!amount) return setError('Please enter the correct amount');
      payload.amount = amount;
    } else {
      if (!justification) return setError('Please enter a justification or note');
      payload.justification = justification;
    }

    setLoading(true);
    try {
      await documentService.applyFixAction(documentId, actionType, payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-10 p-8 rounded-[32px] bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-8 bg-blue-500 rounded-full" />
        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Review Action Required</h3>
      </div>

      {isMissingAmount && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
            AI could not identify a clear total amount. Please verify the source and enter the correct numeric value below to proceed with categorization.
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1 group">
               <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-black group-focus-within:text-blue-500 transition-colors">$</span>
               <input
                 type="number"
                 placeholder="0.00"
                 value={amount}
                 onChange={(e) => setAmount(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl py-4 pl-10 pr-6 text-slate-900 dark:text-white font-black outline-none focus:border-blue-500 transition-all"
               />
            </div>
            <button
              onClick={() => handleAction('amount_corrected')}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-8 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-blue-600/20"
            >
              {loading ? 'Processing...' : 'Save Correction'}
            </button>
          </div>
        </div>
      )}

      {isFlagged && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
            This expense has been flagged for audit review. Please provide a brief business justification to mark it as valid or add a context note.
          </p>
          <textarea
            placeholder="E.g., Client dinner for project kickoff..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl py-4 px-6 text-slate-900 dark:text-white font-bold outline-none focus:border-blue-500 transition-all min-h-[100px] resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('marked_valid')}
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-emerald-600/20"
            >
              Mark as Valid
            </button>
            <button
              onClick={() => handleAction('note_added')}
              disabled={loading}
              className="flex-1 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:bg-slate-400 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 border border-slate-700"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-xs font-black text-red-500 uppercase tracking-widest animate-in slide-in-from-top-2">
          {error}
        </p>
      )}
    </div>
  );
};
