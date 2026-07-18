import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

// ============================================================================
// UPLOAD MODAL — the "hardware back closes the modal" contract (D8b PR 4a).
// ============================================================================
// UploadModal is mounted in the app shell (Layout.tsx:123) and opens over
// /dashboard — a HOME_ROUTE (NativeBackButton.tsx:9). Before this fix it was the
// ONLY overlay that never registered on the overlay stack, so the Android
// hardware back button skipped it entirely:
//
//   NativeBackButton.tsx:30  if (closeTopOverlay()) return;   // nothing registered
//   NativeBackButton.tsx:33  HOME_ROUTES.has(path) -> App.minimizeApp()  // <-- BUG
//   NativeBackButton.tsx:37  MAIN_TABS.has(path)   -> navigate('/dashboard')
//
// So opening the modal and pressing back MINIMIZED the app (from /dashboard) or
// NAVIGATED the screen out from under the still-open modal (from a main tab).
//
// The fix is a single line in UploadModal:
//   useBackDismiss(isOpen, onClose)   // bare isOpen, NOT !uploading (§4/§9)
//
// These tests drive the REAL overlay stack AND the REAL NativeBackButton (with a
// mocked Capacitor bridge), so the whole chain — registration -> closeTopOverlay
// -> onClose — is exercised end-to-end, not stubbed. `useBackDismiss` is
// deliberately NOT mocked.
//
// MUTATION CHECK: delete the `useBackDismiss(isOpen, onClose)` line and every
// "FIX" assertion below flips red — back reaches App.minimizeApp()/navigate()
// and onClose is never called. The CONTROL cases (modal closed) stay green,
// proving the harness reproduces the pre-fix behaviour rather than passing
// vacuously.
// ============================================================================

// The native bridge, faked so we can (a) turn native on/off and (b) capture the
// hardware back-button callback and observe App.minimizeApp().
const h = vi.hoisted(() => ({
  native: { value: true },
  minimizeApp: vi.fn(async () => {}),
  backCb: { current: null as null | (() => void) },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native.value },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, cb: () => void) => {
      if (name === 'backButton') h.backCb.current = cb;
      return Promise.resolve({ remove: vi.fn() });
    },
    minimizeApp: h.minimizeApp,
  },
}));

// Upstream module deps that must never hit real network / canvas.
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
// PaywallModal (nested child portal) reads useAuth(); give it a real user so its
// web branch renders for the LIFO composition test.
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'upload-back@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));

import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { closeTopOverlay } from '../src/native/overlayStack';
import { NativeBackButton } from '../src/native/NativeBackButton';
import { UploadModal } from '../src/components/UploadModal';

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn>;
let currentPath = '';

function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

/** Fire the Android hardware back button through the REAL NativeBackButton. */
function pressBack() {
  expect(h.backCb.current, 'NativeBackButton must have registered a backButton listener').toBeTruthy();
  flushSync(() => h.backCb.current!());
}

function mount({ path = '/dashboard', isOpen = true }: { path?: string; isOpen?: boolean } = {}) {
  onClose = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <ProcessingProvider>
              <NativeBackButton />
              <LocationProbe />
              <UploadModal isOpen={isOpen} onClose={onClose} onSuccess={() => {}} plan="FREE" />
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function reset() {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  h.backCb.current = null;
  currentPath = '';
  // Start every test from an empty overlay stack.
  while (closeTopOverlay()) { /* noop */ }
}
function teardown() {
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
  while (closeTopOverlay()) { /* noop */ }
}

describe('UploadModal — hardware back over a HOME_ROUTE (/dashboard) closes the modal, not the app', () => {
  beforeEach(() => { h.native.value = true; reset(); });
  afterEach(teardown);

  // CONTROL: with the modal closed the app behaves exactly as the pre-fix bug
  // report describes — back over /dashboard minimizes the app. This proves the
  // harness is wired to the real minimize path (so the FIX test isn't vacuous)
  // and pins the behaviour the fix must NOT change when the modal is absent.
  it('CONTROL (modal closed): back over /dashboard minimizes the app', () => {
    mount({ path: '/dashboard', isOpen: false });
    expect(closeTopOverlay()).toBe(false); // nothing registered while closed
    pressBack();
    expect(h.minimizeApp).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  // THE FIX: with the modal open, back closes it and the app is NOT minimized.
  it('FIX (modal open): back closes the modal and does NOT minimize the app', () => {
    mount({ path: '/dashboard', isOpen: true });
    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.minimizeApp).not.toHaveBeenCalled();
  });
});

describe('UploadModal — hardware back over a MAIN_TAB (/search) closes the modal, not the screen underneath', () => {
  beforeEach(() => { h.native.value = true; reset(); });
  afterEach(teardown);

  // CONTROL: without the modal, back over a main tab navigates to /dashboard —
  // the "screen underneath" moving. This is the second half of the bug.
  it('CONTROL (modal closed): back over /search navigates to /dashboard', async () => {
    mount({ path: '/search', isOpen: false });
    expect(currentPath).toBe('/search');
    pressBack();
    // <Navigate> resolves on the next tick.
    await vi.waitFor(() => expect(currentPath).toBe('/dashboard'));
    expect(onClose).not.toHaveBeenCalled();
  });

  // THE FIX: with the modal open, back closes it and leaves the route put — the
  // screen underneath does not navigate.
  it('FIX (modal open): back closes the modal and leaves /search in place', () => {
    mount({ path: '/search', isOpen: true });
    expect(currentPath).toBe('/search');
    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(currentPath).toBe('/search');
  });
});

describe('UploadModal — bare isOpen (dismissable mid-upload), and registration is gated on open', () => {
  beforeEach(() => { h.native.value = true; reset(); });
  afterEach(teardown);

  // §4/§9: the hook is `isOpen`, NOT `isOpen && !uploading`. The modal is
  // intentionally dismissable while an upload is in flight (the app-level tray
  // owns it), matching the unguarded scrim/X. So a registration exists the
  // moment the modal opens — we don't need to reach the uploading state to see
  // it, and there is no "locked while uploading" back-dismiss guard to assert.
  it('registers on open (a stray back-dismiss lock would leave the stack empty)', () => {
    mount({ path: '/dashboard', isOpen: true });
    // One registration present -> closing it fires onClose.
    expect(closeTopOverlay()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    // ...and it was the only one.
    expect(closeTopOverlay()).toBe(false);
  });

  it('does NOT register while closed (isOpen gates the registration)', () => {
    mount({ path: '/dashboard', isOpen: false });
    expect(closeTopOverlay()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('UploadModal — composes with the nested PaywallModal via LIFO', () => {
  // The web (non-native) multi-file FREE path opens the nested <PaywallModal>
  // (UploadModal.tsx:434), which registers its OWN back-dismiss. Back must peel
  // the paywall first, then the modal — last-in, first-out.
  beforeEach(() => { h.native.value = false; reset(); });
  afterEach(teardown);

  const addFiles = (files: File[]) => {
    const input = document.body.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };
  const photo = (name: string) => new File(['img'], name, { type: 'image/jpeg' });

  it('back closes the paywall first, then the upload modal', async () => {
    mount({ path: '/dashboard', isOpen: true });
    // Two files on FREE (web) -> setShowPaywall(true) -> PaywallModal mounts.
    addFiles([photo('a.jpg'), photo('b.jpg')]);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Upgrade to PRO'));

    // First back: the paywall (top of stack) closes; the upload modal stays open.
    expect(closeTopOverlay()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('Upgrade to PRO'));

    // Second back: the upload modal closes.
    expect(closeTopOverlay()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
