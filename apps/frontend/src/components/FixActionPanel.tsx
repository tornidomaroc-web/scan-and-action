import React, { useState } from 'react';
import { documentService } from '../services/documentService';
import { useStrings } from '../i18n/useStrings';

type Props = {
  documentId: string;
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
  onSuccess: () => void;
};

// Correction panel for documents the rule engine could not resolve, restyled
// onto the --sa-* tokens with all copy moved to i18n (three locales). The amount
// field is a neutral DATA-CORRECTION input: it carries a plain MAD unit label,
// never a currency/price affordance, and nothing here reads as pricing, a
// checkout, or an upgrade. The unit stays on the logical end so it mirrors in RTL.
export const FixActionPanel: React.FC<Props> = ({ documentId, decision, reason, onSuccess }) => {
  const s = useStrings();
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
      if (!amount) return setError(s.fixErrorAmount);
      payload.amount = amount;
    } else {
      if (!justification) return setError(s.fixErrorJustification);
      payload.justification = justification;
    }

    setLoading(true);
    try {
      await documentService.applyFixAction(documentId, actionType, payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || s.fixErrorJustification);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-card border border-dashed border-line-strong bg-surface-raised p-5 text-start">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-5 w-1 flex-shrink-0 rounded-pill bg-accent" />
        <h3 className="text-section font-semibold text-ink">{s.reviewActionRequired}</h3>
      </div>

      {isMissingAmount && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-secondary">{s.reviewActionDesc}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                className="w-full rounded-btn border border-line bg-surface py-3 ps-4 pe-16 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-faint">
                {s.madUnit}
              </span>
            </div>
            <button
              onClick={() => handleAction('amount_corrected')}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? s.fixProcessing : s.saveCorrection}
            </button>
          </div>
        </div>
      )}

      {isFlagged && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-secondary">{s.fixFlaggedDesc}</p>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="min-h-[100px] w-full resize-none rounded-btn border border-line bg-surface px-4 py-3 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => handleAction('marked_valid')}
              disabled={loading}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-btn bg-success px-6 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            >
              {s.fixMarkValid}
            </button>
            <button
              onClick={() => handleAction('note_added')}
              disabled={loading}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-btn border border-line bg-surface px-6 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt disabled:opacity-50"
            >
              {s.fixSaveNote}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm font-medium text-danger-text">{error}</p>
      )}
    </div>
  );
};
