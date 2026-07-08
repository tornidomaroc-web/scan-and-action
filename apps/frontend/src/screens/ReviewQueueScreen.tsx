import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CheckCircle, XCircle, FileText, ChevronRight } from 'lucide-react';
import { documentService } from '../services/documentService';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { useToast } from '../contexts/ToastContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getVendor, getAmount, getStatus, getDocTypeLabel } from '../lib/searchResultCard';
import { formatDateValue } from '../lib/formatCellValue';

// Review Queue, restyled onto the --sa-* token system (PR-D4).
//  - Calm flat surfaces (rounded-card, quiet shadow), token colors only (no raw
//    palette, no per-component dark-mode variants, no legacy table/card classes),
//    matching the D2 Search and D3 Detail pages.
//  - ONE status per row: a warning dot + "Needs review" via the SAME shared
//    getStatus() config as the Search card / Detail dot. Confidence is a SEPARATE
//    signal (percent + a short quality-tinted meter) so it never reads as a second
//    status. The old bespoke amber pill AND the ReviewBadge (which conflated the
//    two) are gone from this screen; ReviewBadge is untouched for D3 Detail.
//  - Vendor + amount are surfaced from the real payload through the SAME shared
//    helpers the Search card uses (getVendor / getAmount), so the three list
//    surfaces match. Missing values are omitted (never fabricated); the amount is
//    plain document data (tabular numerals), never styled as pricing.
//  - Mixed-direction values (file name, type, vendor, amount, date) are
//    bidi-isolated (dir/bdi) so Latin text and numerals do not scramble in Arabic
//    RTL; all physical spacing/alignment is logical (ps/pe, ms/me, start/end).

// Confidence quality signal: a plain percent + a short tinted meter. This is
// kept visually and semantically distinct from the lifecycle status. When a
// document has no confidence value we show a calm "not available", NEVER a
// fabricated number (the old hardcoded confidence fallback is gone).
const ConfidenceMeter = ({ value }: { value: number | null | undefined }) => {
  const s = useStrings();
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return <span className="text-sm font-medium text-ink-muted">{s.notAvailable}</span>;
  }
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  // Same success/warning/danger tiers as the shared confidence vocabulary.
  const tint = value < 0.7 ? 'bg-danger' : value < 0.9 ? 'bg-warning' : 'bg-success';
  return (
    <span className="inline-flex items-center gap-2">
      <span dir="ltr" className="text-sm font-semibold tabular-nums text-ink">{pct}%</span>
      <span className="inline-block h-1.5 w-16 overflow-hidden rounded-pill bg-surface-muted" aria-hidden="true">
        <span className={`block h-full rounded-pill ${tint}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
};

// Single lifecycle status: shared warning-dot styling + translated label (never
// the raw enum), identical to the Search card and Detail dot language.
const StatusDot = ({ doc }: { doc: any }) => {
  const s = useStrings();
  const status = getStatus(doc, s as any);
  if (!status) return <span className="text-xs font-medium text-ink-muted">{s.notAvailable}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${status.dot}`} />
      <span className={`truncate text-xs font-medium ${status.text}`}>{status.label}</span>
    </span>
  );
};

export const ReviewQueueScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { onSuccess } = useOutletContext<{ onSuccess: () => void }>();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { showToast } = useToast();

  const fetchQueue = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await documentService.getReviewQueue();
      setDocs(data);
    } catch (err: any) {
      setErrorMsg(s.queueFetchError);
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
      showToast(s.toastUpdateError, 'error');
    } finally {
      setActioningId(null);
    }
  };

  // Localize the row date to the active app language (null on empty/unparseable,
  // so the caller shows a calm placeholder — never a fabricated date).
  const formatDate = (value: unknown): string | null => formatDateValue(value, language);

  // The header (H1 + subtitle) renders in every state so the page title is stable
  // across loading / error / empty / list.
  const header = (
    <header className="mb-8">
      <h1 className="mb-1 text-title-lg font-semibold tracking-tight text-ink">{s.queue}</h1>
      <p className="text-sm text-ink-muted">{s.validationQueue}</p>
    </header>
  );

  let body: React.ReactNode;

  if (loading) {
    body = (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton h-24 rounded-card border border-line" />
        ))}
      </div>
    );
  } else if (errorMsg) {
    body = <ErrorState message={errorMsg} onRetry={fetchQueue} />;
  } else if (docs.length === 0) {
    body = (
      <div className="rounded-card border border-dashed border-line bg-surface py-16">
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

        {/* Mobile card list (< md). The desktop table's last-column actions are
            unreachable at phone widths, so every card is tappable and carries its
            own always-visible 44px actions. Carries the fuller layout (name, type,
            vendor, amount, date, confidence) for parity with the Search card. */}
        <div className="space-y-3 md:hidden">
          {docs.map((doc) => {
            const name = doc.originalFileName || doc.name;
            const vendor = getVendor(doc);
            const amount = getAmount(doc, language);
            const dateStr = formatDate(doc.uploadedAt);
            const typeLabel = getDocTypeLabel(doc.documentType, s as any);
            return (
              <article
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/documents/${doc.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/documents/${doc.id}`); }}
                className="cursor-pointer rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors active:bg-surface-alt"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink-faint">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink" dir="auto"><bdi>{name}</bdi></p>
                    {/* Type line: the real documentType mapped to a translated,
                        sentence-case label (shared getDocTypeLabel). Hidden entirely
                        when null (no placeholder, no guessed type). */}
                    {typeLabel && (
                      <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto"><bdi>{typeLabel}</bdi></p>
                    )}
                    {vendor && (
                      <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto"><bdi>{vendor}</bdi></p>
                    )}
                  </div>
                  {amount && (
                    <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-ink" dir="ltr"><bdi>{amount}</bdi></span>
                  )}
                  <ChevronRight size={16} className="flex-shrink-0 text-ink-fainter rtl:-scale-x-100" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-divider pt-3">
                  <StatusDot doc={doc} />
                  <span className="flex-shrink-0 text-xs text-ink-muted">
                    {dateStr ? <span dir="auto"><bdi>{dateStr}</bdi></span> : s.notAvailable}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-label font-medium text-ink-tertiary">{s.aiConfidence}</span>
                  <ConfidenceMeter value={doc.overallConfidence} />
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approve'); }}
                    disabled={actioningId === doc.id}
                    aria-label={`${s.approve} ${name}`}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-success text-sm font-semibold text-white transition-colors active:scale-[0.99] disabled:opacity-50"
                  >
                    <CheckCircle size={18} />
                    {s.approve}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'reject'); }}
                    disabled={actioningId === doc.id}
                    aria-label={`${s.reject} ${name}`}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-btn bg-danger text-sm font-semibold text-white transition-colors active:scale-[0.99] disabled:opacity-50"
                  >
                    <XCircle size={18} />
                    {s.reject}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop table (>= md), restyled onto tokens. */}
        <div className="hidden overflow-hidden rounded-card border border-line bg-surface-raised shadow-card md:block">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-divider bg-surface-alt">
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.documentSource}</th>
                <th className="px-6 py-3.5 text-end text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.amountLabel}</th>
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.processingStatus}</th>
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.aiConfidence}</th>
                <th className="px-6 py-3.5 text-start text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.extractedDate}</th>
                <th className="px-6 py-3.5 text-end text-label font-semibold uppercase tracking-wide text-ink-tertiary">{s.quickActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {docs.map((doc) => {
                const name = doc.originalFileName || doc.name;
                const vendor = getVendor(doc);
                const amount = getAmount(doc, language);
                const dateStr = formatDate(doc.uploadedAt);
                const typeLabel = getDocTypeLabel(doc.documentType, s as any);
                return (
                  <tr
                    key={doc.id}
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-surface-alt"
                  >
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink-faint">
                          <FileText size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink" dir="auto"><bdi>{name}</bdi></p>
                          {typeLabel && (
                            <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto"><bdi>{typeLabel}</bdi></p>
                          )}
                          {vendor && (
                            <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto"><bdi>{vendor}</bdi></p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end align-top">
                      {amount ? (
                        <span className="text-sm font-semibold tabular-nums text-ink" dir="ltr"><bdi>{amount}</bdi></span>
                      ) : (
                        <span className="text-sm text-ink-fainter" aria-label={s.notAvailable} title={s.notAvailable}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top"><StatusDot doc={doc} /></td>
                    <td className="px-6 py-4 align-top"><ConfidenceMeter value={doc.overallConfidence} /></td>
                    <td className="px-6 py-4 align-top text-sm text-ink-secondary">
                      {dateStr ? (
                        <span dir="auto"><bdi>{dateStr}</bdi></span>
                      ) : (
                        <span className="text-ink-muted">{s.notAvailable}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {/* Always visible: hover-revealed controls are invisible and
                          untappable on touch devices. */}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approve'); }}
                          disabled={actioningId === doc.id}
                          title={s.approve}
                          aria-label={`${s.approve} ${name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-success-text transition-colors hover:bg-success-tint disabled:opacity-50"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'reject'); }}
                          disabled={actioningId === doc.id}
                          title={s.reject}
                          aria-label={`${s.reject} ${name}`}
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
    <div className="animate-in fade-in duration-500">
      {header}
      {body}
    </div>
  );
};
