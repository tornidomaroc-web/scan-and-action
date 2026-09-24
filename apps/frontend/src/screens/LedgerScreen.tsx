import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Briefcase, Camera, ChevronLeft, ChevronRight, CircleDashed, HeartPulse, Car,
  Plane, Receipt, ShoppingBag, Utensils, X,
} from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { ErrorState } from '../components/ErrorState';
import { isIdentityConflict } from '../lib/identityConflict';
import { ledgerService } from '../services/ledgerService';
import type { LedgerCategory, LedgerMonth } from '../lib/ledgerTypes';
import {
  Lang, categoryCards, currentMonth, dayLabel, deviceTimeZone, figureSizeClass, isEmptyMonth, isMonth,
  moneyParts, monthName, monthTitle, needsReviewCount, plural, receiptRows, shiftMonth,
} from '../lib/ledgerView';

// ============================================================================
// The ledger home: what this month's money went on. Build-order item 3,
// the first design commit (WORK-QUEUE "4. Home: the ledger home").
//
// Top to bottom: the month and its navigation; one figure per currency, the
// same size for each, in the order /api/ledger returns them (the unknown
// currency last); what needs the owner; the eight categories as cards; the
// month's receipts as transactions.
//
// Every amount is read from /api/ledger and shown as returned. Nothing here
// adds amounts, and nothing compares amounts of different currencies
// (lib/ledgerView.ts says why; ledgerNoCrossCurrencySum.test.ts enforces it).
// There is no Pro or payment surface on this screen, on any platform.
// ============================================================================

const CATEGORY_ICON: Record<LedgerCategory, typeof Utensils> = {
  Food: Utensils,
  Transport: Car,
  Travel: Plane,
  Shopping: ShoppingBag,
  Health: HeartPulse,
  Bills: Receipt,
  Office: Briefcase,
  Other: CircleDashed,
};

type Strings = ReturnType<typeof useStrings>;

const categoryLabel = (s: Strings, c: LedgerCategory) => s[`cat${c}` as const];

/** An amount and its code, laid out for either direction: the number is isolated LTR. */
const Money: React.FC<{ amount: number; currency: string | null; lang: Lang; s: Strings; numberClass?: string; codeClass?: string }> = ({
  amount, currency, lang, s, numberClass = '', codeClass = '',
}) => {
  const p = moneyParts(amount, currency, lang);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" aria-label={`${p.number} ${p.name ?? p.code ?? s.ledgerNoCurrency}`}>
      <bdi dir="ltr" data-ledger-amount className={`tabular-nums ${numberClass}`}>{p.number}</bdi>
      <span className={codeClass}>{p.code ?? s.ledgerNoCurrency}</span>
    </span>
  );
};

export const LedgerScreen: React.FC = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const lang = language as Lang;
  const outlet = useOutletContext<{ refreshCount?: number; onNewScan?: () => void } | undefined>();
  const refreshCount = outlet?.refreshCount ?? 0;
  const onNewScan = outlet?.onNewScan;
  const [searchParams, setSearchParams] = useSearchParams();
  const timeZone = useMemo(deviceTimeZone, []);
  const thisMonth = useMemo(() => currentMonth(timeZone), [timeZone]);
  const requested = searchParams.get('month');
  const month = isMonth(requested) && requested <= thisMonth ? requested : thisMonth;

  const [data, setData] = useState<LedgerMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [filter, setFilter] = useState<LedgerCategory | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await ledgerService.getMonth(month, timeZone);
      if (id !== requestId.current) return; // a newer month was asked for
      setData(result);
      setError(null);
      setLocked(false);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('[Ledger] Month fetch failed:', err);
      const lockedNow = isIdentityConflict(err);
      setLocked(lockedNow);
      setError(lockedNow ? s.accountLockedBody : s.ledgerLoadError);
    }
  }, [month, timeZone, s]);

  // A new month shows the skeleton; a refresh after an upload does not blank
  // the screen (the board's "blanks twice per upload" defect is not repeated).
  useEffect(() => {
    setData(prev => (prev && prev.month === month ? prev : null));
    setFilter(null);
    void load();
  }, [month, refreshCount, load]);

  const goTo = (m: string) => {
    const next = new URLSearchParams(searchParams);
    if (m === thisMonth) next.delete('month');
    else next.set('month', m);
    setSearchParams(next);
  };

  const title = monthTitle(month, lang);
  const loading = !data && !error;

  return (
    <div className="mx-auto w-full max-w-xl pb-6" data-ledger-screen>
      {/* ── The month ── */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, -1))}
          aria-label={s.ledgerPrevMonth}
          data-ledger-prev
          className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition-colors hover:bg-surface-alt active:scale-95"
        >
          <ChevronLeft size={22} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
        <h1 id="ledger-month" className="text-section font-semibold text-ink" aria-live="polite">{title}</h1>
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, 1))}
          aria-label={s.ledgerNextMonth}
          disabled={month >= thisMonth}
          data-ledger-next
          className="flex h-11 w-11 items-center justify-center rounded-pill text-ink-secondary transition-colors hover:bg-surface-alt active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight size={22} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </header>

      {loading && <LedgerSkeleton label={s.ledgerLoading} />}

      {error && !data && (
        <div className="mt-6">
          <ErrorState
            title={locked ? s.accountLockedTitle : s.connectionError}
            message={error}
            onRetry={locked ? undefined : () => void load()}
          />
        </div>
      )}

      {data && isEmptyMonth(data) && (
        <EmptyMonth
          s={s}
          lang={lang}
          month={month}
          onScan={onNewScan}
          onPrevious={() => goTo(shiftMonth(month, -1))}
          excluded={data.excluded}
        />
      )}

      {data && !isEmptyMonth(data) && (
        <LedgerBody data={data} s={s} lang={lang} month={month} filter={filter} setFilter={setFilter} />
      )}

      {/* Everything the old home led to stays one tap away. */}
      <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-accent-text" aria-label={s.ledgerAllDocuments}>
        <Link to="/activity" className="py-2">{s.ledgerAllDocuments}</Link>
        <Link to="/overview" className="py-2">{s.overview}</Link>
      </nav>
    </div>
  );
};

const LedgerSkeleton: React.FC<{ label: string }> = ({ label }) => (
  // The same shapes as the loaded screen, in the same surfaces, so the page
  // does not jump when the figures arrive.
  <div className="mt-4 animate-pulse" aria-busy="true" aria-label={label} data-ledger-loading>
    <div className="h-3.5 w-28 rounded-pill bg-line" />
    <div className="mt-3 h-11 w-52 rounded-btn bg-line" />
    <div className="mt-2 h-3 w-36 rounded-pill bg-line" />
    <div className="mt-8 h-3.5 w-24 rounded-pill bg-line" />
    <div className="mt-3 grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] rounded-card bg-surface-raised shadow-card" />)}
    </div>
    <div className="mt-8 space-y-2">
      {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-card bg-surface-raised shadow-card" />)}
    </div>
  </div>
);

const ExcludedNote: React.FC<{ excluded: LedgerMonth['excluded']; s: Strings; lang: Lang }> = ({ excluded, s, lang }) => {
  const parts: string[] = [];
  if (excluded.duplicate > 0) parts.push(plural(excluded.duplicate, lang, s.ledgerExcludedDuplicateOne, s.ledgerExcludedDuplicateOther));
  if (excluded.noAmount > 0) parts.push(plural(excluded.noAmount, lang, s.ledgerExcludedNoAmount, s.ledgerExcludedNoAmount));
  if (excluded.status > 0) parts.push(plural(excluded.status, lang, s.ledgerExcludedStatus, s.ledgerExcludedStatus));
  if (!parts.length) return null;
  const list = parts.join(lang === 'ar' ? '، ' : ', ');
  return <p className="mt-3 text-xs text-ink-muted" data-ledger-excluded>{s.ledgerNotCounted.replace('{list}', list)}</p>;
};

const EmptyMonth: React.FC<{
  s: Strings; lang: Lang; month: string; onScan?: () => void; onPrevious: () => void; excluded: LedgerMonth['excluded'];
}> = ({ s, lang, month, onScan, onPrevious, excluded }) => (
  <section className="mt-6 rounded-card bg-surface-raised p-8 text-center shadow-card" data-ledger-empty>
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-accent-tint text-accent-text">
      <Receipt size={26} aria-hidden="true" />
    </div>
    <h2 className="mt-4 text-section font-semibold text-ink">{s.ledgerEmptyTitle.replace('{month}', monthName(month, lang))}</h2>
    <p className="mx-auto mt-1 max-w-xs text-sm text-ink-secondary">{s.ledgerEmptyBody}</p>
    <div className="mt-6 flex flex-col items-center gap-2">
      {onScan && (
        <button
          type="button"
          onClick={onScan}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-btn bg-accent px-5 text-sm font-bold text-surface-raised shadow-card transition-all hover:bg-accent-hover active:scale-95"
        >
          <Camera size={18} aria-hidden="true" />
          {s.scanReceipt}
        </button>
      )}
      <button type="button" onClick={onPrevious} className="min-h-[44px] px-3 text-sm font-semibold text-accent-text">
        {s.ledgerEmptySee.replace('{month}', monthTitle(shiftMonth(month, -1), lang))}
      </button>
    </div>
    <ExcludedNote excluded={excluded} s={s} lang={lang} />
  </section>
);

const LedgerBody: React.FC<{
  data: LedgerMonth; s: Strings; lang: Lang; month: string;
  filter: LedgerCategory | null; setFilter: (c: LedgerCategory | null) => void;
}> = ({ data, s, lang, month, filter, setFilter }) => {
  const cards = categoryCards(data);
  const rows = receiptRows(data);
  const needs = needsReviewCount(data);
  const shown = filter ? rows.filter(r => (r.category ?? 'Other') === filter) : rows;

  return (
    <>
      {/* ── The figures: one per currency, same size, never added together ── */}
      <section className="mt-4" aria-labelledby="ledger-spent">
        <p id="ledger-spent" className="text-sm font-medium text-ink-muted">
          {s.ledgerSpentIn.replace('{month}', monthName(month, lang))}
        </p>
        <ul className="mt-2 space-y-4">
          {data.currencies.map(c => {
            const p = moneyParts(c.total, c.currency, lang);
            return (
              <li key={c.currency ?? 'none'} data-ledger-currency={c.currency ?? 'none'}>
                <div className="flex flex-wrap items-baseline gap-x-2" aria-label={`${p.number} ${p.name ?? p.code ?? s.ledgerNoCurrency}`}>
                  <bdi
                    dir="ltr"
                    data-ledger-figure
                    className={`${figureSizeClass(p.number)} font-extrabold leading-none tracking-tight tabular-nums ${c.currency ? 'text-ink' : 'text-ink-secondary'}`}
                  >
                    {p.number}
                  </bdi>
                  <span className={`text-lg font-semibold ${c.currency ? 'text-ink-muted' : 'text-warning-text'}`}>
                    {p.code ?? s.ledgerNoCurrency}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {p.name ? `${p.name} · ` : ''}
                  {plural(c.receiptCount, lang, s.ledgerReceiptsOne, s.ledgerReceiptsOther)}
                </p>
              </li>
            );
          })}
        </ul>
        {data.currencies.length > 1 && (
          <p className="mt-3 text-xs text-ink-muted" data-ledger-separate>{s.ledgerSeparateCurrencies}</p>
        )}
        <ExcludedNote excluded={data.excluded} s={s} lang={lang} />
      </section>

      {/* ── What needs him ── */}
      {needs > 0 && (
        <Link
          to="/queue"
          data-ledger-needs
          className="mt-5 flex min-h-[52px] items-center justify-between gap-3 rounded-card bg-warning-tint px-4 font-semibold text-warning-text"
        >
          <span>{plural(needs, lang, s.ledgerNeedsReviewOne, s.ledgerNeedsReviewOther)}</span>
          <ChevronRight size={18} className="rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      )}

      {/* ── Categories ── */}
      <section className="mt-8" aria-labelledby="ledger-cats">
        <h2 id="ledger-cats" className="text-sm font-semibold text-ink">{s.ledgerByCategory}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {cards.active.map(card => {
            const Icon = CATEGORY_ICON[card.category];
            const on = filter === card.category;
            return (
              <button
                key={card.category}
                type="button"
                data-ledger-category={card.category}
                aria-pressed={on}
                aria-label={s.ledgerCategoryFilter.replace('{category}', categoryLabel(s, card.category))}
                onClick={() => setFilter(on ? null : card.category)}
                className={`flex min-h-[104px] flex-col justify-between gap-2 rounded-card p-4 text-start transition-colors ${
                  on ? 'bg-accent-tint ring-2 ring-accent' : 'bg-surface-raised shadow-card hover:bg-surface-alt'
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink-secondary">
                  <span>{categoryLabel(s, card.category)}</span>
                  <Icon size={16} aria-hidden="true" className="text-ink-faint" />
                </span>
                <span className="flex flex-col gap-0.5">
                  {card.lines.map(line => (
                    <Money
                      key={line.currency ?? 'none'}
                      amount={line.total}
                      currency={line.currency}
                      lang={lang}
                      s={s}
                      numberClass="text-[17px] font-bold text-ink"
                      codeClass="text-xs font-semibold text-ink-muted"
                    />
                  ))}
                </span>
                <span className="text-xs text-ink-muted">
                  {plural(card.receiptCount, lang, s.ledgerReceiptsOne, s.ledgerReceiptsOther)}
                  {card.notYetSorted > 0 && (
                    <span className="block text-warning-text" data-ledger-not-sorted>
                      {s.ledgerNotYetSorted.replace('{n}', String(card.notYetSorted))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {cards.empty.length > 0 && (
          <p className="mt-3 text-xs text-ink-muted" data-ledger-empty-categories>
            {s.ledgerNothingIn.replace('{list}', cards.empty.map(c => categoryLabel(s, c)).join(lang === 'ar' ? '، ' : ', '))}
          </p>
        )}
      </section>

      {/* ── Receipts ── */}
      <section className="mt-8" aria-labelledby="ledger-receipts">
        <div className="flex items-center justify-between gap-2">
          <h2 id="ledger-receipts" className="text-sm font-semibold text-ink">{s.ledgerReceipts}</h2>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              data-ledger-clear-filter
              className="inline-flex min-h-[36px] items-center gap-1 rounded-pill bg-accent-tint px-3 text-xs font-semibold text-accent-text"
            >
              {s.ledgerShowing.replace('{category}', categoryLabel(s, filter))}
              <X size={14} aria-hidden="true" />
              <span className="sr-only">{s.ledgerShowAll}</span>
            </button>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {shown.map(r => {
            const Icon = CATEGORY_ICON[r.category ?? 'Other'];
            return (
              <li key={r.documentId}>
                <Link
                  to={`/documents/${r.documentId}`}
                  data-ledger-row={r.documentId}
                  className="flex items-center gap-3 rounded-card bg-surface-raised p-4 shadow-card transition-colors hover:bg-surface-alt"
                >
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-btn bg-surface-alt text-ink-secondary">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      dir="auto"
                      className={`block truncate text-[15px] font-semibold ${r.merchant ? 'text-ink' : 'text-ink-muted'}`}
                      title={r.merchant ?? undefined}
                    >
                      {r.merchant ?? s.ledgerUnknownVendor}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                      <span data-ledger-date>
                        {r.dateSource === 'uploaded' ? s.ledgerNoDate.replace('{day}', dayLabel(r.date, lang)) : dayLabel(r.date, lang)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{r.category ? categoryLabel(s, r.category) : s.ledgerNotSortedTag}</span>
                      {r.status === 'NEEDS_REVIEW' && (
                        <span className="rounded-pill bg-warning-tint px-2 py-0.5 font-semibold text-warning-text">{s.ledgerNeedsReviewTag}</span>
                      )}
                      {r.amountSource === 'corrected' && (
                        <span className="rounded-pill bg-surface-alt px-2 py-0.5 font-semibold text-ink-secondary">{s.ledgerCorrectedTag}</span>
                      )}
                    </span>
                  </span>
                  <span className="flex-none text-end">
                    <Money
                      amount={r.amount}
                      currency={r.currency}
                      lang={lang}
                      s={s}
                      numberClass="text-[15px] font-bold text-ink"
                      codeClass={`text-xs font-semibold ${r.currency ? 'text-ink-muted' : 'text-warning-text'}`}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
};

export default LedgerScreen;
