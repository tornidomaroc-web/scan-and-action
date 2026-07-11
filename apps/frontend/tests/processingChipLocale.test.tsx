import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// ProcessingTray chip — the count must be locale-grouped, not raw digits (item 5).
// ============================================================================
// The chip interpolates `processingCount` into `processingChip`. It must route
// through formatCount (like the KPI tiles) so a 1000+ count reads "1,234" / "1 234"
// instead of the raw "1234". We inject a large count via a mocked useProcessing so
// the test exercises the chip's formatting WITHOUT the real provider spinning up a
// polling timer per job.
vi.mock('../src/contexts/ProcessingContext', () => ({
  useProcessing: () => ({
    jobs: [{ documentId: 'd1', fileName: 'a.jpg', status: 'PROCESSING', startedAt: 0 }],
    processingCount: 1234,
    trackUpload: vi.fn(),
    clearSettled: vi.fn(),
  }),
}));

import { formatCount } from '../src/lib/formatNumber';
import { ProcessingTray } from '../src/components/ProcessingTray';
import { LanguageProvider } from '../src/i18n/LanguageContext';

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <ProcessingTray />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const chipText = () => container.querySelector('[data-testid="processing-chip"]')?.textContent ?? '';

describe('ProcessingTray chip — count is locale-formatted (item 5 regression guard)', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  it('EN: a 1234 processing count renders grouped ("1,234"), never the raw "1234"', () => {
    mount('en');
    expect(chipText()).toContain(formatCount(1234, 'en')); // "1,234"
    expect(chipText()).not.toContain('1234');
  });

  it('FR: a 1234 processing count uses the French group separator, never raw "1234"', () => {
    mount('fr');
    expect(chipText()).toContain(formatCount(1234, 'fr')); // "1 234" (U+202F)
    expect(chipText()).not.toContain('1234');
  });
});
