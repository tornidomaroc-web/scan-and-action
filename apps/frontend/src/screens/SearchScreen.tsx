import React, { useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { AnswerCard } from '../components/AnswerCard';
import { ResultTable } from '../components/ResultTable';
import { ClarificationCard } from '../components/ClarificationCard';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ChartPlaceholder, ReportCard } from '../components/SharedComponents';
import { QueryResultDto } from '../types';
import { searchService } from '../services/searchService';
import { reportsService } from '../services/reportsService';

export const SearchScreen = ({ t, rtl, currentLanguage }: any) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submitQuery = async (searchStr: string, mockFilterOverride?: string) => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');

    try {
      const payload = await searchService.executeQuery(searchStr, currentLanguage, mockFilterOverride);
      setResult(payload);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
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
      setErrorMsg(err.message || 'Report loading failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e?.preventDefault();
    submitQuery(query);
  };

  return (
    <div className="screen-container search-screen">
      <div className="search-header-area">
        <SearchBar
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          onSubmit={handleSearchSubmit}
          placeholder={t.search}
          rtl={rtl}
        />
        <div className="suggestions">
          <span>{t.examples}: </span>
          <button className="tag" onClick={() => submitQuery('Total expenses this month', 'short_answer')}>{t.ex1}</button>
          <button className="tag" onClick={() => submitQuery('List my receipts', 'table')}>{t.ex2}</button>
          <button className="tag" onClick={() => submitQuery('Group expenses by category', 'chart')}>{t.ex3}</button>
          <button className="tag" onClick={() => submitQuery('Who paid for ?', 'clarification')}>{t.ex4}</button>
        </div>
      </div>

      <div className="results-container">
        {loading && <div className="loader">{t.loading}...</div>}

        {errorMsg && <ErrorState title={t.errorTitle} message={errorMsg} />}

        {!loading && !errorMsg && result && (
          <div className="result-renderer">
            {result.requiresClarification && <ClarificationCard message={result.answerText || t.clarifyFailed} />}

            {!result.requiresClarification && result.outputFormat === 'short_answer' && (
              <AnswerCard text={result.answerText || ''} meta={result} />
            )}

            {!result.requiresClarification && result.outputFormat === 'table' && (
              <>
                <div className="meta-row">{result.resultCount} {t.resultsFound} • {result.executionTimeMs}{t.msSpeed}</div>
                <ResultTable data={result.data} emptyStateComponent={<EmptyState message={t.noData} />} />
              </>
            )}

            {!result.requiresClarification && result.outputFormat === 'chart_ready_data' && (
              <>
                <div className="meta-row">{t.chartRendered} {result.executionTimeMs}{t.msSpeed}</div>
                <ChartPlaceholder data={result.data} />
              </>
            )}
          </div>
        )}
      </div>

      {!loading && !result && !errorMsg && (
        <div className="smart-reports-section mt-4">
          <h3 style={{ marginBottom: '1rem', color: '#64748b' }}>{t.reports}</h3>
          <div className="reports-grid">
            <ReportCard title={t.rep1} description={t.repDesc1} onClick={() => loadReport('monthly_expenses')} />
            <ReportCard title={t.rep2} description={t.repDesc2} onClick={() => loadReport('recent_cards')} />
            <ReportCard title={t.rep3} description={t.repDesc3} onClick={() => submitQuery('Upcoming appointments', 'table')} />
          </div>
        </div>
      )}
    </div>
  );
};
