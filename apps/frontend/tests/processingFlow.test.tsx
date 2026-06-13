import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'capture-check@example.com' },
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
// jsdom can't decode images; the 2s preprocess timeout would slow every test.
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));

import { documentService } from '../src/services/documentService';
import { uploadDocument } from '../src/services/uploadService';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider, useProcessing } from '../src/contexts/ProcessingContext';
import { ProcessingTray } from '../src/components/ProcessingTray';
import { CaptureSheet, CaptureSheetHandle } from '../src/components/CaptureSheet';

const LS_KEY = 'sa_processing_jobs';

let container: HTMLDivElement;
let root: Root;
let settled: ReturnType<typeof vi.fn>;

const TrackButton: React.FC = () => {
  const { trackUpload } = useProcessing();
  return <button onClick={() => trackUpload('doc-x', 'snap.jpg')}>TRACK</button>;
};

function mount(children: React.ReactNode) {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <ProcessingProvider onJobSettled={settled}>
              {children}
              <ProcessingTray />
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

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  flushSync(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('ProcessingContext — app-level tray', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    settled = vi.fn();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('trackUpload polls by documentId, settles, notifies, and clears persistence', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'COMPLETED' });
    mount(<TrackButton />);

    click([...container.querySelectorAll('button')].find((b) => b.textContent === 'TRACK')!);

    await vi.waitFor(() => expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-x'));
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    // chip flips to the done state
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.processingDone)
    );
    // settled jobs no longer persist (nothing to resume)
    expect(JSON.parse(localStorage.getItem(LS_KEY) || '[]')).toEqual([]);
  });

  it('shows the chip with a processing count and the tray lists the file', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });
    mount(<TrackButton />);

    click([...container.querySelectorAll('button')].find((b) => b.textContent === 'TRACK')!);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.processingChip.replace('{n}', '1'))
    );
    click(document.body.querySelector('[data-testid="processing-chip"]')!);
    const tray = document.body.querySelector('[data-testid="processing-tray"]')!;
    expect(tray.textContent).toContain('snap.jpg');
    // duration reassurance: indeterminate bar + hint while in flight
    expect(tray.querySelector('[data-testid="job-progress"]')).toBeTruthy();
    expect(tray.textContent).toContain(strings.en.processingHint);
    // job stays persisted while PROCESSING (the resume set)
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].documentId).toBe('doc-x');
  });

  it('settled jobs show neither the progress bar nor the duration hint', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'COMPLETED' });
    mount(<TrackButton />);

    click([...container.querySelectorAll('button')].find((b) => b.textContent === 'TRACK')!);
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());

    click(document.body.querySelector('[data-testid="processing-chip"]')!);
    const tray = document.body.querySelector('[data-testid="processing-tray"]')!;
    expect(tray.querySelector('[data-testid="job-progress"]')).toBeNull();
    expect(tray.textContent).not.toContain(strings.en.processingHint);
  });

  it('resume-on-mount: a recent PROCESSING job picks its poll back up', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([{ documentId: 'doc-resume', fileName: 'bg.jpg', status: 'PROCESSING', startedAt: Date.now() - 60_000 }])
    );
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'NEEDS_REVIEW' });

    mount(null);

    await vi.waitFor(() => expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-resume'));
    // NEEDS_REVIEW settles -> onJobSettled -> Layout refetches stats (queue badge)
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
  });

  it('resume-on-mount ignores entries older than the resume window', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([{ documentId: 'doc-stale', fileName: 'old.jpg', status: 'PROCESSING', startedAt: Date.now() - 3 * 60 * 60 * 1000 }])
    );
    mount(null);

    await new Promise((r) => setTimeout(r, 50));
    expect(documentService.getDocumentDetail).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="processing-chip"]')).toBeNull();
  });
});

describe('CaptureSheet — one-tap mobile capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    settled = vi.fn();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  function mountCapture(plan?: 'FREE' | 'PRO') {
    const ref = React.createRef<CaptureSheetHandle>();
    mount(<CaptureSheet ref={ref} plan={plan} />);
    return ref;
  }

  function pickPhoto() {
    const input = document.body.querySelector('[data-testid="capture-input"]') as HTMLInputElement;
    setInputFiles(input, [new File(['img'], 'photo.jpg', { type: 'image/jpeg' })]);
  }

  function pickPdf() {
    const input = document.body.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    setInputFiles(input, [new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' })]);
  }

  it('scan action opens the source chooser: Take Photo + Choose File (single-file, PDF-capable)', () => {
    const ref = mountCapture('PRO');
    flushSync(() => ref.current!.open());

    const chooser = document.body.querySelector('[data-testid="source-chooser"]')!;
    expect(chooser).toBeTruthy();
    expect(chooser.textContent).toContain(strings.en.takePhoto);
    expect(chooser.textContent).toContain(strings.en.chooseFile);

    const cameraInput = document.body.querySelector('[data-testid="capture-input"]')!;
    const fileInput = document.body.querySelector('[data-testid="file-input"]')!;
    // camera path unchanged
    expect(cameraInput.getAttribute('capture')).toBe('environment');
    // file path must NOT force the camera and must accept PDFs
    expect(fileInput.getAttribute('capture')).toBeNull();
    expect(fileInput.getAttribute('accept')).toContain('application/pdf');
    // money path: chooser stays single-file — the FREE batch gate can't be reached
    expect(cameraInput.hasAttribute('multiple')).toBe(false);
    expect(fileInput.hasAttribute('multiple')).toBe(false);
  });

  it('a PDF via Choose File shows icon + filename (no img) and reaches uploadDocument', async () => {
    (uploadDocument as any).mockResolvedValue({ documentId: 'doc-pdf', status: 'PROCESSING' });
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });
    mountCapture('PRO');
    pickPdf();

    const sheet = document.body.querySelector('[data-testid="capture-sheet"]')!;
    expect(sheet.textContent).toContain('invoice.pdf');
    expect(sheet.querySelector('img')).toBeNull();

    const extract = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.extract)
    )!;
    click(extract);

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    expect((uploadDocument as any).mock.calls[0][0].name).toBe('invoice.pdf');
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.processingChip.replace('{n}', '1'))
    );
  });

  it('MONEY PATH: LIMIT_REACHED via the file-picker path still triggers the paywall', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    mountCapture('FREE');
    pickPdf();

    const extract = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.extract)
    )!;
    click(extract);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Unlock the full power of Scan & Action')
    );
  });

  it('photo confirm sheet appears with Extract and Retake', () => {
    mountCapture('PRO');
    pickPhoto();

    const sheet = document.body.querySelector('[data-testid="capture-sheet"]')!;
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain(strings.en.extract);
    expect(sheet.textContent).toContain(strings.en.retake);
  });

  it('Extract uploads, hands off to the tray, and dismisses the sheet immediately', async () => {
    (uploadDocument as any).mockResolvedValue({ documentId: 'doc-cam', status: 'PROCESSING' });
    (documentService.getDocumentDetail as any).mockResolvedValue({ status: 'PROCESSING' });
    mountCapture('PRO');
    pickPhoto();

    const extract = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.extract)
    )!;
    click(extract);

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    // sheet gone, user is free; chip carries the job
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="capture-sheet"]')).toBeNull());
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.processingChip.replace('{n}', '1'))
    );
    expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-cam');
  });

  it('MONEY PATH: LIMIT_REACHED on a FREE plan still triggers the paywall', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    mountCapture('FREE');
    pickPhoto();

    const extract = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.extract)
    )!;
    click(extract);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Unlock the full power of Scan & Action')
    );
  });

  it('MONEY PATH: a PRO plan is never paywalled on upload errors', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    mountCapture('PRO');
    pickPhoto();

    const extract = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.extract)
    )!;
    click(extract);

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain('Unlock the full power of Scan & Action');
  });
});
