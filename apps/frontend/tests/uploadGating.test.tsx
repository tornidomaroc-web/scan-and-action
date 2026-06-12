import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'gate-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getDocumentDetail: vi.fn(), getStats: vi.fn() },
}));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));

import { documentService } from '../src/services/documentService';
import { uploadDocument } from '../src/services/uploadService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { UploadModal } from '../src/components/UploadModal';

const PAYWALL_MARKER = 'Unlock the full power of Scan & Action';

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn>;

function mountModal(plan?: 'FREE' | 'PRO') {
  localStorage.setItem('lang', 'en');
  onClose = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <ProcessingProvider>
              <UploadModal isOpen onClose={onClose} onSuccess={() => {}} plan={plan} />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function click(el: Element) {
  flushSync(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function addFilesToInput(files: File[]) {
  const input = document.body.querySelector('input[multiple]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  flushSync(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const photo = (name: string) => new File(['img'], name, { type: 'image/jpeg' });

// These pin the FREE-plan gating and the LIMIT_REACHED -> paywall trigger,
// which moved with the modal refactor and must behave exactly as before.
describe('UploadModal — money path (gating + paywall trigger)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('GATE 1: FREE plan adding more than one file opens the paywall and rejects the batch', async () => {
    mountModal('FREE');
    addFilesToInput([photo('a.jpg'), photo('b.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain(PAYWALL_MARKER));
    // batch rejected: no Start Extraction button appears
    expect(document.body.textContent).not.toContain('Start Extraction');
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('GATE 1: unknown plan rejects multi-file batches without paywalling', async () => {
    mountModal(undefined);
    addFilesToInput([photo('a.jpg'), photo('b.jpg')]);

    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain(PAYWALL_MARKER);
    expect(document.body.textContent).not.toContain('Start Extraction');
  });

  it('GATE 2: LIMIT_REACHED from the API opens the paywall for a FREE user', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    mountModal('FREE');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    click([...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Start Extraction'))!);

    await vi.waitFor(() => expect(document.body.textContent).toContain(PAYWALL_MARKER));
  });

  it('GATE 2: the multi-document validation error also paywalls non-PRO users', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('Please upload a single document per image'));
    mountModal('FREE');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    click([...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Start Extraction'))!);

    await vi.waitFor(() => expect(document.body.textContent).toContain(PAYWALL_MARKER));
  });

  it('GATE 2: PRO users see the error but never the paywall', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    mountModal('PRO');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    click([...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Start Extraction'))!);

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain(PAYWALL_MARKER);
  });

  it('NO HOSTAGE: the modal closes freely while a document is still processing', async () => {
    (uploadDocument as any).mockResolvedValue({ documentId: 'doc-bg', status: 'PROCESSING' });
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });
    mountModal('PRO');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    click([...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Start Extraction'))!);

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    await vi.waitFor(() => expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-bg'));

    // doc is mid-processing; the backdrop click the old handleSafeClose
    // blocked for up to 90s must now close immediately
    const backdrop = document.body.querySelector('div[class*="z-[10000]"]')!;
    expect(backdrop).toBeTruthy();
    click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
