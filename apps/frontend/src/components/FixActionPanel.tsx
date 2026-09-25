import React, { useState } from 'react';
import { documentService } from '../services/documentService';
import { useStrings } from '../i18n/useStrings';

type Props = {
  documentId: string;
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' | null;
  reason?: string;
  /** The document's own currency (the extracted total's), shown beside the
   *  amount field. Null when none was read: the field then carries no unit
   *  rather than a wrong one. The correction itself is stored without a
   *  currency, as before; the ledger reads it in the extracted total's. */
  currency?: string | null;
  onSuccess: () => void;
};

// The fix actions, rendered INSIDE the detail's "needs your attention" card
// (2026-09-25 redraw): no card of its own, no heading, the sentences the card
// already gives context to. What it WRITES is unchanged: the same three
// actions with the same payloads to documentService.applyFixAction. The
// amount field is a neutral DATA-CORRECTION input; nothing here reads as
// pricing, a checkout, or an upgrade.
export const FixActionPanel: React.FC<Props> = ({ documentId, decision, reason, currency = null, onSuccess }) => {
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
    } catch {
      // TWO defects lived on this line (audit #7 Class B, PR 3 of 3).
      //
      // 1. `err.message` rendered VERBATIM. It is always English and never a
      //    machine code: documentService.ts:114 throws
      //    `errorData.error || 'Failed to submit action'`, and the backend puts
      //    prose in `data.error` ('Document not found or access denied',
      //    'Unauthorized: Invalid or expired token', 'Internal Server Error',
      //    ...). A dropped connection adds TypeError('Failed to fetch').
      //
      // 2. The fallback was s.fixErrorJustification — the FORM-VALIDATION
      //    message from line 39, shown when the textarea is empty. As a
      //    fallback for a failed SERVER call it told a user who had filled the
      //    field in correctly to fill it in. The two uses are now distinct:
      //    line 39 keeps the validation string, this line reports the failure.
      //
      // s.toastUpdateError is the same string DocumentDetailScreen already
      // shows when a review-action update fails (DocumentDetailScreen.tsx:59) —
      // same operation, same document, no new copy.
      setError(s.toastUpdateError);
    } finally {
      setLoading(false);
    }
  };

  const primary = 'inline-flex min-h-[44px] items-center justify-center rounded-pill bg-accent px-6 text-sm font-bold text-surface-raised transition-colors hover:bg-accent-hover disabled:opacity-50';
  const secondary = 'inline-flex min-h-[44px] items-center justify-center rounded-pill bg-surface-muted px-6 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt disabled:opacity-50';

  return (
    <div className="mt-4 border-t border-divider pt-4 text-start" data-fix-actions>
      {isMissingAmount && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-secondary">{s.reviewActionDesc}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Input-group, not an overlay: the input and the unit are flex
                siblings, so the unit can never sit on top of the typed digits
                (any locale / font size / zoom). The whole group is LTR so the
                number and its trailing unit read left-to-right; the border and
                focus ring live on the wrapper via focus-within. */}
            <div
              dir="ltr"
              className="flex flex-1 items-center rounded-pill bg-surface-muted pe-4 transition-colors focus-within:ring-2 focus-within:ring-accent"
            >
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 ps-4 pe-2 text-ink outline-none placeholder:text-ink-faint"
              />
              {currency && <span className="flex-shrink-0 text-xs font-bold tracking-wide text-ink-muted">{currency}</span>}
            </div>
            <button onClick={() => handleAction('amount_corrected')} disabled={loading} className={primary}>
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
            className="min-h-[96px] w-full resize-none rounded-tile bg-surface-muted px-4 py-3 text-ink outline-none transition-colors focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => handleAction('marked_valid')} disabled={loading} className={`${primary} flex-1`}>
              {s.fixMarkValid}
            </button>
            <button onClick={() => handleAction('note_added')} disabled={loading} className={`${secondary} flex-1`}>
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
