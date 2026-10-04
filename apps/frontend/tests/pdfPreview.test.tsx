import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// A scanned PDF gets a picture on the receipt screen where the browser can
// draw one, and keeps today's link row where it cannot (lib/pdfPreview.ts).
// ============================================================================
// Several pages from the iOS scanner become ONE PDF
// (ios/App/App/DocumentScannerPlugin.swift). The detail screen drew the
// receipt card for image file names only, so that PDF got a bare link.
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { canInlinePdf, isPdfFileName, pdfPreviewSrc } from '../src/lib/pdfPreview';

let container: HTMLDivElement;
let root: Root;
const PDF = {
  id: 'p1', originalFileName: 'scan-20261004-101500.pdf', status: 'COMPLETED', overallConfidence: 0.99, uploadedAt: '2026-10-04T10:15:00Z',
  documentType: 'RECEIPT', facts: [{ key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 120, currency: 'USD', confidence: 0.99 }],
  entities: [], documentEntities: [], signedFileUrl: 'https://storage.example/signed/scan.pdf?token=x', reextractable: false,
};

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function setNavigator(nav: { userAgent?: string; pdfViewerEnabled?: boolean }) {
  Object.defineProperty(window.navigator, 'userAgent', { value: nav.userAgent ?? '', configurable: true });
  Object.defineProperty(window.navigator, 'pdfViewerEnabled', { value: nav.pdfViewerEnabled, configurable: true });
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); setNavigator({ userAgent: 'jsdom' }); });

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

describe('canInlinePdf', () => {
  it('yes on an iPhone (WKWebView draws PDFs natively) and wherever the browser says it has a viewer', () => {
    expect(canInlinePdf({ userAgent: IOS_UA })).toBe(true);
    expect(canInlinePdf({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', pdfViewerEnabled: true })).toBe(true);
  });
  it('no on Android, on a browser with no viewer, and with nothing known', () => {
    expect(canInlinePdf({ userAgent: ANDROID_UA, pdfViewerEnabled: false })).toBe(false);
    expect(canInlinePdf({ userAgent: ANDROID_UA })).toBe(false);
    expect(canInlinePdf({})).toBe(false);
    expect(canInlinePdf(undefined)).toBe(false);
  });
  it('isPdfFileName and the viewer hints', () => {
    expect(isPdfFileName('scan-1.pdf')).toBe(true);
    expect(isPdfFileName('SCAN.PDF')).toBe(true);
    expect(isPdfFileName('scan.jpg')).toBe(false);
    expect(isPdfFileName(null)).toBe(false);
    expect(pdfPreviewSrc('https://x/y.pdf?token=t')).toBe('https://x/y.pdf?token=t#toolbar=0&navpanes=0&scrollbar=0&view=FitH');
  });
});

describe('the receipt card for a scanned PDF', () => {
  it('on an iPhone: the first page in the card, the card opens the original, the frame takes no taps', async () => {
    setNavigator({ userAgent: IOS_UA });
    await mount(PDF);
    const frame = container.querySelector('[data-detail-pdf] iframe')!;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('src')).toBe(pdfPreviewSrc(PDF.signedFileUrl));
    expect(frame.className).toContain('pointer-events-none');
    const link = container.querySelector('[data-detail-receipt] a')!;
    expect(link.getAttribute('href')).toBe(PDF.signedFileUrl);
    expect(container.textContent).not.toContain(strings.en.previewUnavailable);
    expect(container.textContent).toContain(strings.en.openOriginalSource);
  });

  it('where no viewer is known (Android, jsdom): the link row, exactly as today', async () => {
    setNavigator({ userAgent: ANDROID_UA, pdfViewerEnabled: false });
    await mount(PDF);
    expect(container.querySelector('[data-detail-pdf]')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain(strings.en.previewUnavailable);
    expect(container.textContent).toContain('scan-20261004-101500.pdf');
    expect(container.querySelector('[data-detail-receipt] a')!.getAttribute('href')).toBe(PDF.signedFileUrl);
  });

  it('a photo is never put in a frame, viewer or not', async () => {
    setNavigator({ userAgent: IOS_UA, pdfViewerEnabled: true });
    await mount({ ...PDF, originalFileName: 'scan.jpg', signedFileUrl: 'https://storage.example/signed/scan.jpg?token=x' });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-detail-image]')).toBeTruthy();
  });
});
