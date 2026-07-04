import React from 'react';
import { Sparkles, BarChart3 } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';

// Insights-gallery card, restyled onto the --sa-* tokens (calm card, accent
// icon tile, subtle hover). Aligns by logical `start` so it mirrors in RTL. It
// is a real button for keyboard/AT access; behavior (onClick) is unchanged.
export const ReportCard = ({ title, description, onClick, icon }: any) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex h-full flex-col items-start gap-2 rounded-card border border-line bg-surface-raised p-5 text-start shadow-card transition-colors hover:border-line-strong hover:bg-surface-alt"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent-tint text-accent">
      {icon || <Sparkles size={20} />}
    </span>
    <h4 className="mt-1 text-sm font-semibold text-ink">{title}</h4>
    {description && <p className="text-[13px] leading-relaxed text-ink-muted">{description}</p>}
  </button>
);

export const ReviewBadge = ({ confidence, status }: { confidence: number, status: string }) => {
  const s = useStrings();
  const score = Math.round(confidence * 100);

  let badgeConfig = {
    label: s.excellent,
    colorClass: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-400/10',
    icon: '✅'
  };

  if (confidence < 0.7) {
    badgeConfig = {
      label: s.atRisk,
      colorClass: 'text-rose-600 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-400/10',
      icon: '🚩'
    };
  } else if (confidence < 0.9 || status === 'NEEDS_REVIEW') {
    badgeConfig = {
      label: s.needsReview,
      colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800',
      icon: '⚠️'
    };
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
        {score}%
      </span>
      <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${badgeConfig.colorClass}`}>
        <span>{badgeConfig.icon}</span>
        {badgeConfig.label}
      </span>
    </div>
  );
};

// Hand-built (dependency-free) horizontal bar chart, restyled onto the --sa-*
// tokens to match the dashboard's chart approach. Bars grow from the inline
// start edge, so they mirror in RTL; amounts are kept LTR. Renders only the
// real data the backend returns.
export const ChartPlaceholder = ({ data }: { data: any[] }) => {
  const s = useStrings();
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <span className="text-sm font-medium text-ink-muted">{s.noChartData}</span>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => Number(d.sum) || 0), 1);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <BarChart3 size={16} className="text-accent" />
        <h3 className="text-section font-semibold text-ink">{s.dataVisualization}</h3>
      </div>
      <div className="flex flex-col gap-3">
        {data.map((d, i) => {
          const pct = Math.max(6, (Number(d.sum) / max) * 100);
          const label = d.category || d.key || '';
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-medium text-ink-secondary">{label}</span>
                <span className="flex-shrink-0 font-semibold text-ink" dir="ltr">
                  {d.sum} {d.currency}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-pill bg-surface-muted">
                <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
