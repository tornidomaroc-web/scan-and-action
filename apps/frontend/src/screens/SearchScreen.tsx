import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Receipt, Search as SearchIcon, X } from 'lucide-react';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { ErrorState } from '../components/ErrorState';
import { CATEGORY_FILL, CategoryIcon } from '../components/ui/CategoryIcon';
import { CountChip } from '../components/ui/CountChip';
import { IconTile } from '../components/ui/IconTile';
import { Money } from '../components/ui/Money';
import { Panel, panelClass } from '../components/ui/Panel';
import { ReceiptRow } from '../components/ui/ReceiptRow';
import { wornCategory } from '../lib/documentCategory';
import { isIdentityConflict } from '../lib/identityConflict';
import { isRequestTimeout } from '../lib/fetchWithTimeout';
import { isConnectionFailure } from '../lib/requestErrors';
import { searchService } from '../services/searchService';
import { LEDGER_CATEGORIES, type LedgerCategory } from '../lib/ledgerTypes';
import type { NotCountedHit, SearchParams, SearchResult } from '../lib/searchTypes';
import { Lang, currentMonth, dayLabel, deviceTimeZone, isMonth, monthTitle, plural, shiftMonth } from '../lib/ledgerView';

// ============================================================================
// Search: find a receipt, and know what was spent on what you found.
// Redrawn from zero on 2026-09-25 (WORK-QUEUE step 6) after the owner
// rejected the ask-a-question screen. Three controls and one list:
//
//   the field      a merchant or a file name, matched as you type;
//   the chips      the eight categories, one at a time, or all;
//   the month      one month, stepped like the home, or every month;
//   the rows       the same rows as the home (components/ui/ReceiptRow).
//
// With nothing asked it shows the newest receipts. With anything asked it
// shows the whole match and, above it, what those receipts add up to, one
// line per currency: the figures are GET /api/search's, computed by the
// ledger's own rule (ledgerCore.judge), so they equal what the home would
// say for the same receipts. Nothing here adds an amount, and nothing
// compares amounts of different currencies (ledgerNoCrossCurrencySum.test.ts
// scans this file). Receipts the ledger does not count (rejected, possible
// duplicate, no amount) are still found, listed apart, and add to nothing.
// There is no Pro or payment surface on this screen, on any platform.
// ============================================================================

type Strings = ReturnType<typeof useStrings>;
const DEBOUNCE_MS = 250;

const categoryLabel = (s: Strings, c: LedgerCategory) => s[`cat${c}` as const];

const readCategory = (v: string | null): LedgerCategory | null =>
  (LEDGER_CATEGORIES as readonly string[]).includes(v ?? '') ? (v as LedgerCategory) : null;

export const SearchScreen: React.FC = () => {
  const s = useStrings();
  const { language } = useLanguage();
  const lang = language as Lang;
  const timeZone = useMemo(deviceTimeZone, []);
  const thisMonth = useMemo(() => currentMonth(timeZone), [timeZone]);
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL holds the search, so the back button and a reload keep it.
  const requestedMonth = searchParams.get('month');
  const params: SearchParams = useMemo(() => ({
    q: searchParams.get('q') ?? '',
    category: readCategory(searchParams.get('category')),
    month: isMonth(requestedMonth) && requestedMonth <= thisMonth ? requestedMonth : null,
  }), [searchParams, requestedMonth, thisMonth]);

  const [typed, setTyped] = useState(params.q);
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const setParams = useCallback((next: Partial<SearchParams>) => {
    const merged = { ...params, ...next };
    const sp = new URLSearchParams();
    if (merged.q.trim()) sp.set('q', merged.q.trim());
    if (merged.category) sp.set('category', merged.category);
    if (merged.month) sp.set('month', merged.month);
    setSearchParams(sp, { replace: true });
  }, [params, setSearchParams]);

  // Typing settles into the URL after a pause, so one request per thought,
  // not per keystroke.
  useEffect(() => {
    if (typed.trim() === params.q.trim()) return;
    const t = setTimeout(() => setParams({ q: typed }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed, params.q, setParams]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const result = await searchService.searchReceipts(params, timeZone);
      if (id !== requestId.current) return; // a newer search was asked for
      setData(result);
      setError(null);
      setLocked(false);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('[Search] Search failed:', err);
      const lockedNow = isIdentityConflict(err);
      setLocked(lockedNow);
      // "Connection interrupted" only when no response arrived. A status
      // (404, 401, 500) came over a working connection and says so
      // (lib/requestErrors.ts).
      const connection = isConnectionFailure(err);
      setConnectionLost(connection);
      setError(lockedNow ? s.accountLockedBody
        : isRequestTimeout(err) ? s.requestTimedOut
        : connection ? s.searchNetworkError
        : s.searchFailedBody);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [params, timeZone, s]);

  useEffect(() => { void load(); }, [load]);

  const clearText = () => {
    setTyped('');
    setParams({ q: '' });
    inputRef.current?.focus();
  };

  const filtered = !!(params.q.trim() || params.category || params.month);
  const loading = !data && !error;
  const monthLabel = params.month ? monthTitle(params.month, lang) : s.searchAllMonths;
  const navButton = 'flex h-11 w-11 flex-none items-center justify-center rounded-pill bg-surface-raised text-ink-secondary ring-1 ring-line transition-colors hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="mx-auto w-full max-w-xl pb-6" data-search-screen>
      <h1 className="sr-only">{s.searchTitle}</h1>

      {/* ── The field ── */}
      <form role="search" onSubmit={e => { e.preventDefault(); setParams({ q: typed }); }} className="relative">
        <label htmlFor="search-q" className="sr-only">{s.searchPlaceholder}</label>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-ink-faint">
          <SearchIcon size={20} strokeWidth={2.25} />
        </span>
        <input
          ref={inputRef}
          id="search-q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={s.searchPlaceholder}
          data-search-input
          className="h-12 w-full rounded-pill bg-surface-raised ps-12 pe-12 text-[16px] font-medium text-ink shadow-card ring-1 ring-line outline-none transition-shadow placeholder:text-ink-faint focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {typed && (
          <button
            type="button"
            onClick={clearText}
            aria-label={s.searchClear}
            data-search-clear
            className="absolute inset-y-0 end-1 flex w-11 items-center justify-center text-ink-muted hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </form>

      {/* ── The chips: one category, or all ── */}
      <div role="group" aria-label={s.categoryLabel} className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        <Chip on={params.category === null} onClick={() => setParams({ category: null })} data-search-category="all" className="bg-ink text-surface-raised">
          {s.searchAllCategories}
        </Chip>
        {LEDGER_CATEGORIES.map(c => (
          <Chip key={c} on={params.category === c} onClick={() => setParams({ category: params.category === c ? null : c })} data-search-category={c} className={`${CATEGORY_FILL[c]} text-white`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-pill ${params.category === c ? 'border-2 border-current opacity-80' : CATEGORY_FILL[c]}`} />
            {categoryLabel(s, c)}
          </Chip>
        ))}
      </div>

      {/* ── The month: one, stepped like the home, or every month ── */}
      <div className="mt-3 flex items-center gap-2" role="group" aria-label={s.searchMonthLabel}>
        <button
          type="button"
          onClick={() => setParams({ month: shiftMonth(params.month ?? thisMonth, params.month ? -1 : 0) })}
          aria-label={s.ledgerPrevMonth}
          data-search-prev
          className={navButton}
        >
          <ChevronLeft size={20} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
        <span data-search-month className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-pill bg-surface-raised px-3 text-[15px] font-bold text-ink ring-1 ring-line" aria-live="polite">
          <span className="truncate">{monthLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => setParams({ month: shiftMonth(params.month!, 1) })}
          aria-label={s.ledgerNextMonth}
          disabled={!params.month || params.month >= thisMonth}
          data-search-next
          className={navButton}
        >
          <ChevronRight size={20} className="rtl:-scale-x-100" aria-hidden="true" />
        </button>
        {params.month && (
          <button type="button" onClick={() => setParams({ month: null })} data-search-all-months className={`${navButton} w-auto px-3 text-xs font-semibold`}>
            {s.searchAllMonths}
          </button>
        )}
      </div>

      {loading && <SearchSkeleton label={s.searchLoading} />}

      {error && !data && (
        <div className="mt-6">
          <ErrorState
            title={locked ? s.accountLockedTitle : connectionLost ? s.connectionError : s.searchFailedTitle}
            message={error}
            onRetry={locked ? undefined : () => void load()}
          />
        </div>
      )}

      {data && (
        <div aria-busy={busy} data-search-results>
          {data.mode === 'recent' && <Recent data={data} s={s} lang={lang} />}
          {data.mode === 'filtered' && (
            <Filtered
              data={data}
              s={s}
              lang={lang}
              params={params}
              onAllMonths={() => setParams({ month: null })}
              onClear={() => { setTyped(''); setParams({ q: '', category: null, month: null }); }}
            />
          )}
        </div>
      )}
    </div>
  );
};

const Chip: React.FC<{ on: boolean; onClick: () => void; className: string; children: React.ReactNode } & Record<string, unknown>> = ({
  on, onClick, className, children, ...rest
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    {...rest}
    className={`inline-flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-pill px-3.5 text-[13px] font-semibold transition-colors active:scale-95 ${
      on ? className : 'bg-surface-raised text-ink-secondary ring-1 ring-line'
    }`}
  >
    {children}
  </button>
);

const SearchSkeleton: React.FC<{ label: string }> = ({ label }) => (
  <div className="mt-6 animate-pulse" aria-busy="true" aria-label={label} data-search-loading>
    <div className="h-3.5 w-32 rounded-pill bg-line" />
    <div className={`mt-3 divide-y divide-divider overflow-hidden ${panelClass}`}>
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-16" />)}
    </div>
  </div>
);

const Rows: React.FC<{ data: SearchResult; s: Strings; lang: Lang }> = ({ data, s, lang }) => (
  <ul className={`mt-3 divide-y divide-divider overflow-hidden ${panelClass}`}>
    {data.receipts.map(r => <li key={r.documentId}><ReceiptRow r={r} lang={lang} s={s} /></li>)}
  </ul>
);

const Recent: React.FC<{ data: SearchResult; s: Strings; lang: Lang }> = ({ data, s, lang }) => (
  <section className="mt-6" aria-labelledby="search-recent" data-search-recent>
    <h2 id="search-recent" className="text-[15px] font-bold text-ink">{s.searchRecent}</h2>
    {data.receipts.length > 0 ? (
      <Rows data={data} s={s} lang={lang} />
    ) : (
      <Panel className="mt-3 p-8 text-center" data-search-empty>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-tile bg-accent text-on-accent">
          <Receipt size={26} aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-[17px] font-bold text-ink">{s.searchEmptyTitle}</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-secondary">{s.searchEmptyBody}</p>
      </Panel>
    )}
  </section>
);

const Filtered: React.FC<{
  data: SearchResult; s: Strings; lang: Lang; params: SearchParams; onAllMonths: () => void; onClear: () => void;
}> = ({ data, s, lang, params, onAllMonths, onClear }) => {
  const nothing = data.receipts.length === 0 && data.notCounted.length === 0;
  // What the figure is for, in the reader's words: the category, the month
  // and the typed text, whichever were asked.
  const scope = [
    params.category ? categoryLabel(s, params.category) : null,
    params.month ? monthTitle(params.month, lang) : s.searchAllMonths,
    params.q.trim() ? `“${params.q.trim()}”` : null,
  ].filter(Boolean).join(' · ');

  if (nothing) {
    return (
      <Panel className="mt-6 p-8 text-center" data-search-none>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-tile bg-surface-muted text-ink-secondary">
          <SearchIcon size={26} aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-[17px] font-bold text-ink">{s.searchNoResultsTitle}</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-secondary">{s.searchNoResultsBody.replace('{scope}', scope)}</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          {params.month && (
            <button type="button" onClick={onAllMonths} data-search-try-all className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-6 text-sm font-bold text-on-accent shadow-card transition-all hover:bg-accent-hover active:scale-95">
              {s.searchTryAllMonths}
            </button>
          )}
          <button type="button" onClick={onClear} data-search-clear-all className="min-h-[44px] px-3 text-sm font-semibold text-accent-text">
            {s.searchClearFilters}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <>
      {data.receipts.length > 0 && (
        <section className="mt-6" aria-labelledby="search-total">
          <Panel className="p-4" data-search-total>
            <p id="search-total" className="text-sm font-semibold text-ink-secondary">{s.searchTotalHeading}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-ink-muted" data-search-scope>{scope}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {data.currencies.map(c => (
                <li key={c.currency ?? 'none'} data-search-currency={c.currency ?? 'none'} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Money
                    amount={c.total}
                    currency={c.currency}
                    lang={lang}
                    noCurrency={s.ledgerNoCurrency}
                    numberClass={`text-[28px] font-extrabold leading-none tracking-tight ${c.currency ? 'text-ink' : 'text-ink-secondary'}`}
                    codeClass={`text-sm font-bold tracking-wide ${c.currency ? 'text-ink-muted' : 'text-warning-text'}`}
                  />
                  <CountChip>{plural(c.receiptCount, lang, s.ledgerReceiptCount)}</CountChip>
                </li>
              ))}
            </ul>
            {data.currencies.length > 1 && (
              <p className="mt-2 text-xs font-medium text-ink-muted" data-search-separate>{s.ledgerSeparateCurrencies}</p>
            )}
          </Panel>
          <Rows data={data} s={s} lang={lang} />
        </section>
      )}

      {data.notCounted.length > 0 && (
        <section className="mt-6" aria-labelledby="search-not-counted" data-search-not-counted>
          <h2 id="search-not-counted" className="text-[15px] font-bold text-ink">{s.searchNotCounted}</h2>
          <p className="mt-0.5 text-xs font-medium text-ink-muted">{s.searchNotCountedBody}</p>
          <ul className={`mt-3 divide-y divide-divider overflow-hidden ${panelClass}`}>
            {data.notCounted.map(h => <li key={h.documentId}><NotCountedRow h={h} s={s} lang={lang} /></li>)}
          </ul>
        </section>
      )}
    </>
  );
};

const REASON_KEY = { status: 'searchReasonStatus', duplicate: 'searchReasonDuplicate', noAmount: 'searchReasonNoAmount' } as const;

const NotCountedRow: React.FC<{ h: NotCountedHit; s: Strings; lang: Lang }> = ({ h, s, lang }) => (
  <Link to={`/documents/${h.documentId}`} data-search-not-counted-row={h.documentId} className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-alt active:bg-surface-alt">
    {/* Its own category's tile, as it would wear if counted. None, the
        backend's fallback Other, or a backend that does not send one yet, gets
        the neutral tile: never Other, which reads as a category the receipt
        does not have (lib/documentCategory). */}
    {wornCategory(h.category) ? <CategoryIcon category={wornCategory(h.category)!} size="sm" /> : <IconTile icon={FileText} tone="neutral" size="sm" />}
    <span className="min-w-0 flex-1">
      <span dir="auto" className={`block truncate text-[15px] font-semibold ${h.merchant ? 'text-ink' : 'text-ink-secondary'}`}>
        {h.merchant ?? h.fileName ?? s.ledgerUnknownVendor}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-ink-muted">
        <span>{dayLabel(h.date, lang)}</span>
        <CountChip tone="warning">{s[REASON_KEY[h.reason]]}</CountChip>
      </span>
    </span>
    <ChevronRight size={18} className="flex-none text-ink-faint rtl:-scale-x-100" aria-hidden="true" />
  </Link>
);

export default SearchScreen;
