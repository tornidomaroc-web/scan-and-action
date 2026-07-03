import React from 'react';

export interface AreaPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  /** Time-ordered points. When empty/undefined the chart renders a calm
      "data coming soon" placeholder (PR-B has no backend series yet; PR-C will
      pass real data straight in — no shape change needed). */
  series?: AreaPoint[];
  /** Localized placeholder copy shown when there is no data. */
  placeholder: string;
  ariaLabel?: string;
  /** When true the series is already reversed for RTL (newest first), so the
      "latest point" highlight moves to the first point instead of the last. */
  rtl?: boolean;
}

// Fixed viewBox coordinate space (matches the approved design). The SVG scales
// responsively to its container width via width:100%.
const VB_W = 680;
const VB_H = 210;
const PAD_L = 44; // room for y-axis labels
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 32; // room for x-axis labels

/**
 * Dependency-free area chart (indigo line + soft gradient fill + muted gridlines
 * + axis labels + highlighted latest point), styled entirely with the --sa-*
 * design tokens. No charting library — hand-authored SVG.
 */
export const AreaChart: React.FC<AreaChartProps> = ({ series, placeholder, ariaLabel, rtl }) => {
  const hasData = Array.isArray(series) && series.length >= 2;

  if (!hasData) {
    // Graceful empty state — a faint baseline + centered muted copy. Symmetric,
    // so it reads correctly in both LTR and RTL without mirroring.
    return (
      <div
        role="img"
        aria-label={placeholder}
        className="flex h-[180px] w-full flex-col items-center justify-center gap-3 rounded-nav border border-dashed border-line bg-surface/40"
      >
        <svg width="40" height="40" viewBox="0 0 24 24" className="text-ink-fainter"
             style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
        <span className="text-sm font-medium text-ink-muted">{placeholder}</span>
      </div>
    );
  }

  const values = series!.map((p) => p.value);
  const maxV = Math.max(...values, 1);
  const stepX = (VB_W - PAD_L - PAD_R) / (series!.length - 1);
  const x = (i: number) => PAD_L + i * stepX;
  const y = (v: number) => PAD_T + (1 - v / maxV) * (VB_H - PAD_T - PAD_B);

  const linePath = series!.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(series!.length - 1).toFixed(1)},${VB_H - PAD_B} L${PAD_L},${VB_H - PAD_B} Z`;
  // In RTL the series is passed newest-first, so the current month sits at
  // index 0; highlight that point instead of the last.
  const latestIdx = rtl ? 0 : series!.length - 1;
  const lastX = x(latestIdx);
  const lastY = y(series![latestIdx].value);

  // Four horizontal gridlines at quartiles of the max.
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={ariaLabel}
         style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="sa-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sa-accent)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--sa-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLevels.map((lvl, i) => {
        const gy = PAD_T + (1 - lvl) * (VB_H - PAD_T - PAD_B);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={gy} x2={VB_W - PAD_R} y2={gy} style={{ stroke: 'var(--sa-divider)', strokeWidth: 1 }} />
            <text x={PAD_L - 8} y={gy + 3} textAnchor="end"
                  style={{ font: "500 10px var(--sa-font-sans)", fill: 'var(--sa-ink-fainter)' }}>
              {Math.round(maxV * lvl)}
            </text>
          </g>
        );
      })}

      <path d={areaPath} style={{ fill: 'url(#sa-area-fill)' }} />
      <path d={linePath}
            style={{ fill: 'none', stroke: 'var(--sa-accent)', strokeWidth: 2.25, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      <circle cx={lastX} cy={lastY} r={4}
              style={{ fill: 'var(--sa-accent)', stroke: 'var(--sa-surface-raised)', strokeWidth: 2.5 }} />

      {series!.map((p, i) => (
        <text key={i} x={x(i)} y={VB_H - PAD_B + 18} textAnchor="middle"
              style={{ font: "500 10.5px var(--sa-font-sans)", fill: 'var(--sa-ink-faint)' }}>
          {p.label}
        </text>
      ))}
    </svg>
  );
};
