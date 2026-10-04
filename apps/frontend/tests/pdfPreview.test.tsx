import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// A scanned PDF gets its first page drawn into the receipt card, and the link
// row it had before whenever the drawing fails (components/PdfPagePreview.tsx,
// lib/pdfFirstPage.ts).
// ============================================================================
// Several pages from the iOS scanner become ONE PDF. The first version of this
// card put the PDF in an <iframe>; on the owner's iPhone (build 15) WebKit's
// plugin drew a fragment at its own zoom ("Walm", a blank strip). pdf.js draws
// the page at the card's width. jsdom has no canvas, so the renderer is a
// double here; its real drawing is witnessed in a browser (the PR).
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn(), render: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));
vi.mock('../src/lib/pdfFirstPage', () => ({ renderPdfFirstPage: h.render }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { isPdfFileName } from '../src/lib/pdfPreview';

let container: HTMLDivElement;
let root: Root;
const PDF = {
  id: 'p1', originalFileName: 'scan-20261004-023738.pdf', status: 'COMPLETED', overallConfidence: 0.99, uploadedAt: '2026-10-04T02:37:38Z',
  documentType: 'RECEIPT', facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 54.5, currency: 'CHF', confidence: 0.99 }],
  entities: [], documentEntities: [], signedFileUrl: 'https://storage.example/signed/scan.pdf?token=x', reextractable: false,
};

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom lays nothing out: give the frame a width, as a phone would.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 358; } });
});
afterEach(() => { root?.unmount(); container?.remove(); });

async function mount(doc: any) {
  h.getDocumentDetail.mockResolvedValue(doc);
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        <MemoryRouter initialEntries={[`/documents/${doc.id}`]}>
          <Routes><Route path="/documents/:id" element={<DocumentDetailScreen />} /></Routes>
        </MemoryRouter>
      </ToastProvider></LanguageProvider>
    );
  });
  await vi.waitFor(() => expect(container.querySelector('[data-detail-receipt]')).toBeTruthy());
}

describe('isPdfFileName', () => {
  it('reads the extension, any case, never a photo', () => {
    expect(isPdfFileName('scan-1.pdf')).toBe(true);
    expect(isPdfFileName('SCAN.PDF')).toBe(true);
    expect(isPdfFileName('scan.jpg')).toBe(false);
    expect(isPdfFileName(null)).toBe(false);
  });
});

describe('the receipt card for a scanned PDF', () => {
  it('draws page 1 at the card width into the card, which opens the original', async () => {
    h.render.mockResolvedValue({ pages: 2, cssWidth: 358, cssHeight: 477 });
    await mount(PDF);
    await vi.waitFor(() => expect(container.querySelector('[data-detail-pdf]')!.getAttribute('data-detail-pdf')).toBe('loaded'));
    expect(h.render).toHaveBeenCalledTimes(1);
    const [url, canvas, width] = h.render.mock.calls[0];
    expect(url).toBe(PDF.signedFileUrl);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(width).toBe(358);
    expect(container.querySelector('[data-detail-receipt] a')!.getAttribute('href')).toBe(PDF.signedFileUrl);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).not.toContain(strings.en.previewUnavailable);
    expect(container.textContent).toContain(strings.en.openOriginalSource);
  });

  it('holds the skeleton while drawing', async () => {
    h.render.mockReturnValue(new Promise(() => {}));
    await mount(PDF);
    const frame = container.querySelector('[data-detail-pdf]')!;
    expect(frame.getAttribute('data-detail-pdf')).toBe('loading');
    expect(frame.className).toContain('skeleton');
  });

  it('falls back to the link row, exactly as before, when the drawing fails for any reason', async () => {
    h.render.mockRejectedValue(new Error('pdf fetch 403'));
    await mount(PDF);
    await vi.waitFor(() => expect(container.textContent).toContain(strings.en.previewUnavailable));
    expect(container.querySelector('[data-detail-pdf]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent).toContain('scan-20261004-023738.pdf');
    expect(container.querySelector('[data-detail-receipt] a')!.getAttribute('href')).toBe(PDF.signedFileUrl);
  });

  it('a photo never reaches the renderer', async () => {
    await mount({ ...PDF, originalFileName: 'scan.jpg', signedFileUrl: 'https://storage.example/signed/scan.jpg?token=x' });
    expect(h.render).not.toHaveBeenCalled();
    expect(container.querySelector('[data-detail-image]')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
