import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// Shared, hoisted handles so the vi.mock factories (hoisted above imports) and
// the tests reference the same spies/state.
const h = vi.hoisted(() => ({
  checkoutOpen: vi.fn(),
  // Mutable auth state — each test sets h.auth.user before mounting.
  auth: {
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'buyer@example.com' } as
      | { id: string; email: string }
      | null,
    session: null,
    loading: false,
    signOut: async () => {},
  },
}));

vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../src/lib/paddle', () => ({
  getPaddle: vi.fn().mockResolvedValue({ Checkout: { open: h.checkoutOpen } }),
  PaddleNotConfiguredError: class PaddleNotConfiguredError extends Error {},
}));
// Force the WEB checkout path: the native anti-steering early-return must stay
// out of the way here (it is exercised by the component's native branch, not
// this guard test).
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => false }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));

// Price IDs are read at module-eval time from import.meta.env, so they must be
// stubbed BEFORE the component module is imported. The component is therefore
// imported dynamically inside mountPaywall, after these stubs are in place.
vi.stubEnv('VITE_PADDLE_PRICE_ID_MONTHLY', 'pri_test_monthly');
vi.stubEnv('VITE_PADDLE_PRICE_ID_YEARLY', 'pri_test_yearly');

import { LanguageProvider } from '../src/i18n/LanguageContext';

let container: HTMLDivElement;
let root: Root;

async function mountPaywall() {
  localStorage.setItem('lang', 'en');
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
}

function clickUpgrade() {
  const btn = [...document.body.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Upgrade Now')
  )!;
  flushSync(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('PaywallModal — fail-closed checkout guard (custom_data.userId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.auth.user = { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'buyer@example.com' };
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('FAIL CLOSED: with no user.id, it does NOT open checkout and surfaces an error', async () => {
    h.auth.user = null; // logged-out / idless — unattributable payment must be impossible
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountPaywall();

    clickUpgrade();
    // give any (incorrect) async open() path a chance to run
    await new Promise((r) => setTimeout(r, 50));

    expect(h.checkoutOpen).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Please sign in again to upgrade.');
    expect(consoleError).toHaveBeenCalledWith('[Paywall] refusing checkout: no user.id');
  });

  it('HAPPY PATH: with a real user.id, it opens checkout passing customData.userId', async () => {
    await mountPaywall();

    clickUpgrade();
    await vi.waitFor(() => expect(h.checkoutOpen).toHaveBeenCalled());

    expect(h.checkoutOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        customData: { userId: '7f1e2d3c-4b5a-4678-9abc-def012345678' },
      })
    );
  });
});
