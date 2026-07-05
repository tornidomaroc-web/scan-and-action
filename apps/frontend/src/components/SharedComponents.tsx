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

// Extraction-confidence badge, restyled onto the --sa-* tokens: a plain percent
// plus a calm colored dot and a sentence-case tier label (no emoji). This is the
// CONFIDENCE-quality signal and is kept semantically SEPARATE from the document
// lifecycle status (Processed / Needs review / Rejected) rendered elsewhere; it
// only borrows the same success/warning/danger dot language so the two read as
// one system. The percent stays LTR so numerals do not mirror in Arabic.
export const ReviewBadge = ({ confidence, status }: { confidence: number, status: string }) => {
  const s = useStrings();
  const score = Math.round(confidence * 100);

  let tier = { label: s.excellent, dot: 'bg-success', text: 'text-success-text' };
  if (confidence < 0.7) {
    tier = { label: s.atRisk, dot: 'bg-danger', text: 'text-danger-text' };
  } else if (confidence < 0.9 || status === 'NEEDS_REVIEW') {
    tier = { label: s.needsReview, dot: 'bg-warning', text: 'text-warning-text' };
  }

  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="text-sm font-semibold text-ink" dir="ltr">{score}%</span>
      <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium ${tier.text}`}>
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${tier.dot}`} />
        {tier.label}
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
