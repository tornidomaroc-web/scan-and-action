import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// Search screen restyle (PR-D2) — behavioral + copy guards
// ============================================================================
// Verifies the Search screen after its restyle onto the --sa-* token system:
//   - the hero H1 renders the CLEAN translated string in every locale (the old
//     `split('data')` hack corrupted FR/AR by appending a literal "data"),
//   - the previously-hardcoded English labels are now real i18n keys,
//   - the answer renders ONLY backend data (no fabricated comparison copy),
//   - RTL uses logical CSS properties (no physical left/right in the source),
//   - ErrorState's default title/CTA come from i18n, not hardcoded English,
//   - the row-click read-only navigation and query handlers still work.
// ============================================================================

const h = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock('../src/services/searchService', () => ({
  searchService: { executeQuery: h.executeQuery },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { SearchScreen } from '../src/screens/SearchScreen';
import { ErrorState } from '../src/components/ErrorState';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr' | 'ar' = 'en', element?: React.ReactElement) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/search']}>
          <Routes>
            <Route path="/search" element={element ?? <SearchScreen />} />
            <Route path="/documents/:id" element={<div>DOC-DETAIL-STUB</div>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const text = () => container.textContent ?? '';

// Drives the real primary path: type into the search input and submit the form
// (the suggestion chips are 'populate' mode — they fill the box but do not run).
const runQuery = (q: string) => {
  const input = container.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = container.querySelector('form')!;
  flushSync(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
};

// ── The new i18n keys used by the restyle ─────────────────────────────────
const NEW_KEYS = [
  'aiInsight', 'executiveSummary', 'msProcessing', 'synthesizedFrom',
  'clarificationNeeded', 'resultsTitle', 'findingsLabel', 'msUnit',
  'dataVisualization', 'noChartData', 'noMatchingDataDesc',
  'somethingWrong', 'tryAgain', 'searchFailed', 'autoRunFailed',
] as const;

describe('Search restyle — i18n key parity for the new keys', () => {
  for (const loc of ['en', 'fr', 'ar'] as const) {
    for (const key of NEW_KEYS) {
      it(`strings.${loc}.${key} exists and is non-empty`, () => {
        const v = (strings[loc] as Record<string, unknown>)[key];
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('Search restyle — hero H1 renders cleanly (the split(\'data\') bug is gone)', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => { root.unmount(); container.remove(); });

  it('EN: renders the translated hero string exactly', () => {
    mount('en');
    expect(text()).toContain(strings.en.askAnything);
  });

  it('FR: renders the clean French string with NO stray Latin "data" appended', () => {
    mount('fr');
    expect(text()).toContain(strings.fr.askAnything);
    // The old bug appended a literal English "data" to strings lacking it.
    expect(text()).not.toContain('data');
  });

  it('AR: renders the clean Arabic string with NO stray Latin "data" appended', () => {
    mount('ar');
    expect(text()).toContain(strings.ar.askAnything);
    expect(text()).not.toContain('data');
  });
});

describe('Search restyle — answer + labels come from i18n and real data only', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => { root.unmount(); container.remove(); });

  const ANSWER = 'Your total spend this month is $4,280 across 12 expenses.';

  it('renders the AnswerCard with i18n labels and the verbatim backend answer', async () => {
    h.executeQuery.mockResolvedValue({
      intent: 'total', outputFormat: 'short_answer', requiresClarification: false,
      data: [], resultCount: 12, executionTimeMs: 342, sourceLanguage: 'en',
      answerText: ANSWER,
    });
    mount('en');
    runQuery('total spend');
    await vi.waitFor(() => expect(text()).toContain(ANSWER));
    // Labels are i18n, not the old hardcoded English strings.
    expect(text()).toContain(strings.en.executiveSummary);
    expect(text()).toContain(strings.en.aiInsight);
    expect(text()).toContain(strings.en.synthesizedFrom);
    // NO fabricated comparison copy (the "~8% below your March pace" class of text).
    for (const fake of ['March pace', 'below your', '% below', 'vs last month', 'vs March']) {
      expect(text()).not.toContain(fake);
    }
  });

  it('FR: the AnswerCard labels are French (proves they are wired, not hardcoded English)', async () => {
    h.executeQuery.mockResolvedValue({
      intent: 'total', outputFormat: 'short_answer', requiresClarification: false,
      data: [], resultCount: 3, executionTimeMs: 100, sourceLanguage: 'fr',
      answerText: 'Réponse.',
    });
    mount('fr');
    runQuery('total');
    await vi.waitFor(() => expect(text()).toContain('Réponse.'));
    expect(text()).toContain(strings.fr.executiveSummary);
    expect(text()).not.toContain('Executive Summary');
    expect(text()).not.toContain('AI INSIGHT');
  });

  it('table rows navigate to the document (read-only navigation preserved)', async () => {
    h.executeQuery.mockResolvedValue({
      intent: 'list', outputFormat: 'table', requiresClarification: false,
      data: [{ id: 'doc-42', vendor: 'Aurora', amount: '120' }],
      resultCount: 1, executionTimeMs: 88, sourceLanguage: 'en',
    });
    mount('en');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(text()).toContain('Aurora'));
    const row = [...container.querySelectorAll('tbody tr')][0];
    flushSync(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await vi.waitFor(() => expect(text()).toContain('DOC-DETAIL-STUB'));
  });

  // A rich document row: a long file name, object/array columns, plus several
  // fields that must be DROPPED from the mobile card face (progressive disclosure).
  const LONG_NAME = 'JPEG_20260615_222241_1286235000237534355.jpg';
  const RICH_ROW = {
    id: 'doc-7',
    originalFileName: LONG_NAME,
    documentType: 'UNKNOWN_DOCUMENT_TYPE',
    detectedLanguage: 'ar',
    summary: 'Quarterly retainer invoice.',
    overallConfidence: 0.42,
    status: 'COMPLETED',
    uploadedAt: '2026-07-01T10:00:00Z',
    processedAt: '2026-07-02T11:00:00Z',
    documentEntities: [{ role: 'VENDOR', entity: { canonicalName: 'Aurora Studios' } }],
    facts: [{ key: 'AMOUNT', factType: 'AMOUNT', valueNumber: 4280, currency: 'USD' }],
    notes: null,
  };
  const tableResult = {
    intent: 'list', outputFormat: 'table', requiresClarification: false,
    data: [RICH_ROW], resultCount: 1, executionTimeMs: 50, sourceLanguage: 'en',
  };
  // The mobile card subtree only (scopes assertions away from the desktop table,
  // which still renders every raw column).
  const mobileText = () => (container.querySelector('div.md\\:hidden') as HTMLElement)?.textContent ?? '';

  it('desktop table still formats object/array cells as readable text (never "[object Object]")', async () => {
    h.executeQuery.mockResolvedValue(tableResult);
    mount('en');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(text()).toContain('Aurora Studios'));
    expect(text()).not.toContain('[object Object]');
    // Desktop still shows the raw facts column formatted.
    const desktop = (container.querySelector('div.md\\:block') as HTMLElement).textContent ?? '';
    expect(desktop).toContain('4280');
    expect(desktop).toContain('USD');
  });

  it('mobile card shows ONLY the primary fields (name, vendor, amount, status), not every column', async () => {
    h.executeQuery.mockResolvedValue(tableResult);
    mount('en');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(container.querySelector('div.md\\:hidden button')).toBeTruthy());
    const m = mobileText();
    // Shown primaries:
    expect(m).toContain(LONG_NAME); // title
    expect(m).toContain('Aurora Studios'); // vendor
    expect(m).toContain('4,280'); // amount, currency-formatted
    expect(m).toContain(strings.en.statusProcessed); // translated status
    // Never the raw enum:
    expect(m).not.toContain('COMPLETED');
    expect(m).not.toContain('[object Object]');
    // Dropped fields must NOT appear on the mobile card face:
    expect(m).not.toContain('UNKNOWN_DOCUMENT_TYPE');
    expect(m).not.toContain('Quarterly retainer invoice.'); // summary
    expect(m).not.toContain('0.42'); // confidence
    // One card for one row; desktop table still present (not regressed).
    expect(container.querySelectorAll('div.md\\:hidden > button').length).toBe(1);
    expect(container.querySelector('div.md\\:block table')).toBeTruthy();
  });

  it('mobile card title truncates (never overflows / wraps per character)', async () => {
    h.executeQuery.mockResolvedValue(tableResult);
    mount('en');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(container.querySelector('div.md\\:hidden button')).toBeTruthy());
    const titleEl = [...container.querySelectorAll('div.md\\:hidden button div')].find(
      (el) => el.textContent?.trim() === LONG_NAME
    ) as HTMLElement;
    expect(titleEl).toBeTruthy();
    expect(titleEl.className).toContain('truncate');
  });

  it('AR: mobile card status label is Arabic, not the raw enum', async () => {
    h.executeQuery.mockResolvedValue(tableResult);
    mount('ar');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(container.querySelector('div.md\\:hidden button')).toBeTruthy());
    const m = mobileText();
    expect(m).toContain(strings.ar.statusProcessed);
    expect(m).not.toContain('COMPLETED');
  });

  it('mobile card taps through to the document (read-only navigation preserved)', async () => {
    h.executeQuery.mockResolvedValue(tableResult);
    mount('en');
    runQuery('recent invoices');
    await vi.waitFor(() => expect(container.querySelector('div.md\\:hidden button')).toBeTruthy());
    const card = container.querySelector('div.md\\:hidden > button') as HTMLElement;
    flushSync(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await vi.waitFor(() => expect(text()).toContain('DOC-DETAIL-STUB'));
  });

  it('clarification renders the amber card with the i18n title', async () => {
    h.executeQuery.mockResolvedValue({
      intent: 'ambiguous', outputFormat: 'short_answer', requiresClarification: true,
      data: [], resultCount: 0, executionTimeMs: 40, sourceLanguage: 'en',
      answerText: 'Which month did you mean?',
    });
    mount('en');
    runQuery('total spend');
    await vi.waitFor(() => expect(text()).toContain(strings.en.clarificationNeeded));
    expect(text()).toContain('Which month did you mean?');
  });
});

describe('Search restyle — ErrorState defaults come from i18n', () => {
  afterEach(() => { root.unmount(); container.remove(); });

  it('uses the translated default title + retry label when none is passed', () => {
    mount('en', <ErrorState message="Boom" onRetry={() => {}} />);
    expect(text()).toContain(strings.en.somethingWrong);
    expect(text()).toContain(strings.en.tryAgain);
    // The old hardcoded English casing must be gone.
    expect(text()).not.toContain('Try Again');
  });
});

// ── RTL: source-level guard that physical CSS is gone in favor of logical ──
describe('Search restyle — RTL uses logical properties (source scan)', () => {
  const searchSrc = read('../src/screens/SearchScreen.tsx');
  const tableSrc = read('../src/components/ResultTable.tsx');
  const answerSrc = read('../src/components/AnswerCard.tsx');

  it('SearchScreen input no longer uses physical left/right offsets or padding', () => {
    for (const physical of ['left-6', 'right-20', 'right-4', 'pl-16', 'pr-16', 'border-l-4', 'rounded-r-']) {
      expect(searchSrc).not.toContain(physical);
    }
  });

  it('SearchScreen input uses logical start/end offsets + padding', () => {
    expect(searchSrc).toMatch(/\bstart-/);
    expect(searchSrc).toMatch(/\bend-/);
    expect(searchSrc).toMatch(/\bps-/);
    expect(searchSrc).toMatch(/\bpe-/);
    // The intent strip border is logical.
    expect(searchSrc).toMatch(/border-s|border-s-/);
  });

  it('ResultTable aligns by start (not the physical text-left) and pads logically', () => {
    expect(tableSrc).not.toContain('text-left');
    expect(tableSrc).toMatch(/text-start/);
  });

  it('AnswerCard uses a logical margin (me-*) not the physical mr-1.5', () => {
    expect(answerSrc).not.toContain('mr-1.5');
  });
});

// ============================================================================
// Page-title standardization: all four page h1s share ONE token.
// ============================================================================
// The Search hero title was the lone screen bypassing the type scale (raw
// text-3xl with an lg:text-4xl jump). It now uses `text-title-lg` (24px), the
// same token as Dashboard / Queue / Detail.
//
// This is a PAGE TITLE, not a section heading. SectionHeading renders a 16px
// (text-base) heading; wrapping this h1 in it would SHRINK the title from 24px
// to 16px. The guard below pins that distinction so the trap cannot be walked
// into by a future "consistency" refactor.
describe('Search page title — standardized onto the shared page-title token', () => {
  const searchSrc = read('../src/screens/SearchScreen.tsx');
  const dashSrc = read('../src/screens/DashboardScreen.tsx');
  const queueSrc = read('../src/screens/ReviewQueueScreen.tsx');
  const detailSrc = read('../src/screens/DocumentDetailScreen.tsx');
  const sectionHeadingSrc = read('../src/components/SectionHeading.tsx');

  const PAGE_TITLE = 'text-title-lg font-semibold tracking-tight text-ink';

  it('the Search h1 uses the shared page-title token', () => {
    expect(searchSrc).toContain(`<h1 className="${PAGE_TITLE}">{s.askAnything}</h1>`);
  });

  it('the Search h1 no longer uses a raw size or a responsive size jump', () => {
    expect(searchSrc).not.toContain('text-3xl');
    expect(searchSrc).not.toContain('lg:text-4xl');
  });

  it('all four page h1s share the same token composition', () => {
    for (const src of [searchSrc, dashSrc, queueSrc, detailSrc]) {
      expect(src).toContain(PAGE_TITLE);
    }
  });

  it('no page h1 reintroduces a responsive size jump', () => {
    for (const src of [searchSrc, dashSrc, queueSrc, detailSrc]) {
      expect(src).not.toMatch(/<h1[^>]*\b(sm|md|lg|xl):text-/);
    }
  });

  it('the page title is NOT wrapped in SectionHeading (that would shrink 24px -> 16px)', () => {
    expect(searchSrc).not.toMatch(/<SectionHeading[^>]*>\s*\{s\.askAnything\}/);
    expect(sectionHeadingSrc).toContain('text-base'); // the primitive really is 16px
  });

  it('the empty-state hero (h3) keeps the token it already had, untouched', () => {
    expect(searchSrc).toContain(`<h3 className="${PAGE_TITLE}">{s.askDocs}</h3>`);
  });
});
