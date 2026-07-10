import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search as SearchIcon,
  Sparkles,
  ArrowRight,
  X,
  History,
  TrendingUp,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { AnswerCard } from '../components/AnswerCard';
import { ResultTable } from '../components/ResultTable';
import { ClarificationCard } from '../components/ClarificationCard';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ChartPlaceholder, ReportCard } from '../components/SharedComponents';
import { QueryResultDto } from '../types';
import { searchService } from '../services/searchService';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';

interface SearchPrompt {
  id: string;
  label: string;
  display: string;
  query: string;
  description?: string;
  mode: 'autorun' | 'populate';
  icon: React.ReactNode;
}

export const SearchScreen = () => {
  const s = useStrings();
  // The active UI language drives the search API language too. This previously
  // came from App's never-updated state, so the API always got 'en'.
  const { language: currentLanguage } = useLanguage();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submitQuery = async (searchStr: string) => {
    if (!searchStr.trim()) return false;
    setLoading(true);
    setResult(null);
    setErrorMsg('');

    try {
      const payload = await searchService.executeQuery(searchStr, currentLanguage);
      setResult(payload);
      return true;
    } catch (err: any) {
      setErrorMsg(s.searchFailed);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e?.preventDefault();
    submitQuery(query);
  };

  // UNIFIED PROMPT HANDLER (single source of truth for all shortcuts).
  const handlePromptClick = async (prompt: SearchPrompt) => {
    setQuery(prompt.display);
    setErrorMsg('');

    // Always maintain focus for immediate manual correction.
    inputRef.current?.focus();

    if (prompt.mode === 'autorun') {
      const success = await submitQuery(prompt.query);
      if (!success) {
        setErrorMsg(s.autoRunFailed);
      }
    }
  };

  const suggestionPrompts: SearchPrompt[] = [
    { id: 'spend', label: s.totalSpend, display: s.totalSpendQuery, query: 'What is my total spend this month?', mode: 'populate', icon: <TrendingUp size={14} /> },
    { id: 'invoices', label: s.recentInvoices, display: s.recentInvoicesQuery, query: 'Show my recent invoices', mode: 'populate', icon: <FileText size={14} /> },
    { id: 'categories', label: s.expensesByCategory, display: s.expensesByCategoryQuery, query: 'Analyze expenses by category', mode: 'populate', icon: <History size={14} /> },
  ];

  const galleryPrompts: SearchPrompt[] = [
    { id: 'monthly', label: s.monthlySpending, display: s.monthlySpendingQuery, description: s.monthlySpendingDesc, query: 'Summarize monthly spending across vendors', mode: 'populate', icon: <TrendingUp size={20} /> },
    { id: 'recent', label: s.recentActivity, display: s.recentActivityQuery, description: s.recentActivityDesc, query: 'Show recent document activity', mode: 'autorun', icon: <FileText size={20} /> },
    { id: 'atrisk', label: s.atRiskAssets, display: s.atRiskAssetsQuery, description: s.atRiskAssetsDesc, query: 'Identify high-risk audits needing review', mode: 'populate', icon: <ShieldAlert size={20} /> },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 animate-in fade-in duration-500">
      {/* Hero search experience */}
      <div className={`transition-all duration-500 ease-in-out ${result || loading ? 'mb-10' : 'mb-12 mt-16'}`}>
        <div className="mb-6 text-center">
          <p className="mb-2 text-[13px] font-semibold text-accent-text">{s.intelligentSearch}</p>
          {/* Render the translated headline cleanly. (The old split('data')
              highlight trick appended a literal English "data", corrupting the
              FR/AR strings.) */}
          {/* Page title uses the shared `text-title-lg` (24px) token, matching the
              Dashboard / Queue / Detail h1s. NOT a SectionHeading: that primitive
              renders 16px section-level headings and would shrink this title. */}
          <h1 className="text-title-lg font-semibold tracking-tight text-ink">{s.askAnything}</h1>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative mx-auto max-w-3xl">
          <div className="relative flex items-center">
            <div className="pointer-events-none absolute start-4 text-ink-faint">
              <SearchIcon size={20} />
            </div>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="w-full rounded-card border border-line bg-surface-raised py-4 ps-12 pe-24 text-base text-ink shadow-card outline-none transition-all placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute end-14 p-2 text-ink-faint transition-colors hover:text-ink"
                aria-label={s.tryAgain}
              >
                <X size={18} />
              </button>
            )}
            <button
              type="submit"
              className={`absolute end-2 flex items-center justify-center rounded-btn p-2.5 transition-colors ${
                query.trim()
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-surface-muted text-ink-faint'
              }`}
              aria-label={s.intelligentSearch}
            >
              <ArrowRight size={20} className="rtl:-scale-x-100" />
            </button>
          </div>
        </form>

        {/* Suggestion chips */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {suggestionPrompts.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePromptClick(p)}
              className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-secondary shadow-card transition-colors hover:border-line-strong hover:text-ink"
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main experience area */}
      <div className="min-h-[500px]">
        {loading && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Answer card skeleton */}
            <div className="rounded-card border border-line bg-surface-raised p-6 shadow-card">
              <div className="flex items-center gap-4">
                <div className="skeleton h-10 w-10 rounded-btn" />
                <div className="skeleton h-4 w-40 rounded" />
              </div>
              <div className="skeleton mt-5 h-5 w-full rounded" />
              <div className="skeleton mt-3 h-5 w-2/3 rounded" />
            </div>

            {/* Table skeleton */}
            <div className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-card">
              <div className="h-12 border-b border-divider bg-surface-alt" />
              <div className="space-y-4 p-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-6">
                    <div className="skeleton h-4 w-1/4 rounded" />
                    <div className="skeleton h-4 w-1/4 rounded" />
                    <div className="skeleton h-4 w-1/4 rounded" />
                    <div className="skeleton h-4 w-1/4 rounded" />
                  </div>
                ))}
              </div>
            </div>

            <p className="pt-2 text-center text-sm font-medium text-ink-muted">{s.analyzingDocs}</p>
          </div>
        )}

        {errorMsg && <ErrorState message={errorMsg} onRetry={() => submitQuery(query)} />}

        {!loading && !errorMsg && result && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Persistent intent confirmation */}
            {result.explanation && (
              <div className="flex items-center gap-2 rounded-e-card border-s-4 border-accent bg-surface-alt px-4 py-3">
                <Sparkles size={16} className="flex-shrink-0 text-accent" />
                <p className="text-sm text-ink-secondary">{result.explanation}</p>
              </div>
            )}

            {result.requiresClarification && (
              <div className="mx-auto max-w-2xl">
                <ClarificationCard message={result.answerText || s.clarifyFailed} />
              </div>
            )}

            {!result.requiresClarification && (
              <>
                {/* Layer A: AI answer card */}
                {result.outputFormat === 'short_answer' && result.answerText && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AnswerCard text={result.answerText} meta={result} />
                  </div>
                )}

                {/* Layer B: data table */}
                {(result.outputFormat === 'table' || (result.outputFormat === 'short_answer' && result.data?.length > 0)) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-accent" />
                        <h3 className="text-[13px] font-semibold text-ink-tertiary">{s.resultsTitle}</h3>
                      </div>
                      <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
                        {result.resultCount} {s.findingsLabel} &middot; {result.executionTimeMs} {s.msUnit}
                      </span>
                    </div>
                    {/* Card chrome is desktop-only: on mobile the ResultTable
                        renders its own stacked cards, so we avoid a card-in-card. */}
                    <div className="md:overflow-hidden md:rounded-card md:border md:border-line md:bg-surface-raised md:shadow-card">
                      <ResultTable
                        data={result.data?.map(({ organizationId, userId, fileUrl, rawText, normalizedText, ...rest }: any) => rest)}
                        onRowClick={(row) => row.id && navigate(`/documents/${row.id}`)}
                        emptyStateComponent={
                          <EmptyState message={s.noMatchingData} description={s.noMatchingDataDesc}>
                            <div className="mx-auto mt-5 flex max-w-sm flex-wrap justify-center gap-2">
                              {suggestionPrompts.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => handlePromptClick(p)}
                                  className="rounded-pill border border-line bg-surface-raised px-3.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </EmptyState>
                        }
                      />
                    </div>
                  </div>
                )}

                {result.outputFormat === 'chart_ready_data' && (
                  <div className="rounded-card border border-line bg-surface-raised p-6 shadow-card">
                    <ChartPlaceholder data={result.data} />
                  </div>
                )}

                {/* Trust footer */}
                <div className="border-t border-divider pt-8">
                  <p className="flex items-center justify-center gap-2 text-xs font-medium text-ink-muted">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-accent" />
                    {s.poweredBy}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && !result && !errorMsg && (
          <div className="py-12 text-center animate-in fade-in duration-500">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-card border border-line bg-surface-raised text-accent shadow-card">
              <Sparkles size={28} />
            </div>
            <h3 className="text-title-lg font-semibold tracking-tight text-ink">{s.askDocs}</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{s.workspaceIndexed}</p>

            <div className="mx-auto mt-10 max-w-4xl">
              <div className="mb-4 flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-ink-tertiary">{s.insightsGallery}</span>
                <button
                  onClick={() => handlePromptClick({ id: 'browse', label: s.browseAll, display: s.browseAllQuery, query: 'Explore all intelligence reports', mode: 'populate', icon: <ArrowRight size={14} /> })}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent-text transition-opacity hover:opacity-80"
                >
                  {s.browseAll}
                  <ArrowRight size={14} className="rtl:-scale-x-100" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {galleryPrompts.map((p) => (
                  <ReportCard
                    key={p.id}
                    title={p.label}
                    description={p.description || ''}
                    icon={p.icon}
                    onClick={() => handlePromptClick(p)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
