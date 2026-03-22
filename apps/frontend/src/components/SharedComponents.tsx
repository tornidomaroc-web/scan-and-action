import React from 'react';

export const ReportCard = ({ title, description, onClick }: any) => (
  <div className="card report-card clickable" onClick={onClick}>
    <h4>{title}</h4>
    <p>{description}</p>
  </div>
);

export const ReviewBadge = ({ confidence, status }: { confidence: number, status: string }) => {
  const isLow = confidence < 0.8 || status === 'NEEDS_REVIEW';
  return (
    <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`}>
      {isLow ? '⚠️ Needs Review' : '✅ Verified'} ({Math.round(confidence * 100)}%)
    </span>
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
