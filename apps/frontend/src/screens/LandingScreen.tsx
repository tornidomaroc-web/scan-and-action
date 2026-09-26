import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Check, CheckCircle, FileText, Search as SearchIcon, XCircle } from 'lucide-react';
import { PLAN_CATALOG } from '../lib/pricing';
import { LandingHeader } from '../components/LandingHeader';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { CountChip } from '../components/ui/CountChip';
import { IconTile } from '../components/ui/IconTile';
import { Panel, panelClass } from '../components/ui/Panel';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { fullDayLabel, monthTitle, Lang } from '../lib/ledgerView';

// ============================================================================
// The public landing page. Structure and rhythm: the Vantro landing on
// HorizonX, read from its public preview on 2026-09-26 (a floating pill nav;
// a centred hero with a small pill badge, a two-line headline, one line of
// copy, one CTA pill and a note; a large product mockup; a "why" section of
// three cards with a small UI preview above a title and one line; a "key
// tools" section with a vertical tab list beside a live preview card, with
// dots; light and airy). Dressed in the app's own language: tokens only,
// dark first and light by inversion, in English, French and Arabic with
// right-to-left through the logical classes.
//
// THE MOCKUPS ARE THE APP'S OWN SCREENS, drawn with the app's pieces: the
// ledger home (one figure per currency, never summed), the Queue card and
// Search. Their rows are an EXAMPLE and say so (s.landingSample): the page
// does not quote a live record, so it cannot drift from one (the sample
// receipt's date disagreed with the ledger once, 2026-09-26).
//
// EVERY CLAIM IS SOMETHING THE APP DOES TODAY, and the witness is named:
//   scan from the camera or a photo / PDF   CaptureSheet.tsx accept="image/*,application/pdf"
//   merchant, total, date, category         ledgerCore.ts fact keys; expenseCategories.ts
//   three languages                         i18n/strings.ts en / fr / ar
//   a queue with the reason in plain words  ReviewQueueScreen.tsx, DocumentDetailScreen.tsx issues
//   one figure per currency, never summed   ledgerCore.ts, ledgerNoCrossCurrencySum.test.ts
//   search by merchant, category, month     SearchScreen.tsx, receiptSearch.ts
//   10 scans included, free                 uploadController.ts "Free plan limit reached (10 scans)"
//   no card to start                        AuthScreen.tsx: email and password only
//   the price is the checkout price         lib/pricing.ts PLAN_CATALOG (the same ids Paddle charges)
//   one document at a time on Free          strings freePlanSingleDoc, uploadController
// No count of users, no rating, no testimonial, no logo: none exists to cite.
//
// What must stay as it was: every link (/login x4, /terms, /privacy,
// /refund, #how-it-works, #pricing), the price copy from PLAN_CATALOG, and
// nothing that reaches Paddle (this page never did).
// ============================================================================

const container = 'mx-auto w-full max-w-6xl px-5 sm:px-6';
const h2 = 'text-center text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]';
const primaryCta = 'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-pill bg-accent px-7 text-[15px] font-semibold text-on-accent shadow-raised transition-colors hover:bg-accent-hover motion-reduce:transition-none';

/** The small pill above a section title, as the kit sets it. */
const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-raised px-3 py-1 text-xs font-semibold text-ink-secondary ring-1 ring-line">
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-accent-bright" />
    {children}
  </span>
);

const SampleChip: React.FC<{ label: string }> = ({ label }) => (
  <CountChip className="absolute top-3 end-3">{label}</CountChip>
);

/** The example receipt, drawn as the app's row draws one. */
const SampleRow: React.FC<{ lang: Lang; s: ReturnType<typeof useStrings>; chip?: React.ReactNode }> = ({ lang, s, chip }) => (
  <div className="flex items-center gap-3">
    <CategoryIcon category="Food" size="sm" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-semibold text-ink" dir="auto">JOE'S PIZZA RESTAURANT</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-start text-xs font-medium text-ink-muted">
        <span>{fullDayLabel('2026-09-07T00:00:00Z', lang)}</span>
        <span aria-hidden="true">·</span>
        <span>{s.catFood}</span>
        {chip}
      </p>
    </div>
    <span dir="ltr" className="text-[15px] font-bold tabular-nums text-ink">750.00 <span className="text-[11px] font-bold text-ink-muted">USD</span></span>
  </div>
);

/** The ledger home: one figure per currency, the categories, the month's rows. */
const MockLedger: React.FC<{ lang: Lang; s: ReturnType<typeof useStrings> }> = ({ lang, s }) => (
  <div className="relative" data-landing-mock="ledger">
    <SampleChip label={s.landingSample} />
    <p className="text-start text-label font-semibold uppercase tracking-wide text-ink-muted">{monthTitle('2026-09', lang)}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-panel bg-accent p-4 text-on-accent shadow-raised">
        <p dir="ltr" className="text-start text-[32px] font-bold leading-none tracking-tight tabular-nums">2,989.92 <span className="text-base font-semibold opacity-80">USD</span></p>
        <p className="mt-2 text-start text-sm font-medium opacity-80">{s.landingMockUsdCount}</p>
      </div>
      <div className="rounded-panel bg-surface-muted p-4">
        <p dir="ltr" className="text-start text-[32px] font-bold leading-none tracking-tight tabular-nums text-ink">1,263.85 <span className="text-base font-semibold text-ink-muted">MAD</span></p>
        <p className="mt-2 text-start text-sm font-medium text-ink-muted">{s.landingMockMadCount}</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {(['Food', 'Transport', 'Office'] as const).map((c) => (
        <span key={c} className="flex items-center gap-2 rounded-pill bg-surface-muted py-1 ps-1 pe-3 text-xs font-semibold text-ink">
          <CategoryIcon category={c} size="sm" />{s[`cat${c}`]}
        </span>
      ))}
    </div>
    <div className="mt-3 rounded-card bg-surface-muted px-3 py-3"><SampleRow lang={lang} s={s} /></div>
  </div>
);

/** The Queue card: the reason in plain words, Approve and Reject. */
const MockQueue: React.FC<{ lang: Lang; s: ReturnType<typeof useStrings>; compact?: boolean }> = ({ lang, s, compact }) => (
  <div className="relative" data-landing-mock="queue">
    {!compact && <SampleChip label={s.landingSample} />}
    {!compact && <p className="mb-3 text-start text-label font-semibold uppercase tracking-wide text-ink-muted">{s.queueTab}</p>}
    <div className="rounded-card bg-surface-muted p-3">
      <SampleRow lang={lang} s={s} />
      <div className="mt-3 flex items-center border-t border-divider pt-3">
        <CountChip tone="warning">{s.searchReasonDuplicate}</CountChip>
      </div>
      <div className="mt-3 flex gap-2" aria-hidden="true">
        <span className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-btn bg-success-tint text-xs font-semibold text-success-text ring-1 ring-line"><CheckCircle size={15} />{s.approve}</span>
        <span className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-btn bg-danger-tint text-xs font-semibold text-danger-text ring-1 ring-line"><XCircle size={15} />{s.reject}</span>
      </div>
    </div>
  </div>
);

/** Search: the field, the category chips, one result. */
const MockSearch: React.FC<{ lang: Lang; s: ReturnType<typeof useStrings> }> = ({ lang, s }) => (
  <div className="relative" data-landing-mock="search">
    <SampleChip label={s.landingSample} />
    <p className="text-start text-label font-semibold uppercase tracking-wide text-ink-muted">{s.searchTab}</p>
    <div className="mt-3 flex h-11 items-center gap-2 rounded-pill bg-surface-muted px-4 text-sm text-ink">
      <SearchIcon size={16} className="text-ink-muted" aria-hidden="true" />
      <span dir="ltr">{s.landingSearchQuery}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <span className="rounded-pill bg-ink px-3 py-1 text-xs font-semibold text-surface-raised">{s.searchAllCategories}</span>
      {(['Food', 'Transport'] as const).map((c) => (
        <span key={c} className="rounded-pill bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-secondary">{s[`cat${c}`]}</span>
      ))}
    </div>
    <div className="mt-3 rounded-card bg-surface-muted px-3 py-3"><SampleRow lang={lang} s={s} /></div>
  </div>
);

type Tool = 'ledger' | 'queue' | 'search';
const TOOLS: Tool[] = ['ledger', 'queue', 'search'];

export function LandingScreen() {
  const s = useStrings();
  const lang = useLanguage().language as Lang;
  const monthly = PLAN_CATALOG.monthly;
  const yearly = PLAN_CATALOG.yearly;
  const [tool, setTool] = useState<Tool>('ledger');
  const toolCopy: Record<Tool, [string, string]> = {
    ledger: [s.landingToolLedger, s.landingToolLedgerBody],
    queue: [s.landingToolQueue, s.landingToolQueueBody],
    search: [s.landingToolSearch, s.landingToolSearchBody],
  };

  return (
    <div className="min-h-screen bg-surface text-ink" data-landing>
      <LandingHeader />

      {/* ── Hero: centred, badge, two lines, one line, one CTA, a note ── */}
      <section className={`${container} flex flex-col items-center pb-10 pt-14 text-center sm:pt-20`} data-landing-hero>
        <Badge>{s.landingBadge}</Badge>
        <h1 className="mt-5 max-w-3xl text-balance text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[60px]">
          <span className="block">{s.landingHero1}</span>
          <span className="block text-accent-text">{s.landingHero2}</span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-[17px] leading-relaxed text-ink-secondary">{s.landingHeroSub}</p>
        <Link to="/login" className={`${primaryCta} mt-8`}>
          {s.landingHeroCta}
          <ArrowRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
        </Link>
        <p className="mt-3 text-sm font-medium text-ink-muted">{s.landingHeroNote}</p>
      </section>

      {/* ── The product: the ledger home, large, under the hero ── */}
      <section className={`${container} pb-16 sm:pb-24`} data-landing-showcase aria-label={s.landingToolLedger}>
        <Panel className="mx-auto max-w-4xl p-5 sm:p-8">
          <MockLedger lang={lang} s={s} />
        </Panel>
      </section>

      {/* ── Why: three cards, a small preview above a title and one line ── */}
      <section id="how-it-works" className={`${container} scroll-mt-24 py-12 sm:py-16`} data-landing-why>
        <div className="flex flex-col items-center text-center">
          <Badge>{s.landingWhyBadge}</Badge>
          <h2 className={`${h2} mt-4`}>{s.landingWhyTitle}</h2>
          <p className="mt-3 max-w-xl text-balance text-[15px] leading-relaxed text-ink-secondary">{s.landingWhySub}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Panel className="p-4" data-landing-card="scan">
            <div className="flex h-36 items-center justify-center gap-3 rounded-card bg-surface-muted" aria-hidden="true">
              <IconTile icon={Camera} tone="accent" size="lg" />
              <span className="text-sm font-semibold text-ink-secondary">{s.landingScanPreview}</span>
            </div>
            <h3 className="mt-4 text-start text-[17px] font-semibold text-ink">{s.landingScanTitle}</h3>
            <p className="mt-1.5 text-start text-sm leading-relaxed text-ink-secondary">{s.landingScanBody}</p>
          </Panel>
          <Panel className="p-4" data-landing-card="read">
            <div className="flex h-36 items-center rounded-card bg-surface-muted px-3" aria-hidden="true">
              <div className="w-full"><SampleRow lang={lang} s={s} /></div>
            </div>
            <h3 className="mt-4 text-start text-[17px] font-semibold text-ink">{s.landingReadTitle}</h3>
            <p className="mt-1.5 text-start text-sm leading-relaxed text-ink-secondary">{s.landingReadBody}</p>
          </Panel>
          <Panel className="p-4" data-landing-card="review">
            <div className="flex h-36 items-center overflow-hidden rounded-card bg-surface-muted px-3" aria-hidden="true">
              <div className="w-full">
                <div className="flex items-center gap-2"><CountChip tone="warning">{s.needsReview}</CountChip><span className="text-xs font-medium text-ink-muted">{s.searchReasonDuplicate}</span></div>
                <div className="mt-3 flex gap-2">
                  <span className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-btn bg-success-tint text-xs font-semibold text-success-text ring-1 ring-line"><CheckCircle size={15} />{s.approve}</span>
                  <span className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-btn bg-danger-tint text-xs font-semibold text-danger-text ring-1 ring-line"><XCircle size={15} />{s.reject}</span>
                </div>
              </div>
            </div>
            <h3 className="mt-4 text-start text-[17px] font-semibold text-ink">{s.landingReviewTitle}</h3>
            <p className="mt-1.5 text-start text-sm leading-relaxed text-ink-secondary">{s.landingReviewBody}</p>
          </Panel>
        </div>
      </section>

      {/* ── The screens: a vertical tab list beside a live preview, with dots ── */}
      <section className={`${container} py-12 sm:py-16`} data-landing-tools>
        <div className="flex flex-col items-center text-center">
          <Badge>{s.landingToolsBadge}</Badge>
          <h2 className={`${h2} mt-4`}>{s.landingToolsTitle}</h2>
          <p className="mt-3 max-w-xl text-balance text-[15px] leading-relaxed text-ink-secondary">{s.landingToolsSub}</p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-10">
          <div role="tablist" aria-label={s.landingToolsTitle} className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" style={{ scrollbarWidth: 'none' }}>
            {TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tool === t}
                aria-controls={`landing-tool-${t}`}
                id={`landing-tab-${t}`}
                onClick={() => setTool(t)}
                data-landing-tab={t}
                className={`flex-none rounded-pill px-4 py-2.5 text-start text-[15px] font-semibold transition-colors motion-reduce:transition-none lg:w-full lg:rounded-card lg:border-s-2 lg:px-4 lg:py-3 ${tool === t ? 'bg-surface-raised text-accent-text shadow-card ring-1 ring-line lg:border-accent lg:bg-transparent lg:shadow-none lg:ring-0' : 'text-ink-muted hover:text-ink lg:border-transparent'}`}
              >
                {toolCopy[t][0]}
              </button>
            ))}
          </div>
          <div>
            <Panel className="p-5 sm:p-6" role="tabpanel" id={`landing-tool-${tool}`} aria-labelledby={`landing-tab-${tool}`} data-landing-tool-panel={tool}>
              {tool === 'ledger' && <MockLedger lang={lang} s={s} />}
              {tool === 'queue' && <MockQueue lang={lang} s={s} />}
              {tool === 'search' && <MockSearch lang={lang} s={s} />}
            </Panel>
            <h3 className="mt-5 text-start text-[17px] font-semibold text-ink">{toolCopy[tool][0]}</h3>
            <p className="mt-1.5 max-w-xl text-start text-sm leading-relaxed text-ink-secondary">{toolCopy[tool][1]}</p>
            <div className="mt-5 flex items-center gap-2" data-landing-dots>
              {TOOLS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={toolCopy[t][0]}
                  aria-pressed={tool === t}
                  onClick={() => setTool(t)}
                  className={`h-2 rounded-pill transition-all motion-reduce:transition-none ${tool === t ? 'w-6 bg-ink' : 'w-2 bg-ink-fainter hover:bg-ink-muted'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── One figure per currency ── */}
      <section className={`${container} py-12 sm:py-16`} data-landing-money>
        <div className={`grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8 ${panelClass}`}>
          <div>
            <h2 className="text-start text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">{s.landingMoneyTitle}</h2>
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
      <section id="pricing" className={`${container} scroll-mt-24 py-12 sm:py-16`} data-landing-pricing>
        <h2 className={h2}>{s.landingPricingTitle}</h2>
        <p className="mt-2 text-center text-sm text-ink-secondary">{s.landingPricingSub}</p>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
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
            {/* The price copy is PLAN_CATALOG's own fallback text, written once
                each: the same entries the checkout charges (nativeAntiSteering). */}
            <p dir="ltr" className="mt-2 text-start text-[40px] font-bold leading-none tracking-tight tabular-nums" data-landing-price>
              {monthly.fallbackFormatted}<span className="text-lg font-semibold opacity-80">{monthly.periodSuffix}</span>
            </p>
            <p className="mt-1 text-start text-sm font-medium opacity-80" data-landing-price-yearly>
              {s.landingOrYearly} <span dir="ltr">{yearly.fallbackFormatted}{yearly.periodSuffix}</span>
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
          <h2 className={h2}>{s.landingClosingTitle}</h2>
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
