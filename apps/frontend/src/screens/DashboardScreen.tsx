import React, { useEffect, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  Gauge,
  Search,
  ClipboardCheck,
  Download,
  ScanLine,
  ChevronRight,
  Sparkles,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { AreaChart } from '../components/AreaChart';
import { useIsDesktop } from '../hooks/useMediaQuery';

const formatDate = (dateString: string) => {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// Maps the real document status enum (COMPLETED / NEEDS_REVIEW / REJECTED) to a
// calm colored dot + label. No emoji.
const statusMeta = (status: string, s: ReturnType<typeof useStrings>) => {
  switch (status) {
    case 'COMPLETED':
      return { dot: 'bg-success', text: 'text-success-text', label: s.statusProcessed };
    case 'NEEDS_REVIEW':
      return { dot: 'bg-warning', text: 'text-warning-text', label: s.needsReview };
    case 'REJECTED':
      return { dot: 'bg-danger', text: 'text-danger-text', label: s.statusRejected };
    default:
      return { dot: 'bg-ink-faint', text: 'text-ink-muted', label: status.replace('_', ' ') };
  }
};

export const DashboardScreen = () => {
  const s = useStrings();
  const navigate = useNavigate();
  const { refreshCount, onNewScan } = useOutletContext<{ refreshCount: number; onNewScan: () => void }>();
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const isDesktop = useIsDesktop();

  // On mobile there is no Activity tab: the full history lives here.
  const handleViewAll = async () => {
    if (isDesktop) {
      navigate('/activity');
      return;
    }
    if (expanding) return;
    setExpanding(true);
    try {
      const all = await documentService.getAllActivity();
      if (all) setRecentActivity(all);
      setIsExpanded(true);
    } catch (err) {
      console.error('[Dashboard] Full activity fetch failed:', err);
      setIsExpanded(true);
    } finally {
      setExpanding(false);
    }
  };

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const statsTask = documentService.getStats().catch((err) => {
        console.error('[Dashboard] Stats fetch failed:', err);
        return null;
      });
      const activityTask = documentService.getRecentActivity().catch((err) => {
        console.error('[Dashboard] Activity fetch failed:', err);
        return null;
      });

      const [statsData, activityData] = await Promise.all([statsTask, activityTask]);

      if (statsData) setStats(statsData);
      if (activityData) setRecentActivity(activityData);

      if (!statsData && !activityData) {
        setError('We could not connect to the intelligence server. This might be a temporary connection issue.');
      } else if (!statsData) {
        setError('Intelligence metrics are temporarily unavailable. Your activity data is still visible.');
      } else {
        setError(null);
      }
    } catch (err: any) {
      setError('An unexpected error occurred while loading your dashboard.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [refreshCount]);

  // ── Loading skeleton (token-styled) ──────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] animate-in fade-in duration-500">
        <div className="mb-8">
          <div className="skeleton mb-3 h-7 w-56 rounded-nav dark:bg-slate-800" />
          <div className="skeleton h-4 w-80 rounded dark:bg-slate-800" />
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-card dark:bg-slate-800" />
          ))}
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="skeleton h-64 rounded-card dark:bg-slate-800" />
          <div className="skeleton h-64 rounded-card dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error && !stats.totalCount && recentActivity.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] py-12">
        <ErrorState title={s.connectionError} message={error} onRetry={() => fetchData(true)} />
      </div>
    );
  }

  const kpis = [
    {
      label: s.processedDocs,
      value: stats.totalCount.toLocaleString(),
      icon: <FileText size={16} />,
      tile: 'bg-accent-tint text-accent',
    },
    {
      label: s.pendingReview,
      value: stats.pendingCount.toLocaleString(),
      icon: <Clock size={16} />,
      tile: 'bg-surface-muted text-ink-tertiary',
    },
    {
      label: s.avgConfidence,
      value: `${(stats.averageConfidence * 100).toFixed(1)}%`,
      icon: <Gauge size={16} />,
      tile: 'bg-success-tint text-success',
    },
  ];

  const visibleActivity = recentActivity.slice(0, isExpanded ? undefined : 5);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <header>
        <h1 className="text-title-lg font-semibold tracking-tight text-ink">{s.dashboard}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{s.welcomeBack}</p>
      </header>

      {/* Attention banner */}
      {stats.pendingCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-raised px-4 py-3 shadow-card">
          <span className="h-2 w-2 flex-shrink-0 rounded-pill bg-warning" />
          <span className="text-sm text-ink-secondary">
            {s.finishBatch.replace('{n}', stats.pendingCount.toString())}
          </span>
          <button
            onClick={() => navigate('/queue')}
            className="ms-auto inline-flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-accent-text hover:opacity-80"
          >
            {s.reviewNow}
            <ChevronRight size={15} className="rtl:-scale-x-100" />
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((k, i) => (
          <div key={i} className="flex flex-col rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-medium text-ink-tertiary">{k.label}</span>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-btn ${k.tile}`}>
                {k.icon}
              </div>
            </div>
            <div className="mt-4 text-kpi font-semibold text-ink">{k.value}</div>
            {/* Trend chip intentionally omitted: period-over-period data is not
                available from the backend yet (arrives in PR-C). We show no chip
                rather than an invented percentage. */}
          </div>
        ))}
      </div>

      {/* Analytics row: documents-processed chart + by-status breakdown.
          Both render placeholders until PR-C supplies the series / breakdown. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col rounded-card border border-line bg-surface-raised p-5 shadow-card">
          <h2 className="text-section font-semibold text-ink">{s.documentsProcessed}</h2>
          <div className="mt-4">
            {/* No series prop yet → AreaChart shows its calm placeholder. */}
            <AreaChart placeholder={s.dataComingSoon} ariaLabel={s.documentsProcessed} />
          </div>
        </div>

        <div className="flex flex-col rounded-card border border-line bg-surface-raised p-5 shadow-card">
          <h2 className="text-section font-semibold text-ink">{s.documentsByStatus}</h2>
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-nav border border-dashed border-line bg-surface/40 py-10">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-pill bg-success/50" />
              <span className="h-2 w-2 rounded-pill bg-warning/50" />
              <span className="h-2 w-2 rounded-pill bg-danger/50" />
            </div>
            <span className="text-sm font-medium text-ink-muted">{s.dataComingSoon}</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-ink-tertiary">{s.quickActions}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Primary: New scan */}
          <button
            onClick={onNewScan}
            className="flex items-center gap-3 rounded-card border border-accent bg-accent p-4 text-start shadow-card transition-colors hover:bg-accent-hover"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn bg-white/15 text-white">
              <ScanLine size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{s.newScan}</span>
              <span className="block text-xs text-white/80">{s.uploadData}</span>
            </span>
          </button>

          {[
            { onClick: () => navigate('/search'), icon: <Search size={18} />, title: s.searchTab, sub: s.queryAI },
            { onClick: () => navigate('/queue'), icon: <ClipboardCheck size={18} />, title: s.reviewTitle, sub: s.validate },
            {
              onClick: async () => {
                try {
                  await documentService.exportCsv();
                } catch (err) {
                  console.error('Export failed:', err);
                  alert('Export failed. Please try again.');
                }
              },
              icon: <Download size={18} />,
              title: s.exportCSV,
              sub: s.downloadData,
            },
          ].map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 text-start shadow-card transition-colors hover:border-line-strong hover:bg-surface-alt"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn bg-surface-muted text-ink-tertiary">
                {a.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{a.title}</span>
                <span className="block text-xs text-ink-muted">{a.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Recent activity + side cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2.2fr_1fr]">
        {/* Recent activity */}
        <div className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-card">
          <div className="flex items-center justify-between border-b border-divider px-5 py-4">
            <h2 className="text-section font-semibold text-ink">{s.recentActivity}</h2>
            {recentActivity.length > 5 && !(isExpanded && !isDesktop) && (
              <button
                onClick={handleViewAll}
                disabled={expanding}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-text hover:opacity-80 disabled:opacity-50"
              >
                {s.viewAll}
                <ChevronRight size={14} className="rtl:-scale-x-100" />
              </button>
            )}
          </div>

          {recentActivity.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-surface-muted text-ink-faint">
                <FileText size={26} />
              </div>
              <p className="text-base font-semibold text-ink">{s.emptyTitle}</p>
              <p className="mt-1 max-w-xs text-sm text-ink-muted">{s.emptyBody}</p>
              <button
                onClick={onNewScan}
                className="mt-5 inline-flex items-center gap-2 rounded-btn bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-accent-hover"
              >
                <ScanLine size={16} />
                {s.newScan}
              </button>
            </div>
          ) : (
            visibleActivity.map((item) => {
              const meta = statusMeta(item.status, s);
              const conf =
                typeof item.overallConfidence === 'number'
                  ? `${Math.round(item.overallConfidence * 100)}%`
                  : null;
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/documents/${item.id}`)}
                  className="flex cursor-pointer items-center gap-3 border-b border-divider px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink-faint">
                    <FileText size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">
                      {item.originalFileName || 'Unnamed document'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">
                      {item.documentType ? `${item.documentType} · ` : ''}
                      {formatDate(item.uploadedAt)}
                    </div>
                  </div>
                  {conf && (
                    <span className="hidden w-11 flex-shrink-0 text-end text-[13px] font-medium text-ink-tertiary sm:block">
                      {conf}
                    </span>
                  )}
                  <span className="inline-flex w-28 flex-shrink-0 items-center gap-2">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${meta.dot}`} />
                    <span className={`truncate text-xs font-medium ${meta.text}`}>{meta.label}</span>
                  </span>
                  <ChevronRight size={16} className="flex-shrink-0 text-ink-fainter rtl:-scale-x-100" />
                </div>
              );
            })
          )}
        </div>

        {/* Insight + Tip (honest: derived from real totals / static guidance) */}
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <span className="text-[13px] font-semibold text-ink">{s.insight}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
              {stats.pendingCount > 0
                ? s.intelligencePulsePending.replace('{n}', stats.pendingCount.toString())
                : stats.totalCount > 0
                ? s.allSystemsVerified
                : s.intelligencePulseDesc.replace('{n}', stats.totalCount.toString())}
            </p>
          </div>
          <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-warning" />
              <span className="text-[13px] font-semibold text-ink">{s.tip}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">{s.powerTipText}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
