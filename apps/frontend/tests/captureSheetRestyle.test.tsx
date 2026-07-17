import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// D8b PR 3 — CaptureSheet behavioural + RTL contract (NOT the source scan).
// ============================================================================
// The source-scan contract (tokens, no font-black, no physical-direction
// properties) lives in d8bModalRestyle.test.tsx, which now includes CaptureSheet
// in its FILES list. This file guards the two things a source scan cannot:
//
//  1. THE "LOCKED WHILE UPLOADING" CONTRACT. An in-flight upload must not be
//     dismissable, expressed through four independent paths, none tested before
//     PR 3. Lower severity than DeleteAccountModal's "locked while deleting"
//     (an upload is reversible — the file can be re-picked — while account
//     deletion is not), but every path is a droppable ternary during a restyle.
//
//  2. THE ONE RTL HAZARD. CaptureSheet has NO physical-direction properties
//     (its close buttons are in-flow via justify-between, not absolute right-2),
//     so the source scan asserts their ABSENCE and this file does NOT require the
//     logical idiom — that would be cargo-cult. Its only RTL exposure is the
//     Class-B truncation at the filename box (:225): a truncating box with no
//     `dir` clips a Latin filename from its leading end in Arabic. The fix is
//     `dir="auto"` on that <p>.
//
// ⚠️ jsdom HAS NO LAYOUT ENGINE. The Arabic test below asserts the `dir`
// ATTRIBUTE, which is a real regression guard, but proves nothing about which
// side the text actually clips. Per the D5 lesson (green CI + Vercel + jsdom all
// missed a live RTL defect), the Arabic sheet must still be opened in a real
// browser at a narrow width. Green here means nobody dropped `dir="auto"`; it
// does not mean the pixels are right.
// ============================================================================

// PaywallModal is imported statically by CaptureSheet and reads Paddle price ids
// at module-eval. It is out of PR 3's scope and irrelevant to these guards, so we
// stub it to nothing — this also keeps the test from touching the price backstop.
vi.mock('../src/components/PaywallModal', () => ({ PaywallModal: () => null }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/native/camera', () => ({ ensureCameraPermission: vi.fn(async () => true) }));

// Capture every useBackDismiss registration so we can assert on the ENABLED flag
// of the file-sheet path (:45 `useBackDismiss(!!file && !uploading, close)`).
// CaptureSheet calls the hook exactly twice per render, textually in order:
//   :44 chooser  → then  :45 file-sheet
// so the LAST call of the latest render is always the file-sheet registration.
const h = vi.hoisted(() => ({ backDismiss: vi.fn() }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: h.backDismiss }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { uploadDocument } from '../src/services/uploadService';
import { CaptureSheet } from '../src/components/CaptureSheet';

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
      </LanguageProvider>
    );
  });
  return ref;
}

// Feed a file straight into the hidden input — the sheet renders once a file
// exists, no ref handle or camera-permission dance needed. A PDF (not an image)
// forces the file-meta card with the truncating filename (the :225 branch),
// instead of the <img> preview.
const pickPdf = (name = 'quarterly-invoice-statement.pdf') => {
  const input = document.body.querySelector('[data-testid="file-input"]') as HTMLInputElement;
  const f = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
};

const sheet = () => document.body.querySelector('[data-testid="capture-sheet"]') as HTMLElement | null;
const buttons = () => [...(sheet()?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
const closeBtn = () =>
  buttons().find((b) => b.getAttribute('aria-label') === 'Close') as HTMLButtonElement;
const retakeBtn = () =>
  buttons().find((b) => b.textContent?.trim() === strings.en.retake) as HTMLButtonElement;
const extractBtn = () =>
  buttons().find((b) => /extract|uploading/i.test(b.textContent ?? '')) as HTMLButtonElement;
const lastBackDismissEnabled = () => {
  const calls = h.backDismiss.mock.calls;
  return calls[calls.length - 1]?.[0] as boolean; // the :45 file-sheet flag
};

// Drive the sheet into the uploading state and hold it there: uploadDocument
// returns a promise that never resolves, so `uploading` stays true and no
// trackUpload()/poll timer is ever created.
async function startUploadAndHold() {
  (uploadDocument as any).mockImplementation(() => new Promise<never>(() => {}));
  pickPdf();
  const extract = extractBtn();
  flushSync(() => extract.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await vi.waitFor(() => expect(extractBtn().disabled).toBe(true));
}

describe('CaptureSheet — the "locked while uploading" contract (4 paths)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  // Non-vacuous baseline: before an upload, every control is live and hardware
  // back is armed. If the "while uploading" assertions below ever pass only
  // because the controls are ALWAYS disabled, this test fails and exposes it.
  it('BASELINE (not uploading): controls enabled, hardware-back armed', () => {
    mount();
    pickPdf();
    expect(sheet()).toBeTruthy();
    expect(closeBtn().disabled).toBe(false);
    expect(retakeBtn().disabled).toBe(false);
    expect(extractBtn().disabled).toBe(false);
    expect(lastBackDismissEnabled()).toBe(true); // !!file && !uploading = true
  });

  it('PATH 1 (:45): hardware-back is DISARMED while uploading', async () => {
    mount();
    await startUploadAndHold();
    expect(lastBackDismissEnabled()).toBe(false); // !!file && !uploading = false
  });

  it('PATH 2 (:192): scrim click does NOT close the sheet while uploading', async () => {
    mount();
    await startUploadAndHold();
    const scrim = sheet()!.parentElement as HTMLElement; // the overlay wraps the panel
    flushSync(() => scrim.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // close() was gated behind `uploading ? undefined : close`, so the sheet stays.
    expect(sheet()).toBeTruthy();
  });

  it('PATH 3 (:205): the close (X) button is disabled while uploading', async () => {
    mount();
    await startUploadAndHold();
    expect(closeBtn().disabled).toBe(true);
  });

  it('PATH 4 (:236/:243): Retake and Extract are disabled while uploading', async () => {
    mount();
    await startUploadAndHold();
    expect(retakeBtn().disabled).toBe(true);
    expect(extractBtn().disabled).toBe(true);
  });
});

// ============================================================================
// The single RTL hazard: the filename box must carry dir="auto" (Class-B).
// ============================================================================
describe('CaptureSheet DOM — Arabic filename box is direction-agnostic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('AR: the truncating filename <p> has dir="auto" (leading-end clip fix)', () => {
    mount();
    const name = 'فاتورة-latin-mixed-2026.pdf';
    pickPdf(name);
    const p = [...document.body.querySelectorAll('p')].find((el) => el.textContent === name);
    expect(p, 'the filename paragraph should render in the file-meta card').toBeTruthy();
    expect(p!.className).toContain('truncate');
    expect(p!.getAttribute('dir')).toBe('auto');
  });
});
