import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft, Activity, Loader2 } from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { getStatus } from '../lib/searchResultCard';
import { formatDateValue } from '../lib/formatCellValue';
import { formatCount } from '../lib/formatNumber';

export const ActivityScreen = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const data = await documentService.getAllActivity();
      setActivity(data);
      setError(null);
    } catch (err: any) {
      console.error('[Activity] Fetch failed:', err);
      setError(s.failedActivity);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="mb-4 animate-spin text-accent" size={40} />
        <p className="text-sm font-medium text-ink-muted">{s.loadingActivity}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] py-12">
        {/* No title prop: ErrorState renders its translated default (s.somethingWrong). */}
        <ErrorState message={error} onRetry={fetchActivity} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-10">
        <button
          onClick={() => navigate('/')}
          className="group mb-4 flex items-center gap-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft
            size={18}
            className="transition-transform group-hover:-translate-x-0.5 rtl:-scale-x-100"
          />
          {s.backToCenter}
        </button>
        <h1 className="mb-1 text-title-lg font-semibold tracking-tight text-ink">{s.activityHistory}</h1>
        <p className="text-sm text-ink-muted">{s.auditDesc}</p>
      </header>

      <div className="rounded-card border border-line bg-surface-raised p-6 shadow-card md:p-8">
        {/* Bespoke card-header toolbar row (icon + heading + count badge). Kept bespoke
            because SectionHeading's block layout has no trailing-action slot; the h2
            carries the SectionHeading visual (text-base font-semibold text-ink). */}
        <div className="mb-6 flex items-center gap-2.5 border-b border-divider pb-5">
          <Activity size={18} className="flex-shrink-0 text-ink-faint" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">{s.historicalIntel}</h2>
          <span className="ms-auto flex-shrink-0 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
            {formatCount(activity.length, language)} {s.records}
          </span>
        </div>

        {activity.length === 0 ? (
          <EmptyState
            message={s.noActivity}
            description={s.activityEmptyBody}
            icon={<FileText size={26} />}
          />
        ) : (
          <div>
            {activity.map((item) => {
              const status = getStatus(item, s as any);
              const dateStr = formatDateValue(item.uploadedAt, language) ?? s.recently;
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/documents/${item.id}`)}
                  className="flex cursor-pointer items-center justify-between gap-3 border-b border-divider px-3 py-4 transition-colors last:border-b-0 hover:bg-surface-alt md:px-4"
                >
                  <div className="flex min-w-0 items-center gap-3 md:gap-4">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink-faint md:h-12 md:w-12">
                      <FileText className="h-[18px] w-[18px] md:h-5 md:w-5" />
                    </span>
                    <div className="min-w-0">
                      {/* No <bdi> here: it is a bidi isolate, so dir="auto" on the
                          truncating element would scan past it, find no strong
                          character, and fall back to LTR. The box would then clip the
                          leading (identifying) end of an Arabic filename instead of the
                          trailing end. The value is the sole content of the block, so
                          the block already isolates it and dir="auto" applies. */}
                      <p className="truncate text-sm font-semibold text-ink md:text-base" dir="auto">
                        {item.originalFileName || s.unnamedDocument}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted" dir="auto">
                        {dateStr}
                      </p>
                    </div>
                  </div>
                  {status && (
                    <span className="inline-flex min-w-0 flex-shrink-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${status.dot}`} />
                      <span className={`truncate text-xs font-medium ${status.text}`}>{status.label}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
