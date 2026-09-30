import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// The system document scanner (design step 3, first PR). Two things are pinned
// from the side a Linux runner can see:
//
//  1. THE WRAPPER (`native/documentScanner.ts`): every way the native call can
//     end is one named outcome, it never throws, and the temporary file is
//     always handed back for removal.
//  2. THE FALLBACK (`CaptureSheet.tsx`): the camera input that was the whole
//     capture path before the scanner is still reached when the scanner is
//     not on this platform, is missing from the binary, fails, or is
//     cancelled. The scanner is never the only way to capture.
//
// What only a phone can prove (the scanner's own screen, the edges it finds,
// the PDF it writes) is not claimed here.
// ============================================================================

const h = vi.hoisted(() => ({
  platform: 'ios',
  plugin: {
    isSupported: vi.fn(),
    scan: vi.fn(),
    discard: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => h.platform,
    isNativePlatform: () => h.platform !== 'web',
    convertFileSrc: (p: string) => p.replace('file://', 'capacitor://localhost/_capacitor_file_'),
  },
  registerPlugin: (name: string) => {
    if (name !== 'DocumentScanner') throw new Error(`unexpected plugin ${name}`);
    return h.plugin;
  },
}));
vi.mock('../src/components/PaywallModal', () => ({ PaywallModal: () => null }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn(async () => ({ documentId: 'doc-1', status: 'PROCESSING' })) }));
vi.mock('../src/native/camera', () => ({ ensureCameraPermission: vi.fn(async () => true) }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: vi.fn() }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { uploadDocument } from '../src/services/uploadService';
import { ensureCameraPermission } from '../src/native/camera';
import { CaptureSheet } from '../src/components/CaptureSheet';
import { scanDocument, hasScannerPlatform, MAX_SCAN_BYTES } from '../src/native/documentScanner';

const PATH = 'file:///private/var/mobile/tmp/scan-ABC.jpg';
const NOW = new Date(2026, 8, 30, 11, 5, 9);
const fetchMock = vi.fn();

const respond = (bytes: number, ok = true) =>
  fetchMock.mockResolvedValue({ ok, blob: async () => new Blob([new Uint8Array(bytes)]) });

beforeEach(() => {
  h.platform = 'ios';
  h.plugin.isSupported.mockReset().mockResolvedValue({ supported: true });
  h.plugin.scan.mockReset().mockResolvedValue({ status: 'success', path: PATH, mimeType: 'image/jpeg', pageCount: 1, bytes: 4 });
  h.plugin.discard.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  respond(4);
  vi.stubGlobal('fetch', fetchMock);
  (ensureCameraPermission as any).mockResolvedValue(true);
  (uploadDocument as any).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('scanDocument: one outcome per way the native call can end', () => {
  it('one page: a JPEG File named by the time of the scan, read through the Capacitor file URL, then discarded', async () => {
    const out = await scanDocument(NOW);
    expect(out.kind).toBe('scanned');
    if (out.kind !== 'scanned') return;
    expect(out.file.name).toBe('scan-20260930-110509.jpg');
    expect(out.file.type).toBe('image/jpeg');
    expect(out.file.size).toBe(4);
    expect(out.pageCount).toBe(1);
    expect(h.plugin.scan).toHaveBeenCalledWith({ maxBytes: MAX_SCAN_BYTES });
    expect(MAX_SCAN_BYTES).toBe(10 * 1024 * 1024);
    expect(fetchMock).toHaveBeenCalledWith('capacitor://localhost/_capacitor_file_/private/var/mobile/tmp/scan-ABC.jpg');
    expect(h.plugin.discard).toHaveBeenCalledWith({ path: PATH });
  });
  it('several pages: ONE PDF File, with the page count', async () => {
    h.plugin.scan.mockResolvedValue({ status: 'success', path: PATH.replace('.jpg', '.pdf'), mimeType: 'application/pdf', pageCount: 3, bytes: 9 });
    respond(9);
    const out = await scanDocument(NOW);
    expect(out).toMatchObject({ kind: 'scanned', pageCount: 3 });
    if (out.kind !== 'scanned') return;
    expect(out.file.name).toBe('scan-20260930-110509.pdf');
    expect(out.file.type).toBe('application/pdf');
  });
  it('another platform: unavailable, and the plugin is never called', async () => {
    for (const p of ['web', 'android']) {
      h.platform = p;
      expect(hasScannerPlatform()).toBe(false);
      expect(await scanDocument(NOW)).toEqual({ kind: 'unavailable' });
    }
    expect(h.plugin.isSupported).not.toHaveBeenCalled();
    expect(h.plugin.scan).not.toHaveBeenCalled();
  });
  it('a binary without the plugin (the bridge rejects isSupported): unavailable', async () => {
    h.plugin.isSupported.mockRejectedValue(Object.assign(new Error('"DocumentScanner" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }));
    expect(await scanDocument(NOW)).toEqual({ kind: 'unavailable' });
    expect(h.plugin.scan).not.toHaveBeenCalled();
  });
  it('unsupported hardware: unavailable', async () => {
    h.plugin.isSupported.mockResolvedValue({ supported: false });
    expect(await scanDocument(NOW)).toEqual({ kind: 'unavailable' });
  });
  it('cancelled in the scanner: cancelled, nothing read', async () => {
    h.plugin.scan.mockResolvedValue({ status: 'cancel' });
    expect(await scanDocument(NOW)).toEqual({ kind: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('the native call rejects: failed, with the code and never the message', async () => {
    h.plugin.scan.mockRejectedValue(Object.assign(new Error('The scan is too large to send as one document.'), { code: 'TOO_LARGE' }));
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'TOO_LARGE' });
    h.plugin.scan.mockRejectedValue(new Error('something native'));
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'SCAN_ERROR' });
  });
  it('a success with no path or an unknown type: failed', async () => {
    h.plugin.scan.mockResolvedValue({ status: 'success', mimeType: 'image/jpeg' });
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'NO_FILE' });
    h.plugin.scan.mockResolvedValue({ status: 'success', path: PATH, mimeType: 'image/heic' });
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'NO_FILE' });
  });
  it('the file cannot be read, is empty, or is over the upload limit: failed, and still discarded', async () => {
    respond(4, false);
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'READ_FAILED' });
    respond(0);
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'EMPTY_FILE' });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => ({ size: MAX_SCAN_BYTES + 1 }) });
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'TOO_LARGE' });
    fetchMock.mockRejectedValue(new TypeError('Load failed'));
    expect(await scanDocument(NOW)).toEqual({ kind: 'failed', reason: 'READ_FAILED' });
    expect(h.plugin.discard).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const ref = React.createRef<any>();
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <ProcessingProvider>
              <CaptureSheet ref={ref} plan="FREE" />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    );
  });
  flushSync(() => ref.current.open());
  return ref;
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync(() => {});
};
const q = (testid: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const tapCapture = async () => {
  flushSync(() => q('capture-action')!.click());
  await settle();
};

describe('CaptureSheet: the scanner first on iOS, the camera input for everything else', () => {
  let cameraClick: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    try { localStorage.setItem('language', 'en'); } catch { /* jsdom without storage */ }
    cameraClick = vi.fn();
  });
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });
  const watchCameraInput = () => {
    q('capture-input')!.click = cameraClick as unknown as () => void;
  };

  it('web: the button says "Take photo" and opens the camera input; the scanner is never asked', async () => {
    h.platform = 'web';
    mount();
    watchCameraInput();
    expect(q('capture-action')!.textContent).toContain(strings.en.takePhoto);
    await tapCapture();
    expect(cameraClick).toHaveBeenCalledTimes(1);
    expect(h.plugin.scan).not.toHaveBeenCalled();
    expect(h.plugin.isSupported).not.toHaveBeenCalled();
  });

  it('iOS, one page: the button says "Scan document", the confirm sheet opens on the scanned file with no pages note, and it uploads', async () => {
    mount();
    watchCameraInput();
    expect(q('capture-action')!.textContent).toContain(strings.en.scanDocumentAction);
    await tapCapture();
    expect(cameraClick).not.toHaveBeenCalled();
    expect(q('capture-sheet')).not.toBeNull();
    expect(q('scan-pages-note')).toBeNull();
    const extract = [...q('capture-sheet')!.querySelectorAll('button')].find((b) => b.textContent?.includes(strings.en.extract))!;
    flushSync(() => extract.click());
    await settle();
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    const sent = (uploadDocument as any).mock.calls[0][0] as File;
    expect(sent.type).toBe('image/jpeg');
    expect(sent.name).toMatch(/^scan-\d{8}-\d{6}\.jpg$/);
  });

  it('iOS, several pages: the sheet says how many pages and that they go as one document', async () => {
    h.plugin.scan.mockResolvedValue({ status: 'success', path: PATH.replace('.jpg', '.pdf'), mimeType: 'application/pdf', pageCount: 3, bytes: 9 });
    mount();
    await tapCapture();
    const note = q('scan-pages-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe(strings.en.scanPagesAsOne.replace('{n}', '3'));
    expect(note!.textContent).toContain('one document');
  });

  it('iOS, cancelled: back on the chooser, nothing picked, the scanner still offered', async () => {
    h.plugin.scan.mockResolvedValue({ status: 'cancel' });
    mount();
    watchCameraInput();
    await tapCapture();
    expect(q('capture-sheet')).toBeNull();
    expect(q('source-chooser')).not.toBeNull();
    expect(q('capture-action')!.textContent).toContain(strings.en.scanDocumentAction);
    expect(cameraClick).not.toHaveBeenCalled();
  });

  it('iOS, the plugin is missing from the binary: the same tap goes on to the camera input', async () => {
    h.plugin.isSupported.mockRejectedValue(Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' }));
    mount();
    watchCameraInput();
    await tapCapture();
    expect(cameraClick).toHaveBeenCalledTimes(1);
    expect(h.plugin.scan).not.toHaveBeenCalled();
  });

  it('iOS, the scanner fails: the chooser returns saying so, the button becomes "Take photo", and the next tap is the camera input', async () => {
    h.plugin.scan.mockRejectedValue(Object.assign(new Error('native'), { code: 'SCANNER_FAILED' }));
    mount();
    watchCameraInput();
    await tapCapture();
    expect(cameraClick).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(strings.en.scannerFailedUseCamera);
    expect(q('capture-action')!.textContent).toContain(strings.en.takePhoto);
    await tapCapture();
    expect(cameraClick).toHaveBeenCalledTimes(1);
    expect(h.plugin.scan).toHaveBeenCalledTimes(1);
  });

  it('iOS, too many pages for one document: the message says to scan fewer pages', async () => {
    h.plugin.scan.mockRejectedValue(Object.assign(new Error('native'), { code: 'TOO_LARGE' }));
    mount();
    await tapCapture();
    expect(document.body.textContent).toContain(strings.en.scannerTooLarge);
  });

  it('iOS, camera permission refused: the scanner is not opened and the chooser stays', async () => {
    (ensureCameraPermission as any).mockResolvedValue(false);
    mount();
    await tapCapture();
    expect(h.plugin.scan).not.toHaveBeenCalled();
    expect(q('source-chooser')).not.toBeNull();
    expect(document.body.textContent).toContain(strings.en.cameraPermissionDenied);
  });
});

describe('the scanner copy exists in every language, with the {n} slot and no dash', () => {
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(lang, () => {
      const c = strings[lang];
      for (const key of ['scanDocumentAction', 'scanPagesAsOne', 'scannerFailedUseCamera', 'scannerTooLarge'] as const) {
        expect(c[key].length, key).toBeGreaterThan(5);
        expect(c[key], key).not.toMatch(/[-–—٠-٩۰-۹]/);
      }
      expect(c.scanPagesAsOne).toContain('{n}');
    });
  }
});
