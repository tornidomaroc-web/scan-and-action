import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft, RefreshCw } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { DocumentIcon } from '../components/ui/DocumentIcon';
import { CountChip } from '../components/ui/CountChip';
import { panelClass } from '../components/ui/Panel';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getStatus } from '../lib/searchResultCard';
import { getDocumentCategory } from '../lib/documentCategory';
import { isIdentityConflict } from '../lib/identityConflict';
import { formatDateValue } from '../lib/formatCellValue';
import { formatCount } from '../lib/formatNumber';

// Every document, newest first, on the ledger home's visual language: one
// grouped Panel of rows, each with its category tile (or a neutral document
// tile when no category was read), the name, the date and the category name,
// and the status. The count is a CountChip in the header.
export const ActivityScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // IDENTITY_EMAIL_CONFLICT is a property of the SESSION, not of this endpoint:
  // authMiddleware raises it before any route handler runs. It is terminal —
  // clearing it is an operator action against an orphaned row — so the screen
  // must stop offering a retry that cannot succeed (lib/identityConflict.ts:15-18).
  const [locked, setLocked] = useState(false);

  const fetchActivity = async () => {
    setLoading(true);
    // Clear any previous lock rather than leaving a stale one behind.
    setLocked(false);
    try {
      const data = await documentService.getAllActivity();
      setActivity(data);
      setError(null);
    } catch (err: any) {
      // Logged on EVERY branch, the lockout included, and deliberately so.
      // Not because the line is a durable trace — it is not: console breadcrumbs
      // are off at the SDK (sentry.ts:57, `breadcrumbsIntegration({ console:
      // false })`), so this never leaves the browser and dies with the tab.
      // It is kept because suppressing it would mean ADDING a branch to buy
      // nothing, and because a lockout on a plain read is the anomaly worth
      // seeing in a live session with DevTools open. `err.message` here is the
      // bare server code, so there is no PII in it either way.
      console.error('[Activity] Fetch failed:', err);
      // By EXACT code, never by status (lib/identityConflict.ts:20-22). A bare 409
      // with no code — a proxy's conflict page, a future unrelated 409 — is NOT
      // this condition and keeps the ordinary retryable treatment below.
      const lockedNow = isIdentityConflict(err);
      setLocked(lockedNow);
      setError(lockedNow ? s.accountLockedBody : s.failedActivity);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-xl animate-pulse" aria-busy="true" aria-label={s.loadingActivity}>
        <div className="h-3.5 w-24 rounded-pill bg-line" />
        <div className="mt-3 h-7 w-48 rounded-btn bg-line" />
        <div className={`mt-6 h-[264px] ${panelClass}`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl py-12">
        {locked ? (
          // onRetry omitted, so ErrorState renders NO button at all
          // (components/ErrorState.tsx:24). Activity has ONE failure surface and
          // no toast, so replacing the body is the whole adoption here.
          <ErrorState title={s.accountLockedTitle} message={error} />
        ) : (
          // No title prop: ErrorState renders its translated default (s.somethingWrong).
          <ErrorState message={error} onRetry={fetchActivity} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-6 animate-in fade-in duration-500">
      <header className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="group mb-4 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink-secondary transition-colors hover:text-ink"
        >
          <ArrowLeft size={18} className="rtl:-scale-x-100" aria-hidden="true" />
          {s.backToCenter}
        </button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title-lg font-semibold tracking-tight text-ink">{s.activityHistory}</h1>
          <CountChip>{formatCount(activity.length, language)} {s.records}</CountChip>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{s.auditDesc}</p>
      </header>

      {activity.length === 0 ? (
        <div className={panelClass}>
          <EmptyState
            message={s.noActivity}
            description={s.activityEmptyBody}
            icon={<FileText size={26} />}
          />
        </div>
      ) : (
        <ul className={`divide-y divide-divider overflow-hidden ${panelClass}`}>
          {activity.map((item) => {
            const status = getStatus(item, s as any);
            const dateStr = formatDateValue(item.uploadedAt, language) ?? s.recently;
            const category = getDocumentCategory(item);
            const categoryLabel = category ? (s as any)[`cat${category}`] : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/documents/${item.id}`)}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-alt active:bg-surface-alt"
                >
                  <DocumentIcon doc={item} size="sm" />
                  <span className="min-w-0 flex-1">
                    {/* No <bdi> here: it is a bidi isolate, so dir="auto" on the
                        truncating element would scan past it, find no strong
                        character, and fall back to LTR. The box would then clip the
                        leading (identifying) end of an Arabic filename instead of the
                        trailing end. The value is the sole content of the block, so
                        the block already isolates it and dir="auto" applies. */}
                    <p className="truncate text-[15px] font-semibold text-ink" dir="auto">
                      {item.originalFileName || s.unnamedDocument}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-ink-muted" dir="auto">
                      {dateStr}{categoryLabel ? ` · ${categoryLabel}` : ''}
                    </p>
                    {/* The LIST is where a user reconciling against an old
                        total FINDS the documents whose amounts changed;
                        detail is where they read why. Detail alone would make
                        them open rows one at a time to stumble on it. */}
                    {item.reprocessed && (
                      <span className="mt-1.5 block">
                        <CountChip>
                          <RefreshCw className="me-1 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                          {s.reprocessedBadge}
                        </CountChip>
                      </span>
                    )}
                  </span>
                  {status && (
                    <span className="inline-flex min-w-0 flex-shrink-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${status.dot}`} />
                      <span className={`truncate text-xs font-medium ${status.text}`}>{status.label}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
