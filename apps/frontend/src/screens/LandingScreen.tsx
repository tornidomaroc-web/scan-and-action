import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, FileText, ListChecks, ScanLine, Check } from 'lucide-react';
import { PLAN_CATALOG } from '../lib/pricing';
import { LandingHeader } from '../components/LandingHeader';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { CountChip } from '../components/ui/CountChip';
import { IconTile } from '../components/ui/IconTile';
import { Panel, panelClass } from '../components/ui/Panel';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { fullDayLabel, Lang } from '../lib/ledgerView';

// ============================================================================
// The public landing page, redrawn on 2026-09-26 in the visual language of
// the app (tokens only, dark first, light by the same tokens), in English,
// French and Arabic with right-to-left layout, on the catalog.
//
// EVERY CLAIM IS SOMETHING THE APP DOES TODAY, and the witness is named:
//   scan from the camera or a photo / PDF   CaptureSheet.tsx accept="image/*,application/pdf"
//   merchant, total, date, category         ledgerCore.ts fact keys; expenseCategories.ts
//   three languages                         i18n/strings.ts en / fr / ar
//   a queue with the reason in plain words  ReviewQueueScreen.tsx, DocumentDetailScreen.tsx issues
//   one figure per currency, never summed   ledgerCore.ts, ledgerNoCrossCurrencySum.test.ts
//   10 scans included, free                 uploadController.ts "Free plan limit reached (10 scans)"
//   no card to start                        AuthScreen.tsx: email and password only
//   the price is the checkout price         lib/pricing.ts PLAN_CATALOG (the same ids Paddle charges)
//   one document at a time on Free          strings freePlanSingleDoc, uploadController
// No count of users, no rating, no testimonial, no logo: none exists to cite.
// The two figures in the product frame are the owner's own receipts, read
// from his production ledger on 2026-09-26 (JOE'S PIZZA RESTAURANT, USD
// 750.00, Food, 12 Sep; September 2026, USD 2,989.92 from 5 receipts).
//
// What must stay as it was: every link (/login x4, /terms, /privacy,
// /refund, #how-it-works, #pricing), the price copy from PLAN_CATALOG, and
// nothing that reaches Paddle (this page never did).
// ============================================================================

const container = 'mx-auto w-full max-w-6xl px-5 sm:px-6';
const h2 = 'text-start text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]';
const primaryCta = 'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-pill bg-accent px-7 text-[15px] font-semibold text-on-accent shadow-raised transition-colors hover:bg-accent-hover motion-reduce:transition-none';

export function LandingScreen() {
  const s = useStrings();
  const lang = useLanguage().language as Lang;
  const monthly = PLAN_CATALOG.monthly;
  const yearly = PLAN_CATALOG.yearly;

  return (
    <div className="min-h-screen bg-surface text-ink" data-landing>
      <LandingHeader />

      {/* ── Hero ── */}
      <section className={`${container} grid gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:items-center`} data-landing-hero>
        <div>
          <h1 className="text-start text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
            <span className="block">{s.landingHero1}</span>
            <span className="block text-accent-text">{s.landingHero2}</span>
          </h1>
          <p className="mt-5 max-w-xl text-start text-[17px] leading-relaxed text-ink-secondary">{s.landingHeroSub}</p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link to="/login" className={primaryCta}>
              {s.landingHeroCta}
              <ArrowRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="px-2 py-3 text-sm font-semibold text-ink-secondary hover:text-ink">{s.landingSeeHow}</a>
          </div>
          <p className="mt-3 text-start text-sm font-medium text-ink-muted">{s.landingHeroNote}</p>
        </div>

        {/* The product, drawn with the product's own pieces: a receipt as the
            app reads it, and the ledger figure it lands in. */}
        <div className="flex flex-col gap-3" data-landing-frame aria-hidden="true">
          <Panel className="p-4">
            <p className="text-start text-label font-semibold uppercase tracking-wide text-ink-muted">{s.landingFrameRead}</p>
            <div className="mt-3 flex items-start gap-3">
              <CategoryIcon category="Food" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink" dir="auto">JOE'S PIZZA RESTAURANT</p>
                <p className="mt-0.5 text-start text-xs font-medium text-ink-muted">{s.catFood} · {s.docTypeReceipt} · {fullDayLabel('2026-09-12T00:00:00Z', lang)}</p>
              </div>
              <span dir="ltr" className="text-[15px] font-bold tabular-nums text-ink">750.00 <span className="text-xs text-ink-muted">USD</span></span>
            </div>
            <div className="mt-3"><CountChip tone="warning">{s.needsReview}</CountChip></div>
          </Panel>
          <div className="rounded-panel bg-accent p-5 text-on-accent shadow-raised">
            <p className="text-start text-label font-semibold uppercase tracking-wide opacity-80">{s.landingFrameLedger}</p>
            <p dir="ltr" className="mt-2 text-start text-[40px] font-bold leading-none tracking-tight tabular-nums">2,989.92 <span className="text-lg font-semibold opacity-80">USD</span></p>
            <p className="mt-2 text-start text-sm font-medium opacity-80">{s.landingFrameReceipts}</p>
          </div>
        </div>
      </section>

      {/* ── What it does ── */}
      <section className={`${container} py-12 sm:py-16`} data-landing-does>
        <h2 className={h2}>{s.landingDoesTitle}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Camera, title: s.landingScanTitle, body: s.landingScanBody },
            { icon: ScanLine, title: s.landingReadTitle, body: s.landingReadBody },
            { icon: ListChecks, title: s.landingReviewTitle, body: s.landingReviewBody },
          ].map(({ icon, title, body }) => (
            <Panel key={title} className="p-5">
              <IconTile icon={icon} tone="accent" />
              <h3 className="mt-4 text-start text-[17px] font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-start text-sm leading-relaxed text-ink-secondary">{body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className={`${container} scroll-mt-20 py-12 sm:py-16`} data-landing-how>
        <h2 className={h2}>{s.landingHowTitle}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            [s.landingStep1Title, s.landingStep1Body],
            [s.landingStep2Title, s.landingStep2Body],
            [s.landingStep3Title, s.landingStep3Body],
          ].map(([title, body], i) => (
            <li key={title} className={`p-5 ${panelClass}`}>
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-nav bg-surface-muted text-sm font-bold tabular-nums text-ink">{i + 1}</span>
              <h3 className="mt-4 text-start text-[17px] font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-start text-sm leading-relaxed text-ink-secondary">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── One figure per currency ── */}
      <section className={`${container} py-12 sm:py-16`} data-landing-money>
        <div className={`grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8 ${panelClass}`}>
          <div>
            <h2 className={h2}>{s.landingMoneyTitle}</h2>
            <p className="mt-3 max-w-xl text-start text-[15px] leading-relaxed text-ink-secondary">{s.landingMoneyBody}</p>
          </div>
          <div className="flex gap-3" aria-hidden="true">
            {[['2,989.92', 'USD'], ['1,263.85', 'MAD']].map(([n, c]) => (
              <div key={c} className="rounded-card bg-surface-muted px-4 py-3">
                <p dir="ltr" className="text-[22px] font-bold leading-none tabular-nums text-ink">{n}</p>
                <p className="mt-1 text-xs font-bold text-ink-muted">{c}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className={`${container} scroll-mt-20 py-12 sm:py-16`} data-landing-pricing>
        <h2 className={h2}>{s.landingPricingTitle}</h2>
        <p className="mt-2 text-start text-sm text-ink-secondary">{s.landingPricingSub}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Panel className="flex flex-col p-6" data-landing-plan="free">
            <h3 className="text-start text-[15px] font-semibold text-ink-secondary">{s.landingFreeName}</h3>
            <p dir="ltr" className="mt-2 text-start text-[40px] font-bold leading-none tracking-tight tabular-nums text-ink">{s.landingFreePrice}</p>
            <ul className="mt-5 space-y-2.5 text-start text-sm text-ink-secondary">
              {[s.landingFreeLine1, s.landingFreeLine2, s.landingFreeLine3].map((l) => (
                <li key={l} className="flex items-start gap-2"><Check size={16} className="mt-0.5 flex-none text-success" aria-hidden="true" />{l}</li>
              ))}
            </ul>
            <Link to="/login" className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-pill bg-surface-muted px-6 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt motion-reduce:transition-none">{s.landingFreeCta}</Link>
          </Panel>
          <div className="flex flex-col rounded-panel bg-accent p-6 text-on-accent shadow-raised" data-landing-plan="pro">
            <h3 className="text-start text-[15px] font-semibold opacity-90">{s.landingProName}</h3>
            {/* The price copy is PLAN_CATALOG's own fallback text: the same
                entries the checkout charges (nativeAntiSteering.test.tsx). */}
            <p dir="ltr" className="mt-2 text-start text-[40px] font-bold leading-none tracking-tight tabular-nums" data-landing-price>
              {monthly.fallbackFormatted}<span className="text-lg font-semibold opacity-80">{monthly.periodSuffix}</span>
            </p>
            <p className="mt-1 text-start text-sm font-medium opacity-80">
              {s.landingPerMonth} · {s.landingOrYearly} <span dir="ltr">{yearly.fallbackFormatted}{yearly.periodSuffix}</span> {s.landingPerYear}
            </p>
            <ul className="mt-5 space-y-2.5 text-start text-sm opacity-95">
              {[s.landingProLine1, s.landingProLine2, s.landingProLine3].map((l) => (
                <li key={l} className="flex items-start gap-2"><Check size={16} className="mt-0.5 flex-none" aria-hidden="true" />{l}</li>
              ))}
            </ul>
            <Link to="/login" className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-pill bg-surface-raised px-6 text-sm font-semibold text-ink transition-opacity hover:opacity-90 motion-reduce:transition-none">{s.landingProCta}</Link>
          </div>
        </div>
      </section>

      {/* ── Closing ── */}
      <section className={`${container} py-12 sm:py-20`} data-landing-closing>
        <div className={`p-6 text-center sm:p-10 ${panelClass}`}>
          <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">{s.landingClosingTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-secondary">{s.landingClosingBody}</p>
          <Link to="/login" className={`${primaryCta} mt-7`}>
            {s.landingHeroCta}
            <ArrowRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-sm font-medium text-ink-muted">{s.landingHeroNote}</p>
        </div>
      </section>

      <footer className={`${container} flex flex-col items-center gap-4 border-t border-line py-8 text-sm text-ink-muted sm:flex-row sm:justify-between`} data-landing-footer>
        <div className="flex items-center gap-2 text-ink-secondary">
          <FileText size={16} aria-hidden="true" />
          <span>{s.header}</span>
        </div>
        <nav className="flex items-center gap-5" aria-label={s.landingFooterTerms}>
          <Link to="/terms" className="underline underline-offset-4 hover:text-ink">{s.landingFooterTerms}</Link>
          <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">{s.landingFooterPrivacy}</Link>
          <Link to="/refund" className="underline underline-offset-4 hover:text-ink">{s.landingFooterRefund}</Link>
        </nav>
        <LanguageSwitcher />
      </footer>
    </div>
  );
}
