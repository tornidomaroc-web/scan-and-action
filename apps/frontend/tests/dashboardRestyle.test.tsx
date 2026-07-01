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

function mount() {
  localStorage.setItem('lang', 'en');
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
