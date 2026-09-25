import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// The receipt image on the detail page holds its frame while it loads and
// says so when it fails. Before this, a failed <img> was an empty box: the
// owner's iPhone showed the page "rendered but incomplete: the receipt image
// did not show" (2026-09-25). Against 874df35 the failure test fails: there is
// no fallback to find.
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); });

const DOC = {
  id: 'img-1', originalFileName: 'receipt.jpg', status: 'COMPLETED', overallConfidence: 0.99, uploadedAt: '2026-09-21T10:00:00Z',
  documentType: 'RECEIPT', facts: [], entities: [], documentEntities: [], signedFileUrl: 'https://storage.example/signed/receipt.jpg?token=x', reextractable: false,
};

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        <MemoryRouter initialEntries={['/documents/img-1']}>
          <Routes><Route path="/documents/:id" element={<DocumentDetailScreen />} /></Routes>
        </MemoryRouter>
      </ToastProvider></LanguageProvider>
    );
  });
}
const img = () => container.querySelector('img[alt="receipt.jpg"]') as HTMLImageElement | null;
const frame = () => container.querySelector('[data-detail-image]');

describe('the detail image', () => {
  it('holds a skeleton frame until the image loads, then shows it', async () => {
    h.getDocumentDetail.mockResolvedValue(DOC);
    mount();
    await vi.waitFor(() => expect(img()).not.toBeNull());
    expect(frame()!.getAttribute('data-detail-image')).toBe('loading');
    expect(frame()!.className).toContain('skeleton');
    flushSync(() => { img()!.dispatchEvent(new Event('load')); });
    expect(frame()!.getAttribute('data-detail-image')).toBe('loaded');
    expect(frame()!.className).not.toContain('skeleton');
    expect(img()!.className).not.toContain('opacity-0');
  });

  it('when the image fails, the frame says the preview is unavailable and offers the original (control: it did not before the failure)', async () => {
    h.getDocumentDetail.mockResolvedValue(DOC);
    mount();
    await vi.waitFor(() => expect(img()).not.toBeNull());
    expect(container.textContent).not.toContain(strings.en.previewUnavailable);
    flushSync(() => { img()!.dispatchEvent(new Event('error')); });
    expect(img()).toBeNull();
    expect(container.textContent).toContain(strings.en.previewUnavailable);
    const link = [...container.querySelectorAll('a')].find(a => a.textContent?.includes(strings.en.openOriginalSource))!;
    expect(link.getAttribute('href')).toBe(DOC.signedFileUrl);
  });

  it('moving to another document starts its image fresh: a failure on the last one does not hide the next', async () => {
    const NEXT = { ...DOC, id: 'img-2', originalFileName: 'next.jpg', signedFileUrl: 'https://storage.example/signed/next.jpg?token=y' };
    h.getDocumentDetail.mockImplementation(async (id: string) => (id === 'img-2' ? NEXT : DOC));
    localStorage.setItem('lang', 'en');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const { useNavigate } = await import('react-router-dom');
    const Go = () => { const nav = useNavigate(); return <button data-testid="go-next" onClick={() => nav('/documents/img-2')}>next</button>; };
    flushSync(() => {
      root.render(
        <LanguageProvider><ToastProvider>
          <MemoryRouter initialEntries={['/documents/img-1']}>
            <Go />
            <Routes><Route path="/documents/:id" element={<DocumentDetailScreen />} /></Routes>
          </MemoryRouter>
        </ToastProvider></LanguageProvider>
      );
    });
    await vi.waitFor(() => expect(img()).not.toBeNull());
    flushSync(() => { img()!.dispatchEvent(new Event('error')); });
    expect(container.textContent).toContain(strings.en.previewUnavailable);
    flushSync(() => { (container.querySelector('[data-testid="go-next"]') as HTMLButtonElement).click(); });
    await vi.waitFor(() => expect(container.querySelector('img[alt="next.jpg"]')).not.toBeNull());
    expect(frame()!.getAttribute('data-detail-image')).toBe('loading');
    expect(container.textContent).not.toContain(strings.en.previewUnavailable);
  });

  it('a timed-out document read is named, not a generic failure', async () => {
    const { RequestTimeoutError } = await import('../src/lib/fetchWithTimeout');
    h.getDocumentDetail.mockRejectedValue(new RequestTimeoutError('https://api.example/documents/img-1', 20_000));
    mount();
    await vi.waitFor(() => expect(container.textContent).toContain(strings.en.requestTimedOut));
    expect(container.textContent).not.toContain(strings.en.somethingWrong);
  });
});
