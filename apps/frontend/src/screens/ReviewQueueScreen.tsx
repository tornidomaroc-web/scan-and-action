import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { DocumentIcon } from '../components/ui/DocumentIcon';
import { CountChip } from '../components/ui/CountChip';
import { panelClass } from '../components/ui/Panel';
import { getDocumentCategory } from '../lib/documentCategory';
import { documentService } from '../services/documentService';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getVendor, getStatus, getDocTypeLabel } from '../lib/searchResultCard';
import { ledgerAmount } from '../lib/ledgerAmount';
import { fullDayLabel, moneyParts, Lang } from '../lib/ledgerView';
import { isIdentityConflict } from '../lib/identityConflict';
import { isRequestTimeout } from '../lib/fetchWithTimeout';

// ============================================================================
// The review queue, its card on the rules of the receipt screen (2026-09-26).
//
// Each card is the receipt as Detail shows it: the category circle, the
// merchant as the title (the file name only when no merchant was read), one
// meta line (category, type, the date printed on the receipt, or the day it
// was added when none was), the amount the ledger counts (lib/ledgerAmount,
// a correction beats the extraction), ONE status chip, and Approve / Reject.
// Gone with the redraw: the file name as the title, the "AI confidence"
// percentage and its bar, and the subtitle under the heading, which Detail
// had already dropped.
//
// The logic (fetch, approve, reject, the lockout, the toasts) is the one from
// before, line for line; reviewQueueActions.test.tsx and
// reviewQueueLockout.test.tsx hold it. The Approve / Reject buttons keep the
// file name in their aria-label: it is the one name every document has.
// ============================================================================

/** The same reading of a status as Detail: one chip, in the status's tone. */
const statusTone = (key?: string) =>
  key === 'NEEDS_REVIEW' ? 'warning' : key === 'REJECTED' || key === 'FAILED' ? 'danger' : key === 'COMPLETED' ? 'success' : 'neutral';

export const ReviewQueueScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const lang = language as Lang;
  const navigate = useNavigate();
  const { onSuccess } = useOutletContext<{ onSuccess: () => void }>();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // IDENTITY_EMAIL_CONFLICT is a property of the SESSION, not of this endpoint:
  // authMiddleware raises it before any route handler runs. It is terminal —
  // clearing it is an operator action against an orphaned row — so the screen
  // must stop offering a retry that cannot succeed (lib/identityConflict.ts:15-18).
  const [locked, setLocked] = useState(false);
  const { showToast } = useToast();

  const fetchQueue = async () => {
    setLoading(true);
    setErrorMsg('');
    // Clear any previous lock rather than leaving a stale one behind.
    setLocked(false);
    try {
      const data = await documentService.getReviewQueue();
      setDocs(data);
    } catch (err: any) {
      // By EXACT code, never by status (lib/identityConflict.ts:20-22). A bare 409
      // with no code — a proxy's conflict page, a future unrelated 409 — is NOT
      // this condition and keeps the ordinary retryable treatment below.
      const lockedNow = isIdentityConflict(err);
      setLocked(lockedNow);
      setErrorMsg(lockedNow ? s.accountLockedBody : isRequestTimeout(err) ? s.requestTimedOut : s.queueFetchError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    if (actioningId) return; // Prevent double-clicks

    setActioningId(id);
    try {
      // Approve = COMPLETED, Reject = REJECTED
      const newStatus = action === 'approve' ? 'COMPLETED' : 'REJECTED';

      await documentService.updateStatus(id, newStatus);

      // Only remove from UI after successful backend update
      setDocs(prev => prev.filter(d => d.id !== id));

      showToast(action === 'approve' ? s.toastApproved : s.toastRejected, action === 'approve' ? 'success' : 'info');

      // Refresh Dashboard stats
      onSuccess();
    } catch (error) {
      console.error('[ReviewQueue] Action failed:', error);
      // On a lockout the toast is SUPPRESSED and the screen switches instead.
      // A toast vanishes after a few seconds; the condition is permanent, so a
      // disappearing message invites the next tap — the exact harm this work
      // exists to stop. accountLockedBody also ends in the support address,
      // which is the only exit on native: text a user cannot re-read, select or
      // copy is not an exit. And if the session is locked, this action is not
      // the only thing broken — every path on this screen is, which is what the
      // full-body ErrorState says and a toast does not.
      //
      // This is not a silent disappearance: setting errorMsg replaces the entire
      // body below, so the list the user was looking at is gone and replaced.
      // Every OTHER failure keeps its toast, unchanged.
      if (isIdentityConflict(error)) {
        setLocked(true);
        setErrorMsg(s.accountLockedBody);
      } else {
        showToast(s.toastUpdateError, 'error');
      }
    } finally {
      setActioningId(null);
    }
  };

  /** What one card shows, read as Detail reads it. */
  const readRow = (doc: any) => {
    const name: string = doc.originalFileName || doc.name;
    const merchant = getVendor(doc);
    const category = getDocumentCategory(doc);
    const typeLabel = getDocTypeLabel(doc.documentType, s as any);
    const amount = ledgerAmount(doc.facts);
    const money = amount ? moneyParts(amount.amount, amount.currency, lang) : null;
    // The date on the receipt, as the ledger dates it; the day it was added
    // only when none was read, and then the line says so (the same copy as
    // Home and Detail).
    const printed = doc.facts?.find((f: any) => f.key === 'TRANSACTION_DATE' && f.valueDate)?.valueDate ?? null;
    const dateText = printed
      ? fullDayLabel(printed, lang)
      : doc.uploadedAt ? s.ledgerNoDate.replace('{day}', fullDayLabel(doc.uploadedAt, lang, 'local')) : null;
    const meta = [category ? (s as any)[`cat${category}`] : null, typeLabel, dateText].filter(Boolean) as string[];
    const status = getStatus(doc, s as any);
    return { name, title: merchant ?? name, meta, money, amount, status };
  };

  // The heading renders in every state so the page title is stable across
  // loading / error / empty / list.
  const header = (
    <header className="mb-6">
      <h1 className="text-title-lg font-semibold tracking-tight text-ink">{s.queue}</h1>
    </header>
  );

  let body: React.ReactNode;

  if (loading) {
    body = (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton h-28 rounded-panel" />
        ))}
      </div>
    );
  } else if (errorMsg) {
    // Locked: the title stops claiming an unspecified fault, and onRetry is
    // omitted so ErrorState renders NO button at all (components/ErrorState.tsx:23).
    // The non-locked branch is unchanged, title included (it renders the
    // translated s.somethingWrong default).
    body = locked ? (
      <ErrorState title={s.accountLockedTitle} message={errorMsg} />
    ) : (
      <ErrorState message={errorMsg} onRetry={fetchQueue} />
    );
  } else if (docs.length === 0) {
    body = (
      <div className={`${panelClass} py-6`}>
        <EmptyState
          message={s.allCaughtUp}
          description={s.allCaughtUpDesc}
          icon={<CheckCircle size={26} className="text-success-text" />}
        />
      </div>
    );
  } else {
    body = (
      <>
        {/* Quiet note: the backend caps the queue at 50 with no pagination. Only
            shown when we are actually at the cap, so it never misleads. */}
        {docs.length >= 50 && (
          <p className="mb-4 text-xs text-ink-muted">{s.queueFirstFifty}</p>
        )}

        {/* Phone: one card per receipt, tappable, with its own always-visible
            44px actions (a desktop row's end-column actions are unreachable at
            phone widths). */}
        <div className="space-y-3 md:hidden">
          {docs.map((doc) => {
            const row = readRow(doc);
            return (
              <article
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/documents/${doc.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/documents/${doc.id}`); }}
                className={`cursor-pointer p-4 transition-colors active:bg-surface-alt motion-reduce:transition-none ${panelClass}`}
                data-queue-card={doc.id}
              >
                <div className="flex items-start gap-3">
                  <DocumentIcon doc={doc} size="sm" />
                  <div className="min-w-0 flex-1">
                    {/* No <bdi> on a TRUNCATING box: the isolate hides the text from
                        dir="auto", which then falls back to LTR and clips the leading
                        (identifying) end of an Arabic name. The value is the sole
                        content of the block, so the block already isolates it. */}
                    <p className="truncate text-[15px] font-semibold text-ink" dir="auto" data-queue-title>{row.title}</p>
                    {row.meta.length > 0 && (
                      <p className="mt-0.5 truncate text-xs font-medium text-ink-muted" dir="auto" data-queue-meta>
                        {row.meta.map((part, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span aria-hidden="true"> · </span>}
                            <span>{part}</span>
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                  </div>
                  {row.money && (
                    // dir="ltr" with NO isolate. <bdi> is by definition an isolate
                    // whose direction is auto, so it re-runs the detection this pin
                    // exists to override (currencyBidiDirection.test.tsx). The
                    // number and the code are the ledger's parts, never a summed or
                    // converted figure.
                    <span className="flex-shrink-0 text-[15px] font-bold tabular-nums text-ink" dir="ltr" data-queue-amount>
                      {row.money.number} <span className="text-xs font-bold text-ink-muted">{row.money.code ?? s.ledgerNoCurrency}</span>
                      {row.amount?.source === 'corrected' && <CountChip className="ms-1.5 align-middle">{s.ledgerCorrectedTag}</CountChip>}
                    </span>
                  )}
                  <ChevronRight size={16} className="flex-shrink-0 text-ink-fainter rtl:-scale-x-100" aria-hidden="true" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-divider pt-3">
                  {row.status ? (
                    <CountChip tone={statusTone(row.status.key)} data-queue-status className="max-w-full">
                      <span className="truncate">{row.status.label}</span>
                    </CountChip>
                  ) : (
                    <span className="text-xs font-medium text-ink-muted">{s.notAvailable}</span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approve'); }}
                    disabled={actioningId === doc.id}
                    aria-label={`${s.approve} ${row.name}`}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-success-tint text-sm font-semibold text-success-text ring-1 ring-line transition-colors hover:ring-success active:scale-[0.99] motion-reduce:transition-none disabled:opacity-50"
                  >
                    <CheckCircle size={18} />
                    {s.approve}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'reject'); }}
                    disabled={actioningId === doc.id}
                    aria-label={`${s.reject} ${row.name}`}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-danger-tint text-sm font-semibold text-danger-text ring-1 ring-line transition-colors hover:ring-danger active:scale-[0.99] motion-reduce:transition-none disabled:opacity-50"
                  >
                    <XCircle size={18} />
                    {s.reject}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop table (>= md): the same reading, one row per receipt. */}
        <div className={`hidden overflow-hidden md:block ${panelClass}`}>
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-divider bg-surface-alt">
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.documentSource}</th>
                <th className="px-6 py-3.5 text-end text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.amountLabel}</th>
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.processingStatus}</th>
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.extractedDate}</th>
                <th className="px-6 py-3.5 text-end text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.quickActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {docs.map((doc) => {
                const row = readRow(doc);
                const dateText = row.meta[row.meta.length - 1];
                return (
                  <tr
                    key={doc.id}
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-surface-alt motion-reduce:transition-none"
                  >
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-3">
                        <DocumentIcon doc={doc} />
                        <div className="min-w-0">
                          {/* dir="auto" must sit on the truncating element with no
                              <bdi> isolate inside it — see the card above. */}
                          <p className="truncate text-sm font-semibold text-ink" dir="auto">{row.title}</p>
                          {row.meta.length > 1 && (
                            <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto">{row.meta.slice(0, -1).join(' · ')}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end align-top">
                      {row.money ? (
                        <span className="text-sm font-semibold tabular-nums text-ink" dir="ltr">
                          {row.money.number} <span className="text-xs font-semibold text-ink-muted">{row.money.code ?? s.ledgerNoCurrency}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-ink-fainter" aria-label={s.notAvailable} title={s.notAvailable}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {row.status ? <CountChip tone={statusTone(row.status.key)}>{row.status.label}</CountChip> : <span className="text-xs font-medium text-ink-muted">{s.notAvailable}</span>}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-ink-secondary">
                      {dateText ? <span dir="auto"><bdi>{dateText}</bdi></span> : <span className="text-ink-muted">{s.notAvailable}</span>}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {/* Always visible: hover-revealed controls are invisible and
                          untappable on touch devices. */}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approve'); }}
                          disabled={actioningId === doc.id}
                          title={s.approve}
                          aria-label={`${s.approve} ${row.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-success-text transition-colors hover:bg-success-tint disabled:opacity-50"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'reject'); }}
                          disabled={actioningId === doc.id}
                          title={s.reject}
                          aria-label={`${s.reject} ${row.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-danger-text transition-colors hover:bg-danger-tint disabled:opacity-50"
                        >
                          <XCircle size={20} />
                        </button>
                        <ChevronRight size={16} className="ms-1 flex-shrink-0 text-ink-fainter rtl:-scale-x-100" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 motion-reduce:animate-none">
      {header}
      {body}
    </div>
  );
};
