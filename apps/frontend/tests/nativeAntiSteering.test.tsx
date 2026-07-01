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
  getPaddle: h.getPaddle.mockResolvedValue({ Checkout: { open: h.checkoutOpen } }),
  PaddleNotConfiguredError: class PaddleNotConfiguredError extends Error {},
}));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

// Price IDs are read at PaywallModal module-eval time from import.meta.env, so
// they MUST be stubbed before that module is imported. We set REAL-looking ids
// here on purpose: it means the WEB checkout path would genuinely reach
// getPaddle() when "Upgrade Now" is clicked — so the "SDK never opens on native"
// test below is a true regression catcher, not an artifact of unset price ids.
// (PaywallModal is therefore imported dynamically, after these stubs.)
vi.stubEnv('VITE_PADDLE_PRICE_ID_MONTHLY', 'pri_test_monthly');
vi.stubEnv('VITE_PADDLE_PRICE_ID_YEARLY', 'pri_test_yearly');

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';

// Matches any rendered price: "$9", "$ 59", "9/mo", "59 / yr", etc. Behavioral,
// not a brittle snapshot — it only trips on actual price copy.
const PRICE_REGEX = /\$\s*\d|\d+\s*\/\s*(mo|yr|month|year)/i;
// Web-only checkout CTAs that must never surface on native.
const FORBIDDEN_CTA = ['Upgrade Now', 'Upgrade to PRO', 'Go PRO'];

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
    // spies below would record it. (Price ids are stubbed, so on the WEB branch
    // an "Upgrade Now" click WOULD call getPaddle — proving this test bites.)
    const buttons = [...document.body.querySelectorAll('button')];
    for (const btn of buttons) {
      flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    // Give any (incorrect) async open() path a chance to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(h.getPaddle).not.toHaveBeenCalled();
    expect(h.checkoutOpen).not.toHaveBeenCalled();
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
