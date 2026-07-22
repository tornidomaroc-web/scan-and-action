import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// SILENT-APP / ANTI-STEERING INVARIANT — NON-NEGOTIABLE (Play Store compliance)
// ============================================================================
// Inside the native (Capacitor/Android) shell the app MUST NEVER show a price,
// a payment link, an "upgrade/subscribe" checkout CTA, or invoke the Paddle
// checkout SDK. Steering users to a non-Play payment flow for digital goods is
// grounds for Google Play removal. The runtime code already enforces this via
// the single gate `isNativePlatform()` (src/native/shell.ts); these tests LOCK
// IT IN so a regression that leaks price/checkout onto native FAILS CI instead
// of shipping green.
//
// The existing paywallCheckoutGuard test mocks isNativePlatform() -> false (it
// exercises the WEB checkout guard). This file is its mirror image: it forces
// isNativePlatform() -> TRUE and asserts the native branches hold.
//
// If any assertion here ever fails, DO NOT loosen it — a failure means a real
// anti-steering leak reached the native build. Fix the leak, not the test.
// ============================================================================

const h = vi.hoisted(() => ({
  // Spies on the Paddle checkout path. On native these must stay UNTOUCHED.
  getPaddle: vi.fn(),
  checkoutOpen: vi.fn(),
  // PricePreview is the paywall's price lookup. It loads the Paddle SDK, so on
  // native it is a policy breach in its own right — a payment SDK inside the Play
  // build — even if it never renders a single character of price.
  pricePreview: vi.fn(),
}));

// THE gate under test — forced ON (native) for the whole file.
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => true }));

// A logged-in user with a valid id. This is deliberate: we prove that even a
// fully-authenticated user (who WOULD be allowed to check out on the web) is
// given NO price and NO checkout path on native. The block is the platform,
// not a missing user.
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'native-user@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));

// getPaddle resolves a fake SDK; if the native branch ever (wrongly) reached the
// checkout code, these spies would record it and the test would fail.
vi.mock('../src/lib/paddle', () => ({
  getPaddle: h.getPaddle.mockResolvedValue({
    Checkout: { open: h.checkoutOpen },
    PricePreview: h.pricePreview,
  }),
  PaddleNotConfiguredError: class PaddleNotConfiguredError extends Error {},
}));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

// Upload path: the modal/sheet guards below are driven by a REJECTED upload
// (LIMIT_REACHED), so trackUpload() never runs and the ProcessingContext poll
// timer is never created — these tests need no fake timers.
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
// DeleteAccountModal's only network call. Never invoked by the anti-steering
// tests below (they assert on the idle modal), but it must not hit real fetch.
vi.mock('../src/services/accountService', () => ({
  accountService: { deleteAccount: vi.fn() },
}));
vi.mock('../src/services/documentService', () => ({
  documentService: { getStats: vi.fn(), getDocumentDetail: vi.fn(), getRecentActivity: vi.fn(), getAllActivity: vi.fn() },
}));

// Price ids are no longer env-stubbed: they are committed constants in
// src/lib/pricing.ts (the single source of truth for displayed AND charged price).
// That makes these tests STRONGER, not weaker — the web path now always has real
// price ids, so it would genuinely reach getPaddle() both on an "Upgrade Now"
// click AND on the PricePreview lookup that runs when the modal opens. Every
// `getPaddle` / `PricePreview` not-called assertion below is therefore a true
// regression catcher and can never pass by accident on unset ids.

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { uploadDocument } from '../src/services/uploadService';

// Matches any rendered price: "$9", "$ 59", "9/mo", "59 / yr", etc. Behavioral,
// not a brittle snapshot — it only trips on actual price copy.
const PRICE_REGEX = /\$\s*\d|\d+\s*\/\s*(mo|yr|month|year)/i;
// Web-only checkout CTAs that must never surface on native.
const FORBIDDEN_CTA = ['Upgrade Now', 'Upgrade to PRO', 'Go PRO'];
// The WEB paywall's upsell heading (PaywallModal web branch).
const PAYWALL_WEB_MARKER = 'Unlock the full power of Scan & Action';
// The marketing LandingScreen's hero headline (it has no i18n keys — the copy is
// hardcoded English). Its presence on native would mean the pricing page mounted.
const LANDING_MARKER = 'Stop typing receipts';

let container: HTMLDivElement;
let root: Root;

function cleanup() {
  root.unmount();
  container.remove();
  // The paywall portals into document.body — make sure nothing leaks between tests.
  document.body.innerHTML = '';
}

describe('NATIVE anti-steering invariant — PaywallModal (primary gate)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
    // Dynamic import so the price-id env stubs above are in place at module eval.
    const { PaywallModal } = await import('../src/components/PaywallModal');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <PaywallModal isOpen onClose={() => {}} />
        </LanguageProvider>
      );
    });
  });

  afterEach(cleanup);

  it('renders the neutral "coming soon" placeholder, NOT the paid upsell', () => {
    // Native branch copy is present…
    expect(document.body.textContent).toContain(strings.en.proComingSoonTitle);
    // …and the web upsell heading is not.
    expect(document.body.textContent).not.toContain('Upgrade to PRO');
  });

  it('renders NO price and NO checkout CTA anywhere in the native modal', () => {
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(PRICE_REGEX);
    for (const cta of FORBIDDEN_CTA) {
      expect(text).not.toContain(cta);
    }
  });

  it('NEVER loads or opens the Paddle checkout SDK on native — even when every button is clicked', async () => {
    // Click every interactive element in the native render. The only buttons are
    // Close / "Got it" (both call onClose). If ANY of them reached checkout, the
    // spies below would record it. (Price ids are real committed constants, so on
    // the WEB branch an "Upgrade Now" click WOULD call getPaddle — this bites.)
    const buttons = [...document.body.querySelectorAll('button')];
    for (const btn of buttons) {
      flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    // Give any (incorrect) async open() path a chance to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(h.getPaddle).not.toHaveBeenCalled();
    expect(h.checkoutOpen).not.toHaveBeenCalled();
  });

  // THE PRICE-LOOKUP GATE. The paywall now asks Paddle what its prices actually
  // cost (PricePreview) so the displayed price equals the charged price. That call
  // loads the Paddle SDK, which must NEVER happen inside the Play build — it is a
  // policy breach on its own, with or without a price on screen. Unlike the
  // checkout path this needs no click: it fires from an effect on open, so a
  // missing guard would leak on EVERY native paywall render.
  it('NEVER calls PricePreview on native — the price lookup must not load the payment SDK', async () => {
    // The modal is already mounted (beforeEach) with isOpen, so the price-preview
    // effect has had its chance to run. Let any microtasks/timers settle first, or
    // this asserts against a moment before the effect would have fired.
    await new Promise((r) => setTimeout(r, 50));

    expect(h.pricePreview).not.toHaveBeenCalled();
    // getPaddle is the only route to PricePreview, so it must be untouched too.
    expect(h.getPaddle).not.toHaveBeenCalled();
  });
});

describe('NATIVE anti-steering invariant — SettingsScreen billing card', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
    document.documentElement.classList.remove('dark');
    const { SettingsScreen } = await import('../src/screens/SettingsScreen');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // No Outlet context -> plan falls back to 'FREE', so the billing card takes
    // the FREE branch, which on native must be the neutral entitlement-only view.
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <Routes>
                <Route path="/settings" element={<SettingsScreen />} />
                <Route path="/login" element={<div>LOGIN-STUB</div>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      );
    });
  });

  afterEach(cleanup);

  it('shows entitlement state only (free tier + auto-unlock note), no upsell', () => {
    const text = container.textContent ?? '';
    expect(text).toContain(strings.en.freeTier);
    expect(text).toContain(strings.en.proAutoUnlock);
    // The web upsell CTA and its persuasive description must be absent on native.
    expect(text).not.toContain(strings.en.goPro);
    expect(text).not.toContain(strings.en.upgradeDesc);
  });

  it('renders NO price and NO checkout CTA in the native billing card', () => {
    const text = container.textContent ?? '';
    expect(text).not.toMatch(PRICE_REGEX);
    for (const cta of FORBIDDEN_CTA) {
      expect(text).not.toContain(cta);
    }
  });
});

// ============================================================================
// THE LOAD-BEARING GUARD: the native "/" redirect (App.tsx LandingRoute).
//
// The marketing LandingScreen renders a literal PRICE ($9/mo, see its pricing
// section). On web that is a legitimate sell surface. Inside the native shell it
// would be a pricing page in front of a Play user — a direct policy breach with
// NO second layer behind it: unlike the upload/capture guards below, nothing
// downstream neutralizes it (PaywallModal's own native guard does not apply, the
// landing page is not the paywall). If this redirect ever breaks, the app ships
// a price. These assertions are therefore the strictest in the file.
// ============================================================================
describe('NATIVE anti-steering invariant — "/" never renders the marketing/pricing landing', () => {
  const mountLanding = async (authenticated: boolean) => {
    const { LandingRoute } = await import('../src/App');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route path="/" element={<LandingRoute authenticated={authenticated} />} />
                <Route path="/dashboard" element={<div>DASHBOARD-STUB</div>} />
                <Route path="/login" element={<div>LOGIN-STUB</div>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      );
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
  });

  afterEach(cleanup);

  it('signed-in native user hitting "/" is redirected to the dashboard, never the landing page', async () => {
    await mountLanding(true);
    // <Navigate> lands on the next tick — wait for the redirect to resolve, or the
    // DOM is still empty and every assertion below would pass vacuously.
    await vi.waitFor(() => expect(document.body.textContent).toContain('DASHBOARD-STUB'));
  });

  it('signed-out native user hitting "/" is redirected to login, never the landing page', async () => {
    await mountLanding(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain('LOGIN-STUB'));
  });

  it('NO price, NO checkout CTA and NO marketing copy reach a native user at "/" (signed in OR out)', async () => {
    for (const [authenticated, stub] of [[true, 'DASHBOARD-STUB'], [false, 'LOGIN-STUB']] as const) {
      await mountLanding(authenticated);
      // Wait for the redirect FIRST: asserting "no price" against an empty DOM
      // would be a vacuous pass and would not catch a real leak.
      await vi.waitFor(() => expect(document.body.textContent).toContain(stub));

      const text = document.body.textContent ?? '';
      // The landing page's own pricing block ("$9/mo") must never render here.
      expect(text).not.toMatch(PRICE_REGEX);
      for (const cta of FORBIDDEN_CTA) {
        expect(text).not.toContain(cta);
      }
      // And the landing screen itself must not have mounted at all.
      expect(text).not.toContain(LANDING_MARKER);
      cleanup();
    }
  });
});

// ============================================================================
// SECOND LAYER: the upload/capture limit guards (UploadModal L61 + L157,
// CaptureSheet L94). PaywallModal's own native guard already backstops the
// price, so a failure here would not by itself leak a price TODAY — but these
// branches decide whether the user sees a neutral status or an upsell surface,
// and a future restyle (D8/D8b) that swaps PaywallModal for an inline upgrade
// CTA would make them the only defense. Lock them now, before that restyle.
//
// The load-bearing assertion in each case is that the paywall NEVER OPENS AT
// ALL: we assert the absence of the NATIVE paywall panel (proComingSoonTitle),
// not merely the absence of a price. Asserting "no price" alone would pass even
// if the guard broke, because PaywallModal would neutralize it downstream.
// ============================================================================
const photo = (name: string) => new File(['img'], name, { type: 'image/jpeg' });

/** Assert the full native-silence contract on whatever is currently rendered. */
const expectSilentNative = (neutralMessage: string) => {
  const text = document.body.textContent ?? '';
  expect(text).toContain(neutralMessage);              // neutral status shown
  expect(text).not.toContain(PAYWALL_WEB_MARKER);      // web upsell absent
  expect(text).not.toContain(strings.en.proComingSoonTitle); // paywall NEVER opened
  expect(text).not.toMatch(PRICE_REGEX);               // no price anywhere
  for (const cta of FORBIDDEN_CTA) expect(text).not.toContain(cta);
  expect(h.getPaddle).not.toHaveBeenCalled();          // checkout SDK untouched
  expect(h.checkoutOpen).not.toHaveBeenCalled();
};

describe('NATIVE anti-steering invariant — UploadModal limit guards', () => {
  const mountModal = async (plan?: 'FREE' | 'PRO') => {
    const { UploadModal } = await import('../src/components/UploadModal');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter>
              <ProcessingProvider>
                <UploadModal isOpen onClose={() => {}} onSuccess={() => {}} plan={plan} />
              </ProcessingProvider>
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      );
    });
  };

  const addFilesToInput = (files: File[]) => {
    const input = document.body.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
  });

  afterEach(cleanup);

  it('GUARD 1 (multi-file, FREE): shows the neutral single-doc status and NEVER opens the paywall', async () => {
    await mountModal('FREE');
    addFilesToInput([photo('a.jpg'), photo('b.jpg')]);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.freePlanSingleDoc)
    );
    expectSilentNative(strings.en.freePlanSingleDoc);
    // The batch is rejected outright — nothing is uploaded.
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('GUARD 2 (LIMIT_REACHED, FREE): shows the neutral limit status, NEVER opens the paywall, never leaks the raw error code', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    await mountModal('FREE');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    const start = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start Extraction')
    )!;
    flushSync(() => start.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.freePlanLimitReached)
    );
    expectSilentNative(strings.en.freePlanLimitReached);
  });

  // FIXED (was the KNOWN GAP skipped in PR #93): the file-error card used to print
  // the RAW API code, because setFileErrors runs before the platform branch. The
  // card now renders translated copy via translateUploadError(); the raw enum must
  // never reach a user, in any locale, on either platform.
  it('the raw LIMIT_REACHED code must not render in the file-error card', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    await mountModal('FREE');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    const start = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start Extraction')
    )!;
    flushSync(() => start.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.freePlanLimitReached)
    );
    expect(document.body.textContent).not.toContain('LIMIT_REACHED');
  });

  // THE POLICY TRAP, locked behaviorally.
  //
  // The API's LIMIT_REACHED response also carries a `message` field reading
  // "Free plan limit reached (10 scans). Please upgrade to PRO." Today the client
  // never sees it (uploadService prefers `data.error`), but that precedence is one
  // careless edit away from flipping — and "Please upgrade to PRO" rendered inside
  // the native app is STEERING: a Play-policy breach that the price/CTA assertions
  // elsewhere in this file would NOT catch, because it contains neither a price
  // nor a known CTA string.
  //
  // This test simulates that flip: the upload rejects with the backend's upsell
  // SENTENCE as the error message. translateUploadError() does not recognise it as
  // a code, so it must fall back to translated generic copy — the upsell must not
  // reach the DOM by any path.
  it('NEVER renders the backend upsell message on native, even if the error precedence flips', async () => {
    const BACKEND_UPSELL = 'Free plan limit reached (10 scans). Please upgrade to PRO.';
    (uploadDocument as any).mockRejectedValue(new Error(BACKEND_UPSELL));
    await mountModal('FREE');
    addFilesToInput([photo('a.jpg')]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Start Extraction (1)'));
    const start = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start Extraction')
    )!;
    flushSync(() => start.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.uploadFailedGeneric)
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Please upgrade to PRO');
    expect(text).not.toContain('upgrade');
    expect(text).not.toContain(BACKEND_UPSELL);
    expect(text).not.toMatch(PRICE_REGEX);
    expect(h.getPaddle).not.toHaveBeenCalled();
  });
});

describe('NATIVE anti-steering invariant — CaptureSheet limit guard', () => {
  const mountSheet = async (plan?: 'FREE' | 'PRO') => {
    const { CaptureSheet } = await import('../src/components/CaptureSheet');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter>
              <ProcessingProvider>
                <CaptureSheet plan={plan} />
              </ProcessingProvider>
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      );
    });
  };

  // Both hidden file inputs render unconditionally, so we can hand the sheet a
  // file directly — no ref handle, and no camera-permission mock needed.
  const pickFile = (file: File) => {
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('lang', 'en');
  });

  afterEach(cleanup);

  it('LIMIT_REACHED on a FREE plan: neutral limit status, paywall NEVER opens, raw error code never shown', async () => {
    (uploadDocument as any).mockRejectedValue(new Error('LIMIT_REACHED'));
    await mountSheet('FREE');
    pickFile(photo('scan.jpg'));

    // The confirm sheet appears once a file exists; find its extract action.
    await vi.waitFor(() => {
      const btn = [...document.body.querySelectorAll('button')].find((b) =>
        b.textContent?.trim().toLowerCase().includes('extract')
      );
      expect(btn).toBeTruthy();
    });
    const extract = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.trim().toLowerCase().includes('extract')
    )!;
    flushSync(() => extract.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.freePlanLimitReached)
    );
    expectSilentNative(strings.en.freePlanLimitReached);
    expect(document.body.textContent).not.toContain('LIMIT_REACHED');
  });
});

// ============================================================================
// THIRD LAYER: DeleteAccountModal (SettingsScreen.tsx:268) — previously covered
// by NOTHING in this file.
// ============================================================================
// This modal renders inside the native shell and contains the required
// cancellation disclosure (`deleteAccountSubscriptionWarning`, strings.ts:178),
// which names "the App Store or Google Play, and web subscriptions via the
// billing portal".
//
// Auditing it against the same contract as every other native surface: it holds
// NO price, NO purchase CTA and NO link. Its only imperative is *cancel*. Naming
// the billing portal as a CANCELLATION route is the opposite of steering — and
// it is load-bearing: a native user can hold a WEB subscription (subscribed on
// web, then installed the app), and a Play subscription can only be cancelled
// through Play. Omitting either route would leave users unable to stop charges.
//
// So these tests lock BOTH directions, and the second one matters more:
//
//   (a) nothing here steers      — no price, no CTA, paywall never opens, Paddle
//                                  SDK never touched.
//   (b) the disclosure REMAINS   — the realistic failure is not someone adding an
//                                  upsell; it is someone deleting an "ugly amber
//                                  box" during the D8b restyle. Nothing else in
//                                  the suite would catch that.
//
// (b) is why this block asserts PRESENCE, not just absence. A silent-app test
// that only checks for absence would pass on an empty modal.
// ============================================================================
describe('NATIVE anti-steering invariant — DeleteAccountModal (cancellation disclosure)', () => {
  const mountDelete = async (lang: 'en' | 'fr' | 'ar') => {
    localStorage.setItem('lang', lang);
    const { DeleteAccountModal } = await import('../src/components/DeleteAccountModal');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />
        </LanguageProvider>
      );
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(cleanup);

  // ── (a) Nothing steers.
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang.toUpperCase()}: renders NO price, NO checkout CTA, and never touches the Paddle SDK`, async () => {
      await mountDelete(lang);
      const text = document.body.textContent ?? '';

      expect(text).not.toMatch(PRICE_REGEX);
      for (const cta of FORBIDDEN_CTA) expect(text).not.toContain(cta);
      // The paywall must not be mounted from this modal at all.
      expect(text).not.toContain(strings.en.proComingSoonTitle);
      expect(text).not.toContain(PAYWALL_WEB_MARKER);
      expect(h.getPaddle).not.toHaveBeenCalled();
      expect(h.checkoutOpen).not.toHaveBeenCalled();
      // No outbound link of any kind — the disclosure names routes, never links to them.
      expect(container.querySelector('a[href]')).toBeNull();
    });
  }

  // ── (b) The disclosure survives. THIS is the assertion that earns its keep.
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang.toUpperCase()}: the required cancellation disclosure is still PRESENT`, async () => {
      await mountDelete(lang);
      expect(
        document.body.textContent,
        'deleteAccountSubscriptionWarning must render: deleting an account does NOT cancel billing, ' +
          'and users must be told where to cancel. Do not remove this during a restyle.'
      ).toContain(strings[lang].deleteAccountSubscriptionWarning);
    });
  }

  // The Arabic disclosure is verified by CODE POINT, not by regex on a
  // transliterated substring: a probe like /اشتر/ matches اشتراك ("subscription",
  // a noun) as well as اشترِ ("buy", an imperative), and would report a purchase
  // CTA that is not there. Assert on the script itself and on the actual verbs.
  it('AR: the disclosure is genuine Arabic script and carries a CANCEL imperative, not a BUY one', async () => {
    await mountDelete('ar');
    const copy = strings.ar.deleteAccountSubscriptionWarning;
    expect(document.body.textContent).toContain(copy);

    const points = [...copy].map((c) => c.codePointAt(0)!);
    const arabicBlock = points.filter((p) => p >= 0x0600 && p <= 0x06ff).length;
    expect(arabicBlock, 'must be real Arabic, not English left in place').toBeGreaterThan(80);
    // No bidi/zero-width control characters smuggled into the copy.
    expect(points.some((p) => (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || p === 0xfeff)).toBe(false);
    // The only Latin permitted is the untranslated store brand names.
    expect([...copy].filter((c) => /[A-Za-z]/.test(c)).join('')).toBe('AppStoreGooglePlay');

    // Verbs: cancel yes, buy/upgrade no.
    expect(copy).toMatch(/ألغِ/);                 // "cancel" (imperative)
    expect(copy).not.toMatch(/اشترِ|اشتري|ابتع/); // "buy" (imperative) — absent
    expect(copy).not.toMatch(/ترقية|ترقّ/);        // "upgrade" — absent
  });
});
