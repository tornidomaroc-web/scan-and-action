import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// EVERY FILE THE UPLOAD DIALOG SHOWS HAS BEEN SENT, OR ONE VISIBLE ACTION SENDS IT.
// ============================================================================
// Found 2026-09-23 on production: after an upload finished, a file added in the
// same dialog session was listed under the finished panel with no way to start
// it, and Done closed the dialog without sending it. No request, no row, no
// error, no retry: a user told a receipt was uploaded when it never left the
// browser. It was invisible to every database instrument because nothing was
// ever written.
//
// Eleven test files touched this dialog and none could have caught it: each one
// picks files once and stops before an upload, on an error, or at the success
// state. None ever picked a file AFTER a batch had finished. This file closes
// that gap by asserting the rule the repository never had.
//
// THE RULE, stated as behaviour and not as a button label. For every file the
// dialog shows, either
//   (a) it has already been handed to uploadDocument, or
//   (b) ONE activation of ONE visible control in the dialog sends it.
// (b) is found by exploration, not by name: the scenario is replayed once per
// visible button, each replay clicks a different one, and the rule holds if any
// single click hands the file to uploadDocument. ONE activation is the point:
// in the defect the only way out was "Manage Files" and then a Start button that
// only appeared afterwards, a two-step path through a control that does not say
// it sends anything. A checker that followed chains of clicks would have passed
// the defect.
//
// The string catalog appears below only to prove each scenario reached the state
// it names (the header reads the finished state before the next file is added).
// The rule check itself reads no label.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'unsent-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getDocumentDetail: vi.fn(async () => ({ status: 'PROCESSING' })), getStats: vi.fn() },
}));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));

import { uploadDocument } from '../src/services/uploadService';
import { documentService } from '../src/services/documentService';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { UploadModal } from '../src/components/UploadModal';

// ── the scenario language ───────────────────────────────────────────────────
// A file's NAME decides what the mocked upload does with it:
//   *.fail.jpg   the upload rejects
//   *.held.jpg   the upload stays in flight until a `release` step
//   anything else the upload is accepted (202, as production answers)
type Step =
  | { pick: string[] }       // one selection through the drop zone's file input
  | { start: true }          // press Start: used only to REACH a state, never to judge it
  | { release: string }      // let a held upload finish
  | { reopen: true };        // close the dialog and open it again

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const held = new Map<string, () => void>();

const tick = () => new Promise((r) => setTimeout(r, 0));
/** Wait until the page stops changing: two quiet ticks in a row, 40 at most.
 *  Every mocked upload settles in microtasks, and React flushes them on the
 *  next tick, so a quiet page means the step's consequences have all landed. */
async function settle() {
  let last = document.body.innerHTML;
  for (let i = 0, quiet = 0; i < 40 && quiet < 2; i++) {
    await tick();
    const now = document.body.innerHTML;
    quiet = now === last ? quiet + 1 : 0;
    last = now;
  }
}

function render(isOpen: boolean) {
  flushSync(() => {
    root!.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <ProcessingProvider>
              <UploadModal isOpen={isOpen} onClose={() => {}} onSuccess={() => {}} plan="PRO" />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function teardown() {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
}

/** The dialog's own subtree. Toasts and the processing tray render elsewhere and
 *  can carry a file's name, so nothing outside this root counts as "shown". */
function dialog(): Element | null {
  return document.body.querySelector('div.z-modal');
}

function visibleButtons(): HTMLButtonElement[] {
  const d = dialog();
  if (!d) return [];
  return [...d.querySelectorAll('button')].filter((b) => !b.disabled && !b.closest('.hidden'));
}

async function run(steps: Step[]) {
  teardown();
  held.clear();
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  (uploadDocument as any).mockReset();
  (uploadDocument as any).mockImplementation((file: File) => {
    if (file.name.endsWith('.fail.jpg')) return Promise.reject(new Error('UPLOAD_TEST_FAILURE'));
    const accepted = { documentId: `doc-${file.name}`, status: 'PROCESSING' };
    if (file.name.endsWith('.held.jpg')) {
      return new Promise((resolve) => held.set(file.name, () => resolve(accepted)));
    }
    return Promise.resolve(accepted);
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  render(true);
  await settle();

  for (const step of steps) {
    if ('pick' in step) {
      const input = dialog()!.querySelector('input[multiple]') as HTMLInputElement;
      const files = step.pick.map((n) => new File(['img'], n, { type: 'image/jpeg' }));
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      flushSync(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    } else if ('start' in step) {
      const start = dialog()!.querySelector('[data-testid="start-extraction"]') as HTMLButtonElement | null;
      expect(start, 'setup could not reach its state: no Start control to press').not.toBeNull();
      flushSync(() => { start!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    } else if ('release' in step) {
      const done = held.get(step.release);
      expect(done, `setup: ${step.release} was never sent, so it cannot be released`).toBeDefined();
      done!();
    } else {
      render(false);
      await settle();
      render(true);
    }
    await settle();
  }
}

const sentNames = () => (uploadDocument as any).mock.calls.map((c: [File]) => c[0].name) as string[];
const namesIn = (steps: Step[]) => steps.flatMap((s) => ('pick' in s ? s.pick : []));
const shownFiles = (steps: Step[]) => namesIn(steps).filter((n) => (dialog()?.textContent ?? '').includes(n));
const header = () => dialog()?.querySelector('h2')?.textContent?.trim();

/** Does ONE activation of ONE visible control, from this exact state, send `name`? */
async function oneActionSends(steps: Step[], name: string): Promise<boolean> {
  await run(steps);
  const count = visibleButtons().length;
  for (let i = 0; i < count; i++) {
    await run(steps);
    const before = sentNames().filter((n) => n === name).length;
    const button = visibleButtons()[i];
    flushSync(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    const after = sentNames().filter((n) => n === name).length;
    if (after > before) return true;
  }
  return false;
}

/** THE RULE. Returns the files that break it, so a failure names them. */
async function strandedFiles(steps: Step[]): Promise<string[]> {
  await run(steps);
  const shown = shownFiles(steps);
  const sent = sentNames();
  expect(shown.length, 'the scenario must leave a file on screen, or the rule is checked against nothing').toBeGreaterThan(0);
  const stranded: string[] = [];
  for (const name of shown) {
    if (sent.includes(name)) continue;
    if (!(await oneActionSends(steps, name))) stranded.push(name);
  }
  return stranded;
}

/** Proves the scenario reached the state it is named after, before the new file arrives. */
async function expectStateBeforeAdd(steps: Step[], expected: string) {
  await run(steps.slice(0, -1));
  expect(header(), 'the scenario did not reach the finished state it is named after').toBe(expected);
}

const SUCCESS_THEN_ADD: Step[] = [{ pick: ['s-first.jpg'] }, { start: true }, { pick: ['s-next.jpg'] }];
const PARTIAL_THEN_ADD: Step[] = [{ pick: ['p-ok.jpg', 'p-bad.fail.jpg'] }, { start: true }, { pick: ['p-next.jpg'] }];
const ERROR_THEN_ADD: Step[] = [{ pick: ['e-bad.fail.jpg'] }, { start: true }, { pick: ['e-next.jpg'] }];
// Added WHILE the first upload is still in flight, then the batch finishes.
const DURING_UPLOAD_ADD: Step[] = [{ pick: ['m-first.held.jpg'] }, { start: true }, { pick: ['m-next.jpg'] }, { release: 'm-first.held.jpg' }];
const REOPEN_THEN_ADD: Step[] = [{ pick: ['r-first.jpg'] }, { start: true }, { reopen: true }, { pick: ['r-next.jpg'] }];

describe('upload dialog: a file added after a batch finishes is never stranded', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { teardown(); });

  it('after a SUCCESS: the next file is sent or one action sends it', async () => {
    await expectStateBeforeAdd(SUCCESS_THEN_ADD, strings.en.uploadSuccess);
    expect(await strandedFiles(SUCCESS_THEN_ADD)).toEqual([]);
  }, 60_000);

  it('after a PARTIAL result: the next file is sent or one action sends it', async () => {
    await expectStateBeforeAdd(PARTIAL_THEN_ADD, strings.en.uploadPartial);
    expect(await strandedFiles(PARTIAL_THEN_ADD)).toEqual([]);
  }, 60_000);

  it('after an ERROR: the next file is sent or one action sends it', async () => {
    await expectStateBeforeAdd(ERROR_THEN_ADD, strings.en.uploadError);
    expect(await strandedFiles(ERROR_THEN_ADD)).toEqual([]);
  }, 60_000);

  it('added WHILE an upload is in flight: once the batch finishes, it is sent or one action sends it', async () => {
    // Not a finished state but an entry path into one: the file joins the list
    // after the batch has started, so the batch does not include it, and the
    // finished state arrives with the file still on screen.
    await run(DURING_UPLOAD_ADD.slice(0, 3));
    expect(sentNames(), 'setup: the first upload should be in flight when the next file is added').toEqual(['m-first.held.jpg']);
    expect(shownFiles(DURING_UPLOAD_ADD)).toContain('m-next.jpg');
    // The header cannot prove the batch finished here: once an unsent file is on
    // screen the fixed dialog is RIGHT not to show a finished state. The tray
    // can: it starts polling a document the moment the upload hands it over.
    await run(DURING_UPLOAD_ADD);
    expect(documentService.getDocumentDetail, 'setup: the first upload never finished').toHaveBeenCalledWith('doc-m-first.held.jpg');
    expect(await strandedFiles(DURING_UPLOAD_ADD)).toEqual([]);
  }, 60_000);

  it('CONTROL: close and reopen between files, and the next file is sendable (this path never broke)', async () => {
    // Reopening resets the dialog, so this holds with or without the fix. It is
    // what separates the in-session cases above from a checker that passes for
    // the wrong reason: they fail on the unfixed dialog while this one passes.
    await run(REOPEN_THEN_ADD);
    expect(shownFiles(REOPEN_THEN_ADD)).toEqual(['r-next.jpg']);
    expect(await strandedFiles(REOPEN_THEN_ADD)).toEqual([]);
  }, 60_000);
});

describe('the checker itself', () => {
  afterEach(() => { teardown(); });

  it('POSITIVE CONTROL: a freshly picked file is found sendable by one action', async () => {
    const steps: Step[] = [{ pick: ['c-fresh.jpg'] }];
    expect(await oneActionSends(steps, 'c-fresh.jpg')).toBe(true);
  }, 60_000);

  it('NEGATIVE CONTROL: it counts ONE action, so a two-step path through "Manage Files" does not count', async () => {
    // After a failed upload, the dialog re-sends the failed file only through
    // "Manage Files" and THEN a Start button that appears afterwards. That is
    // the shape the defect left an unsent file in, and a checker that followed
    // it would have passed the defect. The failed file itself satisfies the
    // rule through (a), because it was sent; this checks only the explorer.
    // If a one-action retry is ever added to the error state, this control
    // changes meaning and must be revisited deliberately.
    const steps: Step[] = [{ pick: ['n-bad.fail.jpg'] }, { start: true }];
    await run(steps);
    expect(header()).toBe(strings.en.uploadError);
    expect(await oneActionSends(steps, 'n-bad.fail.jpg')).toBe(false);
  }, 60_000);

  it('NEGATIVE CONTROL: a file that is not in the dialog is never reported as sendable', async () => {
    expect(await oneActionSends([{ pick: ['c-real.jpg'] }], 'c-absent.jpg')).toBe(false);
  }, 60_000);
});
