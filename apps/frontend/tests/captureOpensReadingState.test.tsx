import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

// ============================================================================
// A scan lands on its own reading screen (design step 3).
// ============================================================================
// After Extract, the sheet closed and the person stayed where they were, with
// a toast and a chip. Now the receipt screen opens on the new document, which
// shows the picture at once and the verdict when the read settles
// (readingState.test.tsx). The toast and the tray hand-off are unchanged.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'x@example.com' }, session: null, loading: false, signOut: async () => {} }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({ documentService: { getDocumentDetail: vi.fn(), getStats: vi.fn() } }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));

import { documentService } from '../src/services/documentService';
import { uploadDocument } from '../src/services/uploadService';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { CaptureSheet, CaptureSheetHandle } from '../src/components/CaptureSheet';

let container: HTMLDivElement;
let root: Root;
const Where: React.FC = () => <div data-where={useLocation().pathname} />;

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const ref = React.createRef<CaptureSheetHandle>();
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <ProcessingProvider><Where /><CaptureSheet ref={ref} plan="PRO" /></ProcessingProvider>
        </MemoryRouter>
      </ToastProvider></LanguageProvider>
    );
  });
  return ref;
}
const where = () => container.querySelector('[data-where]')!.getAttribute('data-where');

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { root.unmount(); container.remove(); });

function pickPhoto() {
  const input = document.body.querySelector('[data-testid="capture-input"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['img'], 'photo.jpg', { type: 'image/jpeg' })], configurable: true });
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
}
const extract = () => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(strings.en.extract))!;

it('Extract: upload, then the receipt screen of the new document, with the tray told and the toast shown', async () => {
  (uploadDocument as any).mockResolvedValue({ documentId: 'doc-9', status: 'PROCESSING' });
  (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });
  mount();
  pickPhoto();
  expect(where()).toBe('/dashboard');
  flushSync(() => extract().click());
  await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
  await vi.waitFor(() => expect(where()).toBe('/documents/doc-9'));
  expect(document.body.textContent).toContain(strings.en.uploadedProcessing);
  await vi.waitFor(() => expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-9'));
  expect(document.body.querySelector('[data-testid="capture-sheet"]')).toBeNull();
});

it('a failed upload goes nowhere: the person stays with the sheet and the error', async () => {
  (uploadDocument as any).mockRejectedValue(new Error('DAILY_LIMIT_REACHED'));
  mount();
  pickPhoto();
  flushSync(() => extract().click());
  await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(where()).toBe('/dashboard');
  expect(documentService.getDocumentDetail).not.toHaveBeenCalled();
});
