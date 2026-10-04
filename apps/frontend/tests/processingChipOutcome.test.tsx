import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// The tray chip names the OUTCOME once nothing is in flight (board, Step 3).
// ============================================================================
// It read "Processing complete" above a document that had ended in Needs
// review: the end of the wait, not the verdict, and the opposite of what the
// row inside said. A failure outranks a review, which outranks a clean finish.
// ============================================================================

const state = vi.hoisted(() => ({ jobs: [] as any[] }));
vi.mock('../src/contexts/ProcessingContext', () => ({
  useProcessing: () => ({ jobs: state.jobs, processingCount: state.jobs.filter((j) => j.status === 'PROCESSING').length, trackUpload: vi.fn(), clearSettled: vi.fn() }),
}));

import { strings } from '../src/i18n/strings';
import { ProcessingTray } from '../src/components/ProcessingTray';
import { LanguageProvider } from '../src/i18n/LanguageContext';

type Lang = 'en' | 'fr' | 'ar';
let container: HTMLDivElement;
let root: Root;
const job = (documentId: string, status: string) => ({ documentId, fileName: `${documentId}.jpg`, status, startedAt: 0 });

function mount(lang: Lang, jobs: any[], path = '/dashboard') {
  state.jobs = jobs;
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(<LanguageProvider><MemoryRouter initialEntries={[path]}><ProcessingTray /></MemoryRouter></LanguageProvider>);
  });
}
const chip = () => container.querySelector('[data-testid="processing-chip"]')!;
afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

describe('the chip once nothing is processing', () => {
  it.each<Lang>(['en', 'fr', 'ar'])('%s: a document that needs review is named so, never "Processing complete"', (lang) => {
    mount(lang, [job('a', 'COMPLETED'), job('b', 'NEEDS_REVIEW')]);
    expect(chip().textContent).toBe(strings[lang].processingNeedsReviewChip);
    expect(chip().textContent).not.toBe(strings[lang].processingDone);
    expect(chip().getAttribute('data-processing-outcome')).toBe('review');
  });

  it.each<Lang>(['en', 'fr', 'ar'])('%s: a failure outranks a review', (lang) => {
    mount(lang, [job('a', 'NEEDS_REVIEW'), job('b', 'FAILED')]);
    expect(chip().textContent).toBe(strings[lang].processingFailedChip);
    expect(chip().getAttribute('data-processing-outcome')).toBe('failed');
  });

  it('the control: every job COMPLETED still reads "Processing complete"', () => {
    mount('en', [job('a', 'COMPLETED'), job('b', 'COMPLETED')]);
    expect(chip().textContent).toBe(strings.en.processingDone);
    expect(chip().getAttribute('data-processing-outcome')).toBe('done');
  });

  it('while anything is still processing the count wins, whatever has settled', () => {
    mount('en', [job('a', 'FAILED'), job('b', 'PROCESSING')]);
    expect(chip().textContent).toBe(strings.en.processingChip.replace('{n}', '1'));
    expect(chip().getAttribute('data-processing-outcome')).toBe('processing');
  });

  it('the three outcome strings differ from each other in every locale', () => {
    for (const lang of ['en', 'fr', 'ar'] as Lang[]) {
      const s = strings[lang];
      expect(new Set([s.processingDone, s.processingNeedsReviewChip, s.processingFailedChip]).size).toBe(3);
    }
  });
});

describe('on a pushed receipt screen there is no chip', () => {
  // The screen carries the state itself, and the chip at bottom-24 sat across
  // the fixed Approve / Reject bar on the owner's iPhone (build 15, defect 2).
  it('/documents/:id renders nothing, settled or processing', () => {
    mount('en', [job('a', 'NEEDS_REVIEW')], '/documents/a');
    expect(container.querySelector('[data-testid="processing-chip"]')).toBeNull();
    root.unmount(); container.remove();
    mount('en', [job('a', 'PROCESSING')], '/documents/a');
    expect(container.querySelector('[data-testid="processing-chip"]')).toBeNull();
  });
  it('the control: the same jobs on the Queue show the chip', () => {
    mount('en', [job('a', 'NEEDS_REVIEW')], '/queue');
    expect(container.querySelector('[data-testid="processing-chip"]')).toBeTruthy();
  });
});
