// Pure helpers for the dashboard analytics wiring (PR-C2). Kept free of React so
// the honesty-critical logic (when to show real data vs the calm placeholder,
// zero-base trend handling, breakdown percentages) is unit-tested in isolation.
//
// The backend (PR-C1) returns RAW counts only; all rendering decisions live
// here and in DashboardScreen — never fabricate a value the payload didn't give.

export interface MonthlyPoint {
  month: string; // 'YYYY-MM' (UTC)
  count: number;
}

export interface StatusBreakdown {
  COMPLETED: number;
  NEEDS_REVIEW: number;
  REJECTED: number;
}

export interface Periods {
  thisMonth: { processed: number };
  lastMonth: { processed: number };
}

/**
 * True only when it is honest to draw the chart: there are real documents
 * (totalCount > 0), the series has enough points for AreaChart (>= 2), and it
 * carries at least one real count. Otherwise the caller keeps the placeholder —
 * a flat zero-line would imply data that isn't there.
 */
export function chartHasData(totalCount: number, series?: MonthlyPoint[]): boolean {
  if (!series || series.length < 2) return false;
  if (totalCount <= 0) return false;
  return series.reduce((sum, p) => sum + p.count, 0) > 0;
}

/** 'YYYY-MM' -> localized short month (e.g. 'Jul'), computed in UTC. */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
}

export type Trend =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'delta'; pct: number; direction: 'up' | 'down' };

/**
 * Month-over-month trend for the Processed KPI. Zero-base is the trap: if last
 * month was 0 and this month is positive, the percentage is undefined
 * (Infinity) — we return 'new' instead of a fabricated +100%. Both-zero is 'none'
 * (no chip). A flat month is an honest 0% delta.
 */
export function computeTrend(periods?: Periods): Trend {
  if (!periods) return { kind: 'none' };
  const cur = periods.thisMonth.processed;
  const prev = periods.lastMonth.processed;
  if (prev === 0 && cur === 0) return { kind: 'none' };
  if (prev === 0) return { kind: 'new' }; // cur > 0, undefined percentage
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { kind: 'delta', pct, direction: pct < 0 ? 'down' : 'up' };
}

const BREAKDOWN_KEYS = ['COMPLETED', 'NEEDS_REVIEW', 'REJECTED'] as const;
export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];

export interface BreakdownRow {
  key: BreakdownKey;
  count: number;
  pct: number;
}

export function breakdownTotal(b?: StatusBreakdown): number {
  if (!b) return 0;
  return b.COMPLETED + b.NEEDS_REVIEW + b.REJECTED;
}

/** Fixed-order rows with each status's share of the real total (0 when empty). */
export function breakdownRows(b?: StatusBreakdown): BreakdownRow[] {
  const total = breakdownTotal(b);
  return BREAKDOWN_KEYS.map((key) => {
    const count = b ? b[key] : 0;
    return { key, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}
