import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, CheckCircle2, Crown, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { formatPercent } from '../lib/formatNumber';
import { getPaddle, PaddleNotConfiguredError } from '../lib/paddle';
import { useBackDismiss } from '../native/useBackDismiss';
import { isNativePlatform } from '../native/shell';
import { eyebrowClass, sheetClass } from './ui/Panel';
import { primaryButtonClass } from './ui/PrimaryButton';
import { Notice } from './ui/Notice';
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  planForPriceId,
  yearlySavingsPercent,
  fallbackSavingsPercent,
  type Plan,
} from '../lib/pricing';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** What Paddle told us this checkout will actually cost, per plan. */
interface PreviewedPricing {
  /** Localized, currency-correct, tax-aware total strings, keyed by plan. */
  formatted: Partial<Record<Plan, string>>;
  /** Derived from the SAME previewed totals, so it can never contradict them. */
  savingsPercent: number | null;
}

// Post-checkout landing. The custom domain, not the vercel.app alias, so the
// URL customers see (and bookmark) is the canonical one. Must land on
// /dashboard: that's where Layout reads ?checkout=success and shows the
// PRO welcome — the bare / route is the logged-out marketing page.
const CHECKOUT_SUCCESS_URL = 'https://www.scan-action.com/dashboard?checkout=success';

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose }) => {
  const s = useStrings();
  const { language } = useLanguage();
  // The plan tiles are raised cards; the chosen one sits on the accent tint
  // inside the accent ring. The price is ink on either surface (16.6:1 light,
  // 12.0:1 dark on the tint) and never faded: people check amounts
  // (softSurfaces.test.ts holds these pairs).
  const planTile = 'relative flex min-h-[88px] flex-col rounded-card p-4 text-start transition-shadow motion-reduce:transition-none';
  const planIdle = 'bg-surface-raised shadow-card ring-1 ring-line hover:ring-line-strong';
  const planSelected = 'bg-accent-tint shadow-card ring-2 ring-accent';
  const planLabel = 'mb-1 text-xs font-semibold uppercase tracking-[0.06em] rtl:tracking-normal';
  const planPrice = 'text-2xl font-bold tracking-tight text-ink';
  const planPeriod = 'text-sm font-semibold text-ink-secondary';
  const { user } = useAuth();
  // Defaults to MONTHLY, matching the price the landing page advertises ($9/mo).
  // It used to default to 'yearly': a visitor who clicked through the landing's
  // $9/mo card landed on a paywall silently pre-selected at the yearly price, one
  // careless click from being charged the annual amount they were never shown.
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // null until Paddle answers (or fails) — the fallback renders meanwhile, so the
  // price area is never blank.
  const [preview, setPreview] = useState<PreviewedPricing | null>(null);

  // Android back button closes the modal before navigating (no-op on web).
  useBackDismiss(isOpen, onClose);

  // Ask Paddle what these prices ACTUALLY cost, for the exact price ids we are
  // about to charge. This is what makes the displayed price equal the charged
  // price by construction: the number on screen and the number on the invoice come
  // from one id, resolved by Paddle, in the buyer's own currency.
  //
  // SILENT SHELL — this hook must NEVER run inside the native app. PricePreview
  // loads the Paddle SDK, and a payment SDK inside the Play build is a policy
  // breach on its own, independent of whether any price is rendered. The native
  // branch below returns before the pricing UI, but that is a SECOND line of
  // defence; this guard is the first. Note the guard lives INSIDE the effect
  // rather than around it, because hooks cannot sit behind an early return.
  useEffect(() => {
    if (!isOpen || isNativePlatform()) return;

    let cancelled = false;
    (async () => {
      try {
        const paddle = await getPaddle();
        const response = await paddle.PricePreview({
          items: PLAN_ORDER.map((plan) => ({
            priceId: PLAN_CATALOG[plan].priceId,
            quantity: 1,
          })),
        });
        if (cancelled) return;

        const formatted: Partial<Record<Plan, string>> = {};
        const totals: Partial<Record<Plan, number>> = {};
        for (const lineItem of response.data.details.lineItems) {
          // Match by price id, never by array position: Paddle does not promise
          // line items come back in request order, and rendering the yearly total
          // on the monthly tile is precisely the bug this whole change prevents.
          // An id we did not ask about is ignored rather than displayed.
          const plan = planForPriceId(lineItem.price.id);
          if (!plan) continue;
          formatted[plan] = lineItem.formattedTotals.total;
          totals[plan] = Number(lineItem.totals.total);
        }

        setPreview({
          formatted,
          // Both totals come from this one response, so they share a currency and
          // the percentage is meaningful.
          savingsPercent: yearlySavingsPercent(totals.monthly, totals.yearly),
        });
      } catch (err) {
        // Never block the sale on a pricing lookup. The declared fallback renders
        // and checkout still works — the button opens Paddle's own checkout, which
        // shows the real total before any payment is taken.
        console.warn('[Paywall] PricePreview failed — showing declared fallback prices.', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Google Play forbids non-Play payment UI for digital goods. Inside the native
  // app we never render the Paddle checkout, never call getPaddle()/Checkout.open,
  // and never load the Paddle SDK. No caller opens this sheet on native (the
  // limit shows a neutral toast instead), so this is the second line of
  // defence: a sheet stating the entitlement rule only, with NO link or
  // reference to paying on the web (anti-steering) and no promise of a future
  // update (Apple 2.1(a)). This branch is dead on web (isNativePlatform() is
  // false there), so the web checkout flow below is unchanged.
  if (isNativePlatform()) {
    return createPortal(
      <div
        className="fixed inset-0 z-modal-top flex justify-center items-end sm:items-center bg-overlay backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div
          className={`w-full max-w-[480px] ${sheetClass} rounded-t-panel sm:rounded-panel overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-accent text-on-accent p-6 sm:p-8 text-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="w-16 h-16 bg-accent-hover rounded-tile flex items-center justify-center mx-auto mb-4 shadow-pressed">
                <Crown size={32} fill="currentColor" aria-hidden="true" />
              </div>
              <h2 className="text-[1.375rem] font-semibold leading-tight tracking-tight">
                {s.nativePlanTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-2 end-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-pill hover:bg-accent-hover transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8">
            <p className="text-ink-secondary text-[0.9375rem] font-medium text-center mb-8 leading-relaxed">
              {s.nativePlanBody}
            </p>
            <button
              onClick={onClose}
              className={primaryButtonClass}
            >
              {s.nativePlanDismiss}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const handleUpgrade = async () => {
    setCheckoutError(null);

    // Fail closed: never open a checkout we cannot attribute. custom_data.userId
    // is the ONLY identifier that activates PRO on a live Paddle Billing event
    // (the backend email fallback is dead for Billing payloads, which carry
    // customer_id, not an inline email). If user.id is missing we must refuse —
    // an opened-but-unattributable checkout means a customer could pay and be
    // silently stranded on FREE. The paywall is auth-gated, so this should never
    // fire in practice; the guard exists so it CANNOT.
    if (!user?.id) {
      console.error('[Paywall] refusing checkout: no user.id');
      setCheckoutError(s.paywallErrorSignIn);
      return;
    }

    // THE SAME id the price on screen was previewed for — this single expression
    // is what makes displayed == charged. Do not source the checkout price id
    // from anywhere the displayed price does not also come from.
    const priceId = PLAN_CATALOG[selectedPlan].priceId;
    if (!priceId) {
      console.error(`[Paywall] No Paddle price id configured for the ${selectedPlan} plan — refusing to open checkout.`);
      setCheckoutError(s.paywallErrorUnavailable);
      return;
    }

    setOpeningCheckout(true);
    try {
      const paddle = await getPaddle();
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(user?.email ? { customer: { email: user.email } } : {}),
        // Unconditional: the fail-closed guard above guarantees user.id exists.
        customData: { userId: user.id },
        settings: { successUrl: CHECKOUT_SUCCESS_URL },
      });
    } catch (err) {
      console.error('[Paywall] Failed to open Paddle checkout:', err);
      setCheckoutError(
        err instanceof PaddleNotConfiguredError
          ? s.paywallErrorEnv
          : s.paywallErrorOpen
      );
    } finally {
      setOpeningCheckout(false);
    }
  };

  // Previewed total when Paddle answered, declared fallback otherwise. Never
  // blank, and never a number typed into JSX. This is Paddle's own localized,
  // currency-correct string — rendered VERBATIM (never reformatted here: that was
  // the #115 drift). We only wrap it in <bdi> at the call site so a Latin-digit
  // amount cannot reorder the surrounding Arabic on an RTL line.
  const priceLabel = (plan: Plan): string =>
    preview?.formatted[plan] ?? PLAN_CATALOG[plan].fallbackFormatted;

  // The period suffix is OURS (Paddle gives the amount, we append the period), so
  // it is localized from the catalog — unlike the amount. AR uses the adverbial
  // form with a leading space, not a slash (see strings.ts).
  const periodSuffix = (plan: Plan): string =>
    plan === 'monthly' ? s.paywallPerMonth : s.paywallPerYear;

  // Derived from whichever source is actually on screen, so the badge and the
  // amounts can never disagree. Null (e.g. yearly not cheaper) drops the badge.
  const savingsPercent = preview ? preview.savingsPercent : fallbackSavingsPercent();

  // The CTA glue is ours and localized; the price is Paddle's. Split the template
  // on {price} so the amount can be isolated in its own <bdi> rather than
  // hand-concatenated into an RTL string (the classic bidi break the recon flagged).
  const [ctaBefore, ctaAfter = ''] = s.paywallCta.split('{price}');

  return createPortal(
    <div
      className="fixed inset-0 z-modal-top flex justify-center items-end sm:items-center bg-overlay backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[480px] ${sheetClass} rounded-t-panel sm:rounded-panel overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div className="bg-accent text-on-accent p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-16 h-16 bg-accent-hover rounded-tile flex items-center justify-center mx-auto mb-4 shadow-pressed">
              <Zap size={32} fill="currentColor" aria-hidden="true" />
            </div>
            <h2 className="text-[1.375rem] font-semibold leading-tight tracking-tight">
              {s.paywallTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-2 end-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-pill hover:bg-accent-hover transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8">
          <p className="text-ink-secondary text-[0.9375rem] font-medium text-center mb-6 sm:mb-8 leading-relaxed">
            {s.paywallBody}
          </p>

          {/* Plan Selection */}
          <div className="mb-8">
            <h3 className={`${eyebrowClass} mb-4 flex items-center gap-2`}>
              <Star size={14} fill="currentColor" aria-hidden="true" />
              {s.paywallChoosePlan}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Monthly Plan */}
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`${planTile} ${selectedPlan === 'monthly' ? planSelected : planIdle}`}
              >
                <span className={`${planLabel} text-ink-secondary`}>{s.paywallMonthly}</span>
                <span className={planPrice}>
                  <bdi>{priceLabel('monthly')}</bdi>
                  <span className={planPeriod}>{s.paywallPerMonth}</span>
                </span>
              </button>

              {/* Yearly Plan */}
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`${planTile} ${selectedPlan === 'yearly' ? planSelected : planIdle}`}
              >
                {savingsPercent !== null && (
                  <div className="absolute top-[-10px] end-2 bg-success-text text-surface-raised text-[0.6875rem] font-bold px-2 py-0.5 rounded-pill uppercase tracking-[0.06em] rtl:tracking-normal shadow-card">
                    {s.paywallSave.replace('{p}', formatPercent(savingsPercent / 100, language))}
                  </div>
                )}
                <span className={`${planLabel} text-success-text flex items-center gap-1`}>
                  {s.paywallYearly} <Star size={10} fill="currentColor" aria-hidden="true" />
                </span>
                <span className={planPrice}>
                  <bdi>{priceLabel('yearly')}</bdi>
                  <span className={planPeriod}>{s.paywallPerYear}</span>
                </span>
                <span className="text-xs font-semibold text-ink-secondary mt-1">{s.paywallBestValue}</span>
              </button>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-3 mb-8">
            {[
              s.paywallFeatureUnlimited,
              s.paywallFeatureBatch,
              s.paywallFeatureFaster,
              s.paywallFeatureExport,
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 rounded-card bg-surface-alt p-3 shadow-pressed">
                <div className="w-6 h-6 rounded-tile bg-accent-tint flex items-center justify-center text-accent-text flex-shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-ink">
                  {feature}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {checkoutError && (
              <Notice tone="danger" role="alert">
                {checkoutError}
              </Notice>
            )}
            <button
              onClick={handleUpgrade}
              disabled={openingCheckout}
              className={`${primaryButtonClass} group disabled:cursor-wait`}
            >
              <Crown size={20} fill="currentColor" aria-hidden="true" className="flex-none group-hover:rotate-12 transition-transform motion-reduce:transition-none" />
              {openingCheckout ? (
                s.paywallOpening
              ) : (
                <span>
                  {ctaBefore}
                  {/* Paddle's amount, isolated so its Latin digits can't reorder the
                      surrounding Arabic; the suffix stays outside as a localized word. */}
                  <bdi>{priceLabel(selectedPlan)}</bdi>
                  {periodSuffix(selectedPlan)}
                  {ctaAfter}
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full min-h-[44px] text-ink-secondary hover:text-ink py-2 rounded-pill font-semibold text-sm transition-colors"
            >
              {s.paywallMaybeLater}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
