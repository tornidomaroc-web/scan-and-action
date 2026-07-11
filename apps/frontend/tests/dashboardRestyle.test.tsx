import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// Dashboard restyle (PR-B) — behavioral guards
// ============================================================================
// Verifies the restyled dashboard: shows REAL stats, renders the calm chart /
// breakdown PLACEHOLDERS (no fabricated numbers), uses colored status dots
// instead of emoji, and shows the elegant empty state. Also guards the "no
// fake data" rule so PR-C is a clean data-wiring step.
// ============================================================================

const h = vi.hoisted(() => ({
  getStats: vi.fn(),
  getRecentActivity: vi.fn(),
  getAllActivity: vi.fn(),
  exportCsv: vi.fn(),
}));

vi.mock('../src/services/documentService', () => ({
  documentService: {
    getStats: h.getStats,
    getRecentActivity: h.getRecentActivity,
    getAllActivity: h.getAllActivity,
    exportCsv: h.exportCsv,
  },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DashboardScreen } from '../src/screens/DashboardScreen';

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr' | 'ar' = 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route element={<Outlet context={{ refreshCount: 0, onNewScan: () => {} }} />}>
              <Route path="/dashboard" element={<DashboardScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const text = () => container.textContent ?? '';

describe('Dashboard restyle — populated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.getStats.mockResolvedValue({ totalCount: 1284, pendingCount: 3, averageConfidence: 0.964 });
    h.getRecentActivity.mockResolvedValue([
      { id: 'd1', originalFileName: 'Aurora Studios.pdf', documentType: 'INVOICE', overallConfidence: 0.98, status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z' },
      { id: 'd2', originalFileName: 'Contoso.pdf', documentType: 'STATEMENT', overallConfidence: 0.64, status: 'NEEDS_REVIEW', uploadedAt: '2026-06-30T10:00:00Z' },
    ]);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows REAL stat values and the calm title', async () => {
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.dashboard));
    expect(text()).toContain('1,284'); // totalCount
    expect(text()).toContain('96.4%'); // averageConfidence
  });

  // item 5: the pending-count banner + insight both interpolate via formatCount,
  // so a 1000+ pending count groups like the KPI tiles ("1,234"), never raw "1234".
  it('localizes a 1000+ pending count in the finish-batch banner and insight', async () => {
    h.getStats.mockResolvedValue({ totalCount: 2000, pendingCount: 1234, averageConfidence: 0.9 });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.finishBatch.replace('{n}', '1,234')));
    expect(text()).toContain(strings.en.intelligencePulsePending.replace('{n}', '1,234'));
    expect(text()).not.toContain('1234'); // the raw .toString() path is gone
  });

  it('renders chart + by-status as placeholders — NO fabricated numbers', async () => {
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.documentsProcessed));
    // Placeholder copy present…
    expect(text()).toContain(strings.en.dataComingSoon);
    // …and none of the design's mock/fabricated figures leaked into the build.
    for (const fake of ['+12%', 'vs last month', 'vs last week', '94.5%', 'Approval rate 94.5%']) {
      expect(text()).not.toContain(fake);
    }
  });

  it('uses colored status dots + labels, NOT emoji', async () => {
    mount();
    await vi.waitFor(() => expect(text()).toContain('Aurora Studios.pdf'));
    expect(text()).toContain(strings.en.statusProcessed); // COMPLETED → Processed
    expect(text()).toContain(strings.en.needsReview);     // NEEDS_REVIEW
    expect(text()).toContain('98%');                      // real overallConfidence
    for (const emoji of ['✅', '⚠️', '🚩']) {
      expect(text()).not.toContain(emoji);
    }
  });

  it('keeps the export handler wired', async () => {
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.exportCSV));
    const btn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(strings.en.exportCSV)
    )!;
    flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(h.exportCsv).toHaveBeenCalled();
  });
});

// Em dashes are banned in ALL user-facing copy: they're a hard rule and read as
// AI-written. En dashes used as punctuation are banned too. This guard iterates
// EVERY i18n key in EVERY locale, so a dash can never regress anywhere in the
// translated copy — not just in the dashboard keys. It bites: if a '—' or '–'
// is reintroduced into any string, that key's assertion fails (proven by
// temporarily inserting one during review).
describe('i18n copy — no em/en dashes anywhere (hard rule)', () => {
  const locales = ['en', 'fr', 'ar'] as const;
  for (const loc of locales) {
    const dict = (strings as Record<string, Record<string, unknown>>)[loc];
    for (const key of Object.keys(dict)) {
      const value = dict[key];
      if (typeof value !== 'string') continue; // all values are flat strings today
      it(`strings.${loc}.${key} contains no em/en dash`, () => {
        expect(value).not.toContain('—'); // — em dash
        expect(value).not.toContain('–'); // – en dash (as punctuation)
      });
    }
  }
});

// The guard above iterates EVERY key, so the Search-redesign (D2) keys are
// already covered. This block names them explicitly so the coverage is provable
// (and a future refactor that narrows the guard to a subset would fail here).
describe('i18n copy — Search redesign (D2) keys are dash-free (explicit)', () => {
  const searchKeys = [
    'aiInsight', 'executiveSummary', 'msProcessing', 'synthesizedFrom',
    'clarificationNeeded', 'resultsTitle', 'findingsLabel', 'msUnit',
    'dataVisualization', 'noChartData', 'noMatchingDataDesc',
    'somethingWrong', 'tryAgain', 'searchFailed', 'autoRunFailed',
  ] as const;
  for (const loc of ['en', 'fr', 'ar'] as const) {
    for (const key of searchKeys) {
      it(`strings.${loc}.${key} is present and dash-free`, () => {
        const value = (strings as Record<string, Record<string, unknown>>)[loc][key];
        expect(typeof value).toBe('string');
        expect(value as string).not.toContain('—');
        expect(value as string).not.toContain('–');
      });
    }
  }
});

describe('Dashboard restyle — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.getStats.mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
    h.getRecentActivity.mockResolvedValue([]);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows the elegant "no documents yet" empty state', async () => {
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.emptyTitle));
    expect(text()).toContain(strings.en.emptyBody);
  });
});

// ============================================================================
// PR-C2 — real analytics wiring (chart / breakdown / trend / filter / RTL)
// ============================================================================
// The core rule: render REAL data when the payload has it, the calm placeholder
// when it is genuinely empty, and NEVER a fabricated number.

const SERIES = [
  { month: '2026-02', count: 1 },
  { month: '2026-03', count: 3 },
  { month: '2026-04', count: 2 },
  { month: '2026-05', count: 5 },
  { month: '2026-06', count: 8 },
  { month: '2026-07', count: 4 },
];
// The real AreaChart SVG carries aria-label; the placeholder's inner svg does not.
const chartSvg = () => container.querySelector('svg[aria-label]');
const clickButton = (label: string) => {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
// Exact leaf-text match — avoids substring collisions (e.g. the "New" trend
// badge vs the "New Scan" quick action).
const hasExactText = (t: string) =>
  [...container.querySelectorAll('*')].some((el) => el.children.length === 0 && el.textContent?.trim() === t);

describe('Dashboard analytics wiring (PR-C2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.getRecentActivity.mockResolvedValue([]);
  });
  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('renders the real AreaChart (not the placeholder) when there is genuine series data', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 100, pendingCount: 0, averageConfidence: 0.9,
      statusBreakdown: { COMPLETED: 8, NEEDS_REVIEW: 1, REJECTED: 1 },
      monthlySeries: SERIES,
    });
    mount();
    await vi.waitFor(() => expect(chartSvg()).toBeTruthy());
    // Both widgets have real data -> the placeholder copy is gone entirely.
    expect(text()).not.toContain(strings.en.dataComingSoon);
    // Month labels are localized and present.
    expect(text()).toContain('Jul');
    expect(text()).toContain('Feb');
  });

  it('keeps the placeholder (no fabricated flat-zero) when totalCount>0 but the series sums to zero', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 100, pendingCount: 0, averageConfidence: 0.9,
      statusBreakdown: { COMPLETED: 0, NEEDS_REVIEW: 0, REJECTED: 0 },
      monthlySeries: SERIES.map((p) => ({ ...p, count: 0 })),
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.dashboard));
    expect(chartSvg()).toBeNull();
    expect(text()).toContain(strings.en.dataComingSoon);
  });

  it('renders the by-status breakdown with real counts + percentages and real-status labels', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 10, pendingCount: 0, averageConfidence: 0.9,
      statusBreakdown: { COMPLETED: 8, NEEDS_REVIEW: 1, REJECTED: 1 }, // total 10 -> 80/10/10
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.documentsByStatus));
    expect(text()).toContain(strings.en.statusProcessed); // COMPLETED label
    expect(text()).toContain(strings.en.needsReview);
    expect(text()).toContain(strings.en.statusRejected);
    expect(text()).toContain('80%');
    expect(text()).toContain('10%');
    // No fictional Approved/Flagged and no approval-rate metric.
    expect(text()).not.toContain(strings.en.statusApproved);
    expect(text()).not.toContain(strings.en.statusFlagged);
    expect(text()).not.toContain(strings.en.approvalRate);
  });

  it('shows a real positive trend chip in this-month mode', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 100, pendingCount: 0, averageConfidence: 0.9,
      periods: { thisMonth: { processed: 10 }, lastMonth: { processed: 8 } }, // +25%
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.thisMonth));
    // Chip is scoped to the this-month view.
    clickButton(strings.en.thisMonth);
    expect(text()).toContain('+25%');
    expect(text()).toContain(strings.en.vsLastMonth);
  });

  it('zero-base delta shows the "New" badge, never +100% or Infinity', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 5, pendingCount: 0, averageConfidence: 0.9,
      periods: { thisMonth: { processed: 5 }, lastMonth: { processed: 0 } },
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.thisMonth));
    clickButton(strings.en.thisMonth);
    expect(hasExactText(strings.en.trendNew)).toBe(true);
    for (const fake of ['+100%', 'Infinity', '∞', 'NaN']) {
      expect(text()).not.toContain(fake);
    }
    expect(text()).not.toContain(strings.en.vsLastMonth);
  });

  it('both-zero periods show no trend chip at all', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 0, pendingCount: 0, averageConfidence: 0,
      periods: { thisMonth: { processed: 0 }, lastMonth: { processed: 0 } },
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.thisMonth));
    clickButton(strings.en.thisMonth);
    expect(text()).not.toContain(strings.en.vsLastMonth);
    expect(hasExactText(strings.en.trendNew)).toBe(false);
  });

  it('the This month / All time control actually changes the displayed Processed value', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 1284, pendingCount: 0, averageConfidence: 0.9,
      periods: { thisMonth: { processed: 37 }, lastMonth: { processed: 20 } },
    });
    mount();
    await vi.waitFor(() => expect(text()).toContain('1,284')); // all-time default
    clickButton(strings.en.thisMonth);
    expect(text()).toContain('37');       // now the this-month processed count
    expect(text()).not.toContain('1,284'); // all-time value no longer shown
    clickButton(strings.en.allTime);
    expect(text()).toContain('1,284');    // toggles back
  });

  it('does NOT render the period control when the payload lacks period data', async () => {
    h.getStats.mockResolvedValue({ totalCount: 100, pendingCount: 0, averageConfidence: 0.9 });
    mount();
    await vi.waitFor(() => expect(text()).toContain(strings.en.dashboard));
    const hasToggle = [...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === strings.en.thisMonth);
    expect(hasToggle).toBe(false);
  });

  it('RTL (ar): the chart series is reversed so months read right-to-left', async () => {
    h.getStats.mockResolvedValue({
      totalCount: 100, pendingCount: 0, averageConfidence: 0.9,
      monthlySeries: SERIES,
    });
    mount('ar');
    await vi.waitFor(() => expect(chartSvg()).toBeTruthy());
    const axisLabels = [...container.querySelectorAll('svg[aria-label] text')]
      .filter((t) => t.getAttribute('text-anchor') === 'middle')
      .map((t) => t.textContent);
    const fmt = (m: string) => {
      const [y, mm] = m.split('-').map(Number);
      return new Intl.DateTimeFormat('ar', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mm - 1, 1)));
    };
    const chronological = SERIES.map((p) => fmt(p.month));
    expect(axisLabels).toEqual([...chronological].reverse()); // newest first
  });
});
