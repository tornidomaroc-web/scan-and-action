import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// ActivityScreen restyle (D5) — behavioral guards for the first full-screen
// migration onto the --sa design system. Locks: locale-grouped record count,
// token-only source (no raw palette), no hardcoded English leaks, the shared
// EmptyState, and the getStatus mapping (a FAILED item is NOT mislabeled).
// ============================================================================

const h = vi.hoisted(() => ({ getAllActivity: vi.fn() }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getAllActivity: h.getAllActivity },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ActivityScreen } from '../src/screens/ActivityScreen';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

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
        <MemoryRouter initialEntries={['/activity']}>
          <Routes>
            <Route path="/activity" element={<ActivityScreen />} />
            <Route path="/documents/:id" element={<div>DOC-STUB</div>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const text = () => container.textContent ?? '';

// Non-numeric filenames so the raw-vs-grouped count assertions can't collide
// with digits in the row content.
const rows = (n: number, status = 'COMPLETED') =>
  Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    originalFileName: 'Report.pdf',
    uploadedAt: '2026-07-01T10:00:00Z',
    status,
  }));

describe('ActivityScreen restyle (D5)', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => { root.unmount(); container.remove(); });

  it('EN: the record count is locale-grouped ("1,234"), never the raw "1234"', async () => {
    h.getAllActivity.mockResolvedValue(rows(1234));
    mount('en');
    await vi.waitFor(() => expect(text()).toContain(strings.en.records));
    expect(text()).toContain('1,234');
    expect(text()).not.toContain('1234');
  });

  it('FR: the record count uses the French group separator, never raw "1234"', async () => {
    h.getAllActivity.mockResolvedValue(rows(1234));
    mount('fr');
    await vi.waitFor(() => expect(text()).toContain(strings.fr.records));
    expect(text()).toContain('1 234'); // U+202F narrow no-break space
    expect(text()).not.toContain('1234');
  });

  it('empty state renders the shared EmptyState with the translated body', async () => {
    h.getAllActivity.mockResolvedValue([]);
    mount('en');
    await vi.waitFor(() => expect(text()).toContain(strings.en.noActivity));
    expect(text()).toContain(strings.en.activityEmptyBody);
  });

  it('FR: renders no hardcoded English literals (i18n gaps closed)', async () => {
    h.getAllActivity.mockResolvedValue([
      { id: 'x', originalFileName: '', uploadedAt: '', status: 'COMPLETED' },
    ]);
    mount('fr');
    await vi.waitFor(() => expect(text()).toContain(strings.fr.activityHistory));
    for (const bad of [
      'Intelligence Error',
      'Your processed documents will appear here.',
      'Unnamed Document',
      'Recently',
    ]) {
      expect(text()).not.toContain(bad);
    }
    // Empty filename + empty date fall back to the TRANSLATED shared strings.
    expect(text()).toContain(strings.fr.unnamedDocument);
    expect(text()).toContain(strings.fr.recently);
  });

  it('a FAILED item is labeled Failed, NOT Rejected (getStatus mapping fix)', async () => {
    h.getAllActivity.mockResolvedValue([
      { id: 'f', originalFileName: 'f.pdf', uploadedAt: '2026-07-01T10:00:00Z', status: 'FAILED' },
    ]);
    mount('en');
    await vi.waitFor(() => expect(text()).toContain('f.pdf'));
    expect(text()).toContain(strings.en.statusFailed);      // 'Failed'
    expect(text()).not.toContain(strings.en.statusRejected); // 'Rejected'
  });

  it('source uses --sa tokens, not the raw Tailwind palette', () => {
    const src = read('../src/screens/ActivityScreen.tsx');
    expect(src).not.toMatch(/\b(slate|blue|emerald|amber|gray)-[0-9]/);
  });
});
