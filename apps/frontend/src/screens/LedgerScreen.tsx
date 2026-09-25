import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, ClipboardCheck, Receipt, X } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { ErrorState } from '../components/ErrorState';
import { CategoryIcon, CATEGORY_RING } from '../components/ui/CategoryIcon';
import { CountChip } from '../components/ui/CountChip';
import { Money } from '../components/ui/Money';
import { Panel, panelClass } from '../components/ui/Panel';
import { ReceiptRow } from '../components/ui/ReceiptRow';
import { isIdentityConflict } from '../lib/identityConflict';
import { isRequestTimeout } from '../lib/fetchWithTimeout';
import { ledgerService } from '../services/ledgerService';
import type { LedgerCategory, LedgerMonth } from '../lib/ledgerTypes';
import {
  Lang, categoryCards, currentMonth, deviceTimeZone, figureSizeClass, isEmptyMonth, isMonth,
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
//
// The visual language (components/ui): a category is a solid colour tile with
// a white glyph and always its name beside it; a card is a Panel; a count is a
// CountChip; a receipt in a list is a ReceiptRow, shared with Search; figure,
// code, label and meta each have their own weight, size and colour
// (CountChip.tsx lists them).
// ============================================================================

type Strings = ReturnType<typeof useStrings>;

const categoryLabel = (s: Strings, c: LedgerCategory) => s[`cat${c}` as const];

export const LedgerScreen: React.FC = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const lang = language as Lang;
  const outlet = useOutletContext<{ refreshCount?: number; onNewScan?: () => void; pendingCount?: number } | undefined>();
  const refreshCount = outlet?.refreshCount ?? 0;
  const onNewScan = outlet?.onNewScan;
  const queueTotal = outlet?.pendingCount;
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
      setError(lockedNow ? s.accountLockedBody : isRequestTimeout(err) ? s.requestTimedOut : s.ledgerLoadError);
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
  const navButton = 'flex h-11 w-11 items-center justify-center rounded-pill bg-surface-raised text-ink-secondary ring-1 ring-line transition-colors hover:text-ink active:scale-95';

  return (
    <div className="mx-auto w-full max-w-xl pb-6" data-ledger-screen>
      {/* ── The month ── */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, -1))}
          aria-label={s.ledgerPrevMonth}
          data-ledger-prev
          className={navButton}
        >
          <ChevronLeft size={20} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
        <h1 id="ledger-month" className="text-[17px] font-bold tracking-tight text-ink" aria-live="polite">{title}</h1>
        <button
          type="button"
          onClick={() => goTo(shiftMonth(month, 1))}
          aria-label={s.ledgerNextMonth}
          disabled={month >= thisMonth}
          data-ledger-next
          className={`${navButton} disabled:pointer-events-none disabled:opacity-30`}
        >
          <ChevronRight size={20} className="rtl:-scale-x-100" aria-hidden="true" />
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
        <>
          <NeedsReview s={s} lang={lang} month={month} monthCount={0} queueTotal={queueTotal} />
          <EmptyMonth
            s={s}
            lang={lang}
            month={month}
            onScan={onNewScan}
            onPrevious={() => goTo(shiftMonth(month, -1))}
            excluded={data.excluded}
          />
        </>
      )}

      {data && !isEmptyMonth(data) && (
        <LedgerBody data={data} s={s} lang={lang} month={month} filter={filter} setFilter={setFilter} queueTotal={queueTotal} />
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
  <div className="mt-6 animate-pulse" aria-busy="true" aria-label={label} data-ledger-loading>
    <div className="h-3.5 w-28 rounded-pill bg-line" />
    <div className="mt-3 h-11 w-52 rounded-btn bg-line" />
    <div className="mt-3 h-5 w-36 rounded-pill bg-line" />
    <div className="mt-8 h-3.5 w-24 rounded-pill bg-line" />
    <div className="mt-3 grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className={`h-[136px] ${panelClass}`} />)}
    </div>
    <div className={`mt-8 h-[216px] ${panelClass}`} />
  </div>
);

const ExcludedNote: React.FC<{ excluded: LedgerMonth['excluded']; s: Strings; lang: Lang }> = ({ excluded, s, lang }) => {
  const parts: string[] = [];
  if (excluded.duplicate > 0) parts.push(plural(excluded.duplicate, lang, s.ledgerExcludedDuplicate));
  if (excluded.noAmount > 0) parts.push(plural(excluded.noAmount, lang, s.ledgerExcludedNoAmount));
  if (excluded.status > 0) parts.push(plural(excluded.status, lang, s.ledgerExcludedStatus));
  if (!parts.length) return null;
  const list = parts.join(lang === 'ar' ? '، ' : ', ');
  return <p className="mt-3 text-xs font-medium text-ink-muted" data-ledger-excluded>{s.ledgerNotCounted.replace('{list}', list)}</p>;
};

/**
 * What needs the owner. Two numbers from two sources, each named for what it
 * counts, so neither reads as the other's mistake:
 *   monthCount  receipts of THIS month that count in its figures and wait for
 *               review (/api/ledger, NEEDS_REVIEW rows it counts);
 *   queueTotal  every NEEDS_REVIEW document in every month, counted or not:
 *               the Queue tab's badge (GET /api/stats pendingCount, via Layout).
 * The second line appears only when the two differ, and names the Queue tab.
 */
const NeedsReview: React.FC<{ s: Strings; lang: Lang; month: string; monthCount: number; queueTotal?: number }> = ({
  s, lang, month, monthCount, queueTotal,
}) => {
  const total = typeof queueTotal === 'number' ? queueTotal : null;
  if (monthCount === 0 && !total) return null;
  const titleText = monthCount > 0
    ? plural(monthCount, lang, s.ledgerNeedsReview).replace('{month}', monthName(month, lang))
    : plural(total!, lang, s.ledgerQueueWaiting);
  const allMonths = monthCount > 0 && total !== null && total > monthCount ? plural(total, lang, s.ledgerQueueAll) : null;
  return (
    <Link to="/queue" data-ledger-needs className={`mt-6 flex min-h-[64px] items-center gap-3 p-3 pe-4 ${panelClass}`}>
      <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-tile bg-warning-tint text-warning-text">
        <ClipboardCheck size={20} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink">{titleText}</span>
        {allMonths && <span className="mt-0.5 block text-xs font-medium text-ink-muted" data-ledger-queue-all>{allMonths}</span>}
      </span>
      <ChevronRight size={18} className="flex-none text-ink-faint rtl:-scale-x-100" aria-hidden="true" />
    </Link>
  );
};

const EmptyMonth: React.FC<{
  s: Strings; lang: Lang; month: string; onScan?: () => void; onPrevious: () => void; excluded: LedgerMonth['excluded'];
}> = ({ s, lang, month, onScan, onPrevious, excluded }) => (
  <Panel className="mt-6 p-8 text-center" data-ledger-empty>
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-tile bg-accent text-surface-raised">
      <Receipt size={26} aria-hidden="true" />
    </div>
    <h2 className="mt-4 text-[17px] font-bold text-ink">{s.ledgerEmptyTitle.replace('{month}', monthName(month, lang))}</h2>
    <p className="mx-auto mt-1 max-w-xs text-sm text-ink-secondary">{s.ledgerEmptyBody}</p>
    <div className="mt-6 flex flex-col items-center gap-2">
      {onScan && (
        <button
          type="button"
          onClick={onScan}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-accent px-6 text-sm font-bold text-surface-raised shadow-card transition-all hover:bg-accent-hover active:scale-95"
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
  </Panel>
);

const LedgerBody: React.FC<{
  data: LedgerMonth; s: Strings; lang: Lang; month: string; queueTotal?: number;
  filter: LedgerCategory | null; setFilter: (c: LedgerCategory | null) => void;
}> = ({ data, s, lang, month, queueTotal, filter, setFilter }) => {
  const cards = categoryCards(data);
  const rows = receiptRows(data);
  const needs = needsReviewCount(data);
  const shown = filter ? rows.filter(r => (r.category ?? 'Other') === filter) : rows;

  return (
    <>
      {/* ── The figures: one per currency, same size, never added together ── */}
      <section className="mt-6" aria-labelledby="ledger-spent">
        <p id="ledger-spent" className="text-sm font-semibold text-ink-secondary">
          {s.ledgerSpentIn.replace('{month}', monthName(month, lang))}
        </p>
        <ul className="mt-2 divide-y divide-divider">
          {data.currencies.map(c => {
            const p = moneyParts(c.total, c.currency, lang);
            return (
              <li key={c.currency ?? 'none'} data-ledger-currency={c.currency ?? 'none'} className="py-3 first:pt-1">
                <div className="flex flex-wrap items-baseline gap-x-2" aria-label={`${p.number} ${p.name ?? p.code ?? s.ledgerNoCurrency}`}>
                  <bdi
                    dir="ltr"
                    data-ledger-figure
                    className={`${figureSizeClass(p.number)} font-extrabold leading-none tracking-tight tabular-nums ${c.currency ? 'text-ink' : 'text-ink-secondary'}`}
                  >
                    {p.number}
                  </bdi>
                  <span className={`text-base font-bold tracking-wide ${c.currency ? 'text-ink-muted' : 'text-warning-text'}`}>
                    {p.code ?? s.ledgerNoCurrency}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CountChip>{plural(c.receiptCount, lang, s.ledgerReceiptCount)}</CountChip>
                  {p.name && <span className="text-xs font-medium text-ink-muted">{p.name}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {data.currencies.length > 1 && (
          <p className="mt-1 text-xs font-medium text-ink-muted" data-ledger-separate>{s.ledgerSeparateCurrencies}</p>
        )}
        <ExcludedNote excluded={data.excluded} s={s} lang={lang} />
      </section>

      <NeedsReview s={s} lang={lang} month={month} monthCount={needs} queueTotal={queueTotal} />

      {/* ── Categories ── */}
      <section className="mt-8" aria-labelledby="ledger-cats">
        <h2 id="ledger-cats" className="text-[15px] font-bold text-ink">{s.ledgerByCategory}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {cards.active.map(card => {
            const on = filter === card.category;
            return (
              <button
                key={card.category}
                type="button"
                data-ledger-category={card.category}
                aria-pressed={on}
                aria-label={s.ledgerCategoryFilter.replace('{category}', categoryLabel(s, card.category))}
                onClick={() => setFilter(on ? null : card.category)}
                className={`flex min-h-[136px] flex-col gap-3 rounded-panel bg-surface-raised p-4 text-start shadow-card transition-shadow active:scale-[0.98] ${
                  on ? `ring-2 ${CATEGORY_RING[card.category]}` : 'ring-1 ring-line'
                }`}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <CategoryIcon category={card.category} />
                  <CountChip>{plural(card.receiptCount, lang, s.ledgerReceiptCount)}</CountChip>
                </span>
                <span className="text-sm font-semibold text-ink-secondary">{categoryLabel(s, card.category)}</span>
                <span className="mt-auto flex flex-col gap-0.5">
                  {card.lines.map(line => (
                    <Money
                      key={line.currency ?? 'none'}
                      amount={line.total}
                      currency={line.currency}
                      lang={lang}
                      noCurrency={s.ledgerNoCurrency}
                      numberClass="text-xl font-extrabold leading-tight tracking-tight text-ink"
                      codeClass={`text-[11px] font-bold tracking-wide ${line.currency ? 'text-ink-muted' : 'text-warning-text'}`}
                    />
                  ))}
                  {card.notYetSorted > 0 && (
                    <CountChip tone="warning" className="mt-1.5 self-start" data-ledger-not-sorted>
                      {plural(card.notYetSorted, lang, s.ledgerNotYetSorted)}
                    </CountChip>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {cards.empty.length > 0 && (
          <p className="mt-3 text-xs font-medium text-ink-muted" data-ledger-empty-categories>
            {s.ledgerNothingIn.replace('{list}', cards.empty.map(c => categoryLabel(s, c)).join(lang === 'ar' ? '، ' : ', '))}
          </p>
        )}
      </section>

      {/* ── Receipts: one grouped list, not a stack of boxes ── */}
      <section className="mt-8" aria-labelledby="ledger-receipts">
        <div className="flex min-h-[36px] items-center justify-between gap-2">
          <h2 id="ledger-receipts" className="text-[15px] font-bold text-ink">{s.ledgerReceipts}</h2>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              data-ledger-clear-filter
              className="inline-flex min-h-[36px] items-center gap-1 rounded-pill bg-surface-raised px-3 text-xs font-semibold text-ink ring-1 ring-line"
            >
              {s.ledgerShowing.replace('{category}', categoryLabel(s, filter))}
              <X size={14} aria-hidden="true" />
              <span className="sr-only">{s.ledgerShowAll}</span>
            </button>
          )}
        </div>
        <ul className={`mt-3 divide-y divide-divider overflow-hidden ${panelClass}`}>
          {shown.map(r => (
            <li key={r.documentId}>
              <ReceiptRow r={r} lang={lang} s={s} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};

export default LedgerScreen;
