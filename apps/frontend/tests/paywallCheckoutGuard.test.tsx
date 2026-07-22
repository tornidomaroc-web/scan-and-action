import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// Shared, hoisted handles so the vi.mock factories (hoisted above imports) and
// the tests reference the same spies/state.
const h = vi.hoisted(() => ({
  checkoutOpen: vi.fn(),
  pricePreview: vi.fn(),
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
  getPaddle: vi.fn().mockResolvedValue({
    Checkout: { open: h.checkoutOpen },
    PricePreview: h.pricePreview,
  }),
  PaddleNotConfiguredError: class PaddleNotConfiguredError extends Error {},
}));
// Force the WEB checkout path: the native anti-steering early-return must stay
// out of the way here (it is exercised by the component's native branch, not
// this guard test).
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => false }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));

// Price ids are no longer env-stubbed — they are committed constants in
// src/lib/pricing.ts, the single source for BOTH the displayed and the charged
// price. The tests below import that same catalog, so they assert against the
// real shipping ids rather than a test-only stand-in.
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { PLAN_CATALOG } from '../src/lib/pricing';

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

function clickPlan(label: 'Monthly' | 'Yearly') {
  // The yearly tile's DOM starts with the savings badge, not the label, so match
  // on containment — and exclude the CTA, which also names the selected plan.
  const btn = [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.includes(label) && !b.textContent?.includes('Upgrade Now')
  )!;
  flushSync(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/**
 * A PricePreview response in Paddle's real shape, per the SDK's own types
 * (@paddle/paddle-js types/price-preview): data.details.lineItems[], each with
 * price.id, formattedTotals.total (the localized string we display) and
 * totals.total (minor units, used to derive the savings badge).
 *
 * Deliberately returned in REVERSE request order and in a non-USD currency: the
 * component must match line items by price id, not array position, and must
 * display whatever currency Paddle resolved for the buyer.
 */
function pricePreviewResponse() {
  return {
    data: {
      currencyCode: 'MAD',
      details: {
        lineItems: [
          {
            price: { id: PLAN_CATALOG.yearly.priceId },
            formattedTotals: { total: 'MAD 590.00' },
            totals: { total: '59000' },
          },
          {
            price: { id: PLAN_CATALOG.monthly.priceId },
            formattedTotals: { total: 'MAD 90.00' },
            totals: { total: '9000' },
          },
        ],
      },
    },
    meta: { requestId: 'req_test' },
  };
}

/** Lets the PricePreview effect resolve and React flush the resulting render. */
async function settlePreview() {
  await vi.waitFor(() =>
    expect(document.body.textContent).not.toContain(PLAN_CATALOG.monthly.fallbackFormatted)
  );
}

describe('PaywallModal — fail-closed checkout guard (custom_data.userId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.pricePreview.mockResolvedValue(pricePreviewResponse());
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

// ============================================================================
// DISPLAYED PRICE == CHARGED PRICE.
//
// The price on screen is no longer a literal typed into JSX beside a separately
// configured Paddle price id. It is Paddle's own answer for the EXACT id that
// Checkout.open will be handed. These tests assert that equality directly — the
// rendered string, and the id it was previewed for.
// ============================================================================
describe('PaywallModal — displayed price comes from Paddle, for the charged price id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.pricePreview.mockResolvedValue(pricePreviewResponse());
    h.auth.user = { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'buyer@example.com' };
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('previews EXACTLY the two price ids that can be charged', async () => {
    await mountPaywall();
    await vi.waitFor(() => expect(h.pricePreview).toHaveBeenCalled());

    expect(h.pricePreview).toHaveBeenCalledWith({
      items: [
        { priceId: PLAN_CATALOG.monthly.priceId, quantity: 1 },
        { priceId: PLAN_CATALOG.yearly.priceId, quantity: 1 },
      ],
    });
  });

  it('renders the previewed totals VERBATIM, matched by price id and not by position', async () => {
    await mountPaywall();
    await settlePreview();

    const text = document.body.textContent ?? '';
    // Both localized totals are on screen, exactly as Paddle formatted them...
    expect(text).toContain('MAD 90.00');
    expect(text).toContain('MAD 590.00');
    // ...and the hardcoded USD literals are gone entirely.
    expect(text).not.toContain('$9');
    expect(text).not.toContain('$59');

    // PER-TILE, not just "present somewhere". The mocked response deliberately
    // returns the line items in REVERSE request order, so a component that mapped
    // them by array position would put the yearly total on the monthly tile — and
    // an assertion that only checked both strings exist on the page would happily
    // pass while the UI showed a customer the wrong price. Bind each total to its
    // own tile.
    const tile = (label: 'Monthly' | 'Yearly') =>
      [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent?.includes(label) && !b.textContent?.includes('Upgrade Now')
      )!.textContent ?? '';

    expect(tile('Monthly')).toContain('MAD 90.00');
    expect(tile('Monthly')).not.toContain('MAD 590.00');
    expect(tile('Yearly')).toContain('MAD 590.00');
    expect(tile('Yearly')).not.toContain('MAD 90.00');
  });

  it('THE INVARIANT: Checkout.open is handed the SAME price id the displayed total was previewed for', async () => {
    await mountPaywall();
    await settlePreview();

    // Monthly is the default selection; its tile shows the monthly previewed total.
    expect(document.body.textContent).toContain('MAD 90.00');
    clickUpgrade();
    await vi.waitFor(() => expect(h.checkoutOpen).toHaveBeenCalled());

    const chargedId = h.checkoutOpen.mock.calls[0][0].items[0].priceId;
    const previewedIds = h.pricePreview.mock.calls[0][0].items.map((i: any) => i.priceId);

    expect(chargedId).toBe(PLAN_CATALOG.monthly.priceId);
    expect(previewedIds).toContain(chargedId);
  });

  it('switching to Yearly charges the yearly id whose total is the one displayed', async () => {
    await mountPaywall();
    await settlePreview();

    clickPlan('Yearly');
    clickUpgrade();
    await vi.waitFor(() => expect(h.checkoutOpen).toHaveBeenCalled());

    expect(h.checkoutOpen.mock.calls[0][0].items[0].priceId).toBe(PLAN_CATALOG.yearly.priceId);
    expect(document.body.textContent).toContain('MAD 590.00');
  });

  it('derives the savings badge from the PREVIEWED totals, so it cannot contradict them', async () => {
    await mountPaywall();
    await settlePreview();

    // 9000 x 12 = 108000 vs 59000 => 45% saved, computed from the same response
    // that produced the displayed strings — never a frozen "Save 45%" literal.
    expect(document.body.textContent).toContain('Save 45%');
  });

  it('drops the savings badge entirely when the yearly plan is not actually cheaper', async () => {
    h.pricePreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        details: {
          lineItems: [
            {
              price: { id: PLAN_CATALOG.monthly.priceId },
              formattedTotals: { total: '$9.00' },
              totals: { total: '900' },
            },
            {
              price: { id: PLAN_CATALOG.yearly.priceId },
              // Deliberately worse than 12x monthly.
              formattedTotals: { total: '$200.00' },
              totals: { total: '20000' },
            },
          ],
        },
      },
      meta: { requestId: 'req_test' },
    });
    await mountPaywall();
    await vi.waitFor(() => expect(document.body.textContent).toContain('$200.00'));

    expect(document.body.textContent).not.toContain('Save');
  });

  it('FALLBACK: renders the declared price and still opens checkout when PricePreview throws', async () => {
    h.pricePreview.mockRejectedValue(new Error('network down'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mountPaywall();
    await vi.waitFor(() => expect(h.pricePreview).toHaveBeenCalled());

    // Never blank: the declared fallback is on screen.
    expect(document.body.textContent).toContain(PLAN_CATALOG.monthly.fallbackFormatted);
    // And a pricing lookup failure must never block the sale.
    clickUpgrade();
    await vi.waitFor(() => expect(h.checkoutOpen).toHaveBeenCalled());
    expect(h.checkoutOpen.mock.calls[0][0].items[0].priceId).toBe(PLAN_CATALOG.monthly.priceId);
    consoleWarn.mockRestore();
  });

  it('ignores a line item for a price id we never asked about', async () => {
    h.pricePreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        details: {
          lineItems: [
            {
              price: { id: 'pri_some_other_product' },
              formattedTotals: { total: '$999.00' },
              totals: { total: '99900' },
            },
          ],
        },
      },
      meta: { requestId: 'req_test' },
    });
    await mountPaywall();
    await vi.waitFor(() => expect(h.pricePreview).toHaveBeenCalled());

    // A stranger's total must never reach the tiles; the fallback stands instead.
    expect(document.body.textContent).not.toContain('$999.00');
    expect(document.body.textContent).toContain(PLAN_CATALOG.monthly.fallbackFormatted);
  });

  it('defaults to the MONTHLY plan — the price the landing page advertises', async () => {
    await mountPaywall();
    await settlePreview();

    // The CTA names the monthly total, so a click-through from the landing's
    // monthly card cannot silently transact at the yearly price.
    const cta = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Upgrade Now')
    )!;
    expect(cta.textContent).toContain('MAD 90.00');
    expect(cta.textContent).not.toContain('MAD 590.00');
  });
});
