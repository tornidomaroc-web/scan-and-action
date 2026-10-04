import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// The reading state (design step 3): a document being read shows it, however
// the read started, and the settled state names its verdict.
// ============================================================================
// Before this, a PROCESSING row rendered the finished screen with nothing in
// it: "Unknown vendor", "No amount read", an empty facts table, and no way to
// learn when the read ended short of leaving and coming back. After a retry
// the screen went quiet the same way, and the tray was never told.
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn(), getStats: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider, useProcessing } from '../src/contexts/ProcessingContext';
import { DocumentDetailScreen, READING_POLL_MS, READING_SLOW_MS, READING_MAX_MS } from '../src/screens/DocumentDetailScreen';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
let container: HTMLDivElement;
let root: Root;

// The stub exactly as uploadController creates it and the detail route serves
// it: UNKNOWN type, no facts, the signed URL of the file that was just uploaded.
const STUB = {
  id: 'd1', originalFileName: 'scan-20261004-101500.jpg', documentType: 'UNKNOWN', overallConfidence: 0, status: 'PROCESSING',
  uploadedAt: '2026-10-04T10:15:00Z', processedAt: null, facts: [], entities: [], documentEntities: [],
  signedFileUrl: 'https://storage.example/signed/scan.jpg?token=x', reextractable: false, reprocessed: null,
};
const SETTLED = {
  ...STUB, status: 'NEEDS_REVIEW', documentType: 'RECEIPT', overallConfidence: 0.99, processedAt: '2026-10-04T10:15:09Z',
  entities: [{ role: 'VENDOR', displayName: 'Corner Hardware' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Corner Hardware' } }],
  facts: [
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 54.5, currency: 'USD', confidence: 0.6 },
    { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-09-30T00:00:00.000Z', confidence: 0.99 },
    { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Total not printed' },
  ],
  reextractable: true,
};

// A probe for what the tray knows, without rendering the tray.
const JobsProbe: React.FC = () => {
  const { jobs } = useProcessing();
  return <div data-jobs={jobs.map((j) => `${j.documentId}:${j.status}`).join(',')} />;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.dir = 'ltr';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // React's scheduler flushes through setImmediate / MessageChannel: leave those
  // real, fake only the clock the poll reads.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
afterEach(() => { vi.useRealTimers(); root?.unmount(); container?.remove(); });

function mount(lang: Lang, withTray = false) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const screen = (
    <MemoryRouter initialEntries={['/documents/d1']}>
      <Routes><Route path="/documents/:id" element={<DocumentDetailScreen />} /></Routes>
    </MemoryRouter>
  );
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        {withTray ? <ProcessingProvider><JobsProbe />{screen}</ProcessingProvider> : screen}
      </ToastProvider></LanguageProvider>
    );
  });
}
// setImmediate is left real above, and it is what React's scheduler and the
// resolved service promise ride on: a few turns of it is a settled screen.
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await settle(); };
const q = (sel: string) => container.querySelector(sel);

describe('a document being read', () => {
  it.each(LANGS)('%s: the title says so, the picture is there, and nothing claims to have been read', async (lang) => {
    h.getDocumentDetail.mockResolvedValue(STUB);
    mount(lang);
    await settle();
    const s = strings[lang];
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
    expect(q('#detail-title')!.textContent).toBe(s.detailReadingTitle);
    expect(q('[data-detail-reading-note]')!.textContent).toBe(s.detailReadingBody);
    expect(q('[data-detail-reading-note]')!.getAttribute('data-detail-reading-note')).toBe('reading');
    expect(q('[data-detail-reading-amount]')).toBeTruthy();
    expect(q('[data-detail-status]')!.textContent).toBe(s.statusProcessing);
    // the receipt card, at once
    expect(q('[data-detail-receipt] img')!.getAttribute('src')).toBe(STUB.signedFileUrl);
    // the finished screen's empty claims are absent
    expect(container.textContent).not.toContain(s.ledgerUnknownVendor);
    expect(container.textContent).not.toContain(s.detailNoAmount);
    expect(container.textContent).not.toContain(s.noFacts);
    expect(q('[data-detail-facts]')).toBeNull();
    expect(q('[data-detail-issues]')).toBeNull();
    expect(q('[data-detail-actions]')).toBeNull();
    expect(q('[data-detail-meta]')).toBeNull();
  });

  it('asks again every READING_POLL_MS, keeps the picture (no skeleton), and settles into the verdict', async () => {
    h.getDocumentDetail.mockResolvedValueOnce(STUB).mockResolvedValueOnce(STUB).mockResolvedValue(SETTLED);
    mount('en');
    await settle();
    expect(h.getDocumentDetail).toHaveBeenCalledTimes(1);

    await tick(READING_POLL_MS + 5);
    expect(h.getDocumentDetail).toHaveBeenCalledTimes(2);
    // still reading, still the same screen: the picture never left
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
    expect(q('[data-detail-receipt] img')).toBeTruthy();
    expect(q('[aria-busy="true"].animate-pulse')).toBeNull();

    await tick(READING_POLL_MS + 5);
    expect(h.getDocumentDetail).toHaveBeenCalledTimes(3);
    // settled: the verdict, the merchant, the amount, the reason, the actions
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBeNull();
    expect(q('#detail-title')!.textContent).toBe('Corner Hardware');
    expect(q('[data-detail-amount]')!.textContent).toBe('54.50');
    expect(q('[data-detail-status]')!.textContent).toBe(strings.en.needsReview);
    expect(q('[data-detail-issues]')!.textContent).toContain(strings.en.reasonTotalNotPrinted);
    expect(q('[data-detail-actions]')).toBeTruthy();
    expect(q('[data-detail-facts]')).toBeTruthy();

    // and it stops asking
    await tick(READING_POLL_MS * 3);
    expect(h.getDocumentDetail).toHaveBeenCalledTimes(3);
  });

  it('the picture does not change hands: every read signs a new URL, the <img> keeps the first one, through settling', async () => {
    // getSignedFileUrl.ts signs per request; on the phone this reset the
    // picture to the skeleton every 3 s (build 15, defect 1).
    let n = 0;
    h.getDocumentDetail.mockImplementation(async () => (n++ < 2 ? { ...STUB, signedFileUrl: `${STUB.signedFileUrl}&n=${n}` } : { ...SETTLED, signedFileUrl: `${STUB.signedFileUrl}&n=${n}` }));
    mount('en');
    await settle();
    const first = q('[data-detail-receipt] img')!.getAttribute('src')!;
    expect(first).toContain('&n=1');
    await tick(READING_POLL_MS + 5);
    expect(q('[data-detail-receipt] img')!.getAttribute('src')).toBe(first);
    await tick(READING_POLL_MS + 5);
    expect(q('#detail-title')!.textContent).toBe('Corner Hardware');
    expect(q('[data-detail-receipt] img')!.getAttribute('src')).toBe(first);
    expect(n).toBe(3);
  });

  it('a failed ask is not the document\'s failure: the screen stays, the next tick asks again', async () => {
    h.getDocumentDetail.mockResolvedValueOnce(STUB).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(SETTLED);
    mount('en');
    await settle();
    await tick(READING_POLL_MS + 5);
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
    expect(container.textContent).not.toContain(strings.en.somethingWrong);
    await tick(READING_POLL_MS + 5);
    expect(q('#detail-title')!.textContent).toBe('Corner Hardware');
  });

  it('after READING_SLOW_MS the note says it is taking longer and where the result shows; after READING_MAX_MS it stops asking', async () => {
    h.getDocumentDetail.mockResolvedValue(STUB);
    mount('en');
    await settle();
    await tick(READING_SLOW_MS + READING_POLL_MS + 5);
    expect(q('[data-detail-reading-note]')!.getAttribute('data-detail-reading-note')).toBe('slow');
    expect(q('[data-detail-reading-note]')!.textContent).toBe(strings.en.detailReadingSlow);
    const atSlow = h.getDocumentDetail.mock.calls.length;
    expect(atSlow).toBeGreaterThan(20);
    await tick(READING_MAX_MS);
    const atMax = h.getDocumentDetail.mock.calls.length;
    await tick(READING_POLL_MS * 5);
    expect(h.getDocumentDetail.mock.calls.length).toBe(atMax);
    // the screen is still the reading state, not an error
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
  });
});

describe('a retry from the screen', () => {
  const retryButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(strings.en.retryExtraction))!;

  it('puts the screen into the reading state at once and tells the tray', async () => {
    h.getDocumentDetail.mockResolvedValue(SETTLED);
    h.reextract.mockResolvedValue({ documentId: 'd1', status: 'PROCESSING', reextracting: true });
    mount('en', true);
    await settle();
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBeNull();
    expect(q('[data-jobs]')!.getAttribute('data-jobs')).toBe('');

    // the server now says PROCESSING for a while
    h.getDocumentDetail.mockResolvedValue(STUB);
    flushSync(() => retryButton().click());
    await settle();
    expect(h.reextract).toHaveBeenCalledWith('d1');
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
    expect(q('#detail-title')!.textContent).toBe(strings.en.detailReadingTitle);
    expect(q('[data-jobs]')!.getAttribute('data-jobs')).toBe('d1:PROCESSING');
  });

  it('works without the tray (a bare render): the reading state, no throw', async () => {
    h.getDocumentDetail.mockResolvedValue(SETTLED);
    h.reextract.mockResolvedValue({});
    mount('en', false);
    await settle();
    h.getDocumentDetail.mockResolvedValue(STUB);
    flushSync(() => retryButton().click());
    await settle();
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBe('true');
  });

  it('a refused retry leaves the settled screen as it was', async () => {
    h.getDocumentDetail.mockResolvedValue(SETTLED);
    h.reextract.mockRejectedValue(new Error('nope'));
    mount('en', true);
    await settle();
    flushSync(() => retryButton().click());
    await settle();
    expect(q('[data-detail-header]')!.getAttribute('data-detail-reading')).toBeNull();
    expect(q('[data-jobs]')!.getAttribute('data-jobs')).toBe('');
  });
});
