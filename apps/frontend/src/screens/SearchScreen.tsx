import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search as SearchIcon, 
  Loader2, 
  Sparkles, 
  SlidersHorizontal, 
  ArrowRight, 
  Info, 
  X,
  History,
  TrendingUp,
  FileText,
  ShieldAlert
} from 'lucide-react';
import { AnswerCard } from '../components/AnswerCard';
import { ResultTable } from '../components/ResultTable';
import { ClarificationCard } from '../components/ClarificationCard';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ChartPlaceholder, ReportCard } from '../components/SharedComponents';
import { QueryResultDto } from '../types';
import { searchService } from '../services/searchService';
import { reportsService } from '../services/reportsService';

interface SearchPrompt {
  id: string;
  label: string;
  query: string;
  description?: string;
  mode: 'autorun' | 'populate';
  icon: React.ReactNode;
}

export const SearchScreen = ({ t, rtl, currentLanguage }: any) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submitQuery = async (searchStr: string, mockFilterOverride?: string) => {
    if (!searchStr.trim()) return false;
    setLoading(true);
    setResult(null);
    setErrorMsg('');

    try {
      const payload = await searchService.executeQuery(searchStr, currentLanguage, mockFilterOverride);
      setResult(payload);
      return true;
    } catch (err: any) {
      setErrorMsg('This search could not be completed. Try rephrasing your question or checking your documents.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (reportId: string) => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');
    try {
      const payload = await reportsService.loadReport(reportId, currentLanguage);
      setResult(payload);
    } catch (err: any) {
      setErrorMsg('The report could not be loaded at this time.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e?.preventDefault();
    submitQuery(query);
  };

  // UNIFIED PROMPT HANDLER (Single source of truth for all shortcuts)
  const handlePromptClick = async (prompt: SearchPrompt) => {
    setQuery(prompt.query);
    setErrorMsg('');
    
    // Always maintain focus for immediate manual correction
    inputRef.current?.focus();

    if (prompt.mode === 'autorun') {
      const success = await submitQuery(prompt.query);
      if (!success) {
        // Safe fallback logic for automated failures
        setErrorMsg("We couldn't run this automatically. Press search to continue.");
      }
    }
  };

  const suggestionPrompts: SearchPrompt[] = [
    { id: 'spend', label: 'Total spend this month', query: 'What is my total spend this month?', mode: 'populate', icon: <TrendingUp size={14} /> },
    { id: 'invoices', label: 'Recent invoices', query: 'Show my recent invoices', mode: 'populate', icon: <FileText size={14} /> },
    { id: 'categories', label: 'Expenses by category', query: 'Analyze expenses by category', mode: 'populate', icon: <History size={14} /> }
  ];

  const galleryPrompts: SearchPrompt[] = [
    { id: 'monthly', label: 'Monthly Spending', description: 'Analyze trends across all vendors', query: 'Summarize monthly spending across vendors', mode: 'populate', icon: <TrendingUp size={24} /> },
    { id: 'recent', label: 'Recent Activity', description: 'View latest document extractions', query: 'Show recent document activity', mode: 'autorun', icon: <FileText size={24} /> },
    { id: 'atrisk', label: 'At Risk Assets', description: 'Identify audits needing review', query: 'Identify high-risk audits needing review', mode: 'populate', icon: <ShieldAlert size={24} /> }
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-in fade-in duration-700">
      {/* Hero Search Experience */}
      <div className={`transition-all duration-700 ease-in-out ${result || loading ? 'mb-12' : 'mt-20 mb-16'}`}>
        <div className="text-center mb-8">
          <p className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-[0.2em] text-[10px] mb-3">
            Intelligent Document Search
          </p>
          <h1 className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            Ask anything about your <span className="text-blue-600 dark:text-blue-500 italic">data</span>
          </h1>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative max-w-3xl mx-auto group">
          <div className="absolute inset-0 bg-blue-500/10 blur-2xl group-focus-within:bg-blue-500/20 transition-all rounded-[32px]" />
          <div className="relative flex items-center">
            <div className="absolute left-6 text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <SearchIcon size={24} strokeWidth={2.5} />
            </div>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "What is my total spend this month?"'
              className="w-full pl-16 pr-16 py-6 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-[28px] text-xl font-bold text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 shadow-xl shadow-slate-200/50 dark:shadow-none outline-none transition-all"
            />
            {query && (
              <button 
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-20 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} strokeWidth={3} />
              </button>
            )}
            <button 
              type="submit"
              className={`absolute right-4 p-3 rounded-2xl transition-all shadow-lg active:scale-95 ${
                query.trim() 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 hover:brightness-110 ring-4 ring-blue-500/10' 
                  : 'bg-slate-900 dark:bg-slate-800 text-slate-400'
              }`}
            >
              <ArrowRight size={24} strokeWidth={2.5} />
            </button>
          </div>
        </form>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          {suggestionPrompts.map((p) => (
            <button 
              key={p.id}
              onClick={() => handlePromptClick(p)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-bold text-slate-600 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all shadow-sm active:scale-95"
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Experience Area */}
      <div className="results-min-height min-h-[500px]">
        {loading && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Answer Card Skeleton */}
            <div className="card h-40 bg-white dark:bg-slate-800 border-none shadow-sm flex flex-col justify-center gap-4 px-10">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 skeleton rounded-xl dark:bg-slate-700" />
                  <div className="h-4 w-32 skeleton rounded dark:bg-slate-700" />
               </div>
               <div className="h-6 w-full skeleton rounded dark:bg-slate-700" />
               <div className="h-6 w-2/3 skeleton rounded dark:bg-slate-700" />
            </div>
            
            {/* Result Table Skeleton */}
            <div className="card p-0 overflow-hidden dark:bg-slate-800 border-none shadow-sm">
               <div className="h-12 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700" />
               <div className="p-8 space-y-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-6">
                      <div className="h-4 w-1/4 skeleton rounded dark:bg-slate-700" />
                      <div className="h-4 w-1/4 skeleton rounded dark:bg-slate-700" />
                      <div className="h-4 w-1/4 skeleton rounded dark:bg-slate-700" />
                      <div className="h-4 w-1/4 skeleton rounded dark:bg-slate-700" />
                    </div>
                  ))}
               </div>
            </div>

            <div className="text-center pt-8">
              <p className="text-slate-400 dark:text-slate-500 font-black text-sm uppercase tracking-widest animate-pulse">
                 Analyzing your document library...
              </p>
            </div>
          </div>
        )}

        {errorMsg && <ErrorState message={errorMsg} onRetry={() => submitQuery(query)} />}

        {!loading && !errorMsg && result && (
          <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
            {/* Persistent Intent Confirmation */}
            {result.explanation && (
              <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 dark:bg-slate-900/40 border-l-4 border-blue-500 rounded-r-2xl animate-in fade-in slide-in-from-left-4 duration-700">
                <Sparkles size={16} className="text-blue-500 drop-shadow-sm" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tracking-tight">
                  {result.explanation}
                </p>
              </div>
            )}

            {result.requiresClarification && (
              <div className="max-w-2xl mx-auto">
                 <ClarificationCard message={result.answerText || t.clarifyFailed} />
              </div>
            )}

            {!result.requiresClarification && (
              <>
                {/* Layer A: AI Answer Card */}
                {result.outputFormat === 'short_answer' && result.answerText && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <AnswerCard text={result.answerText} meta={result} />
                  </div>
                )}

                {/* Layer B: Data Display */}
                {(result.outputFormat === 'table' || (result.outputFormat === 'short_answer' && result.data?.length > 0)) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                       <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <SlidersHorizontal size={14} /> 
                          Raw Data Engine
                       </h3>
                       <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                          {result.resultCount} findings • {result.executionTimeMs}ms
                       </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm">
                      <ResultTable 
                        data={result.data?.map(({ organizationId, userId, fileUrl, rawText, normalizedText, ...rest }: any) => rest)} 
                        onRowClick={(row) => row.id && navigate(`/documents/${row.id}`)}
                        emptyStateComponent={
                          <div className="py-20 text-center">
                            <EmptyState 
                              message="No matching data found." 
                              description="Try adjusting your filters or search terms. Your workspace might not have documents covering this specific query yet."
                            >
                              <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm mx-auto">
                                {suggestionPrompts.map(p => (
                                  <button key={p.id} onClick={() => handlePromptClick(p)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-blue-500 hover:text-white transition-all">
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </EmptyState>
                          </div>
                        }
                      />
                    </div>
                  </div>
                )}

                {result.outputFormat === 'chart_ready_data' && (
                  <div className="card dark:bg-slate-800 dark:border-slate-700 rounded-[32px] overflow-hidden p-8 border border-slate-100 dark:border-slate-700">
                    <ChartPlaceholder data={result.data} />
                  </div>
                )}

                {/* Trust Footer */}
                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 px-4">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3">
                    <Info size={14} className="text-blue-500" />
                    Powered by extracted document intelligence
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && !result && !errorMsg && (
          <div className="mt-12 text-center py-20 animate-in fade-in duration-1000">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-slate-100 dark:border-slate-700">
               <Sparkles size={40} className="text-blue-500/50" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 italic tracking-tight">Ask anything about your documents</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-bold mb-12">
               Your workspace is fully indexed. Query by date, vendor, or category.
            </p>
            
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8 px-2">
                <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Workspace Insights Gallery</span>
                <button 
                  onClick={() => handlePromptClick({ id: 'browse', label: 'Browse All', query: 'Explore all intelligence reports', mode: 'populate', icon: <ArrowRight size={14} /> })}
                  className="text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  Browse All <ArrowRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {galleryPrompts.map((p) => (
                  <ReportCard 
                    key={p.id}
                    title={p.label} 
                    description={p.description || ''} 
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
