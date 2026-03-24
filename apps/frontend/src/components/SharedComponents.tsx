import React from 'react';

export const ReportCard = ({ title, description, onClick }: any) => (
  <div className="card report-card clickable" onClick={onClick}>
    <h4>{title}</h4>
    <p>{description}</p>
  </div>
);

export const ReviewBadge = ({ confidence, status }: { confidence: number, status: string }) => {
  const score = Math.round(confidence * 100);

  let badgeConfig = {
    label: 'Excellent',
    colorClass: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-400/10',
    icon: '✅'
  };

  if (confidence < 0.7) {
    badgeConfig = {
      label: 'At Risk',
      colorClass: 'text-rose-600 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-400/10',
      icon: '🚩'
    };
  } else if (confidence < 0.9 || status === 'NEEDS_REVIEW') {
    badgeConfig = {
      label: 'Needs Review',
      colorClass: 'text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10',
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

export const ChartPlaceholder = ({ data }: { data: any[] }) => {
  if (!data || data.length === 0) return <div>No chart data</div>;
  return (
    <div className="card chart-card">
      <h3>Data Visualization</h3>
      <div className="chart-bar-area">
        {data.map((d, i) => (
          <div key={i} className="mock-bar" style={{ width: `${Math.max(10, (d.sum / 1000) * 100)}%` }}>
            <span className="bar-label">{d.category || d.key} - {d.sum} {d.currency}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
