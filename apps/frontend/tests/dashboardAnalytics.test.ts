import { describe, it, expect } from 'vitest';
import {
  chartHasData,
  monthLabel,
  computeTrend,
  breakdownRows,
  breakdownTotal,
} from '../src/lib/dashboardAnalytics';

describe('chartHasData — the no-fabrication gate for the chart', () => {
  const s2 = [{ month: '2026-06', count: 1 }, { month: '2026-07', count: 2 }];
  it('false when there are genuinely no documents (totalCount 0)', () => {
    expect(chartHasData(0, s2)).toBe(false);
  });
  it('false when series is missing', () => {
    expect(chartHasData(5, undefined)).toBe(false);
  });
  it('false when the series sums to zero (a flat zero-line would mislead)', () => {
    expect(chartHasData(5, [{ month: '2026-06', count: 0 }, { month: '2026-07', count: 0 }])).toBe(false);
  });
  it('false with fewer than two points (AreaChart needs >= 2)', () => {
    expect(chartHasData(5, [{ month: '2026-07', count: 5 }])).toBe(false);
  });
  it('true only when totalCount > 0 and the series carries real counts', () => {
    expect(chartHasData(3, s2)).toBe(true);
  });
});

describe('monthLabel — localized short month, UTC-safe', () => {
  it('formats an English short month', () => {
    expect(monthLabel('2026-07', 'en')).toMatch(/Jul/);
  });
  it('uses UTC so the month never rolls back a boundary', () => {
    // If parsed in a negative-offset local tz without UTC, 2026-01 could render Dec.
    expect(monthLabel('2026-01', 'en')).toMatch(/Jan/);
  });
  it('is localized (Arabic differs from the raw key)', () => {
    const ar = monthLabel('2026-07', 'ar');
    expect(typeof ar).toBe('string');
    expect(ar).not.toBe('2026-07');
    expect(ar).not.toContain('2026');
  });
});

describe('computeTrend — zero-base handling (never fabricate a percentage)', () => {
  it('no periods -> none', () => {
    expect(computeTrend(undefined).kind).toBe('none');
  });
  it('both zero -> none (no chip)', () => {
    expect(computeTrend({ thisMonth: { processed: 0 }, lastMonth: { processed: 0 } }).kind).toBe('none');
  });
  it('last month zero, this month positive -> "new", NEVER +100%/Infinity', () => {
    const t = computeTrend({ thisMonth: { processed: 5 }, lastMonth: { processed: 0 } });
    expect(t.kind).toBe('new');
    expect(t.pct).toBeUndefined();
  });
  it('positive growth -> delta up with rounded percent', () => {
    const t = computeTrend({ thisMonth: { processed: 10 }, lastMonth: { processed: 8 } });
    expect(t).toEqual({ kind: 'delta', pct: 25, direction: 'up' });
  });
  it('decline -> delta down with negative percent', () => {
    const t = computeTrend({ thisMonth: { processed: 6 }, lastMonth: { processed: 8 } });
    expect(t).toEqual({ kind: 'delta', pct: -25, direction: 'down' });
  });
  it('flat -> delta 0 (honest no-change)', () => {
    const t = computeTrend({ thisMonth: { processed: 8 }, lastMonth: { processed: 8 } });
    expect(t.kind).toBe('delta');
    expect(t.pct).toBe(0);
  });
});

describe('breakdownRows / breakdownTotal — real-status percentages', () => {
  it('undefined -> three zero rows, total 0 (drives the placeholder)', () => {
    const rows = breakdownRows(undefined);
    expect(rows.map((r) => r.key)).toEqual(['COMPLETED', 'NEEDS_REVIEW', 'REJECTED']);
    expect(rows.every((r) => r.count === 0 && r.pct === 0)).toBe(true);
    expect(breakdownTotal(undefined)).toBe(0);
  });
  it('computes percentages over the real total', () => {
    const b = { COMPLETED: 3, NEEDS_REVIEW: 1, REJECTED: 0 };
    expect(breakdownTotal(b)).toBe(4);
    const rows = breakdownRows(b);
    expect(rows.find((r) => r.key === 'COMPLETED')!.pct).toBe(75);
    expect(rows.find((r) => r.key === 'NEEDS_REVIEW')!.pct).toBe(25);
    expect(rows.find((r) => r.key === 'REJECTED')!.pct).toBe(0);
  });
  it('rounds each share independently', () => {
    const rows = breakdownRows({ COMPLETED: 1, NEEDS_REVIEW: 1, REJECTED: 1 });
    expect(rows.map((r) => r.pct)).toEqual([33, 33, 33]);
  });
});
