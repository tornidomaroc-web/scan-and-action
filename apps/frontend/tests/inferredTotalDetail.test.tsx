import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// A total the page never printed, on the receipt screen, in three languages.
// ============================================================================
// The rule engine writes "Total not printed" (backend totalProvenance.ts). The
// screen turns it into a sentence in the reader's language, keeps the figure
// at the top as the amount the ledger counts, and offers the amount field so
// the printed total can be typed, as for "Missing amount".
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { translateDecisionReasons } from '../src/components/DecisionBanner';
import { moneyParts } from '../src/lib/ledgerView';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
let container: HTMLDivElement;
let root: Root;

const INFERRED = {
  id: 'd1', originalFileName: 'scan-20260930-234345.jpg', documentType: 'RECEIPT', overallConfidence: 0.795, uploadedAt: '2026-09-30T23:43:45Z',
  status: 'NEEDS_REVIEW', signedFileUrl: 'https://storage.example/signed/scan.jpg?token=x', reextractable: false, reprocessed: null,
  entities: [{ role: 'VENDOR', displayName: 'Corner Hardware' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'Corner Hardware' } }],
  facts: [
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 54.5, currency: 'USD', confidence: 0.6 },
    { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-09-30T00:00:00.000Z', confidence: 0.99 },
    { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Total not printed' },
  ],
};

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); document.documentElement.dir = 'ltr'; vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); });

async function mount(lang: Lang, doc: any) {
  h.getDocumentDetail.mockResolvedValue(doc);
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider><ToastProvider>
        <MemoryRouter initialEntries={[`/documents/${doc.id}`]}>
          <Routes><Route path="/documents/:id" element={<DocumentDetailScreen />} /></Routes>
        </MemoryRouter>
      </ToastProvider></LanguageProvider>
    );
  });
  await vi.waitFor(() => expect(container.querySelector('[data-detail-header]')).toBeTruthy());
}

describe('"Total not printed" on the receipt screen', () => {
  it.each(LANGS)('%s: the sentence in the reader\'s language, the draft figure at the top, the amount field to fix it', async (lang) => {
    await mount(lang, INFERRED);
    const s = strings[lang];
    const issues = container.querySelector('[data-detail-issues]')!;
    expect(issues.textContent).toContain(s.reasonTotalNotPrinted);
    expect(issues.textContent).not.toContain('Total not printed');
    expect(issues.textContent).not.toContain(s.reasonMissingAmount);
    // the figure stays: it is what the ledger counts until it is corrected
    expect(container.querySelector('[data-detail-amount]')!.textContent).toBe(moneyParts(54.5, 'USD', lang).number);
    expect(container.textContent).not.toContain(s.detailNoAmount);
    // the fix is the same field "Missing amount" gets
    expect(container.querySelector('#fix-amount')).toBeTruthy();
    expect(container.querySelector('[data-detail-actions]')).toBeTruthy();
  });

  it('the reason translates in every locale and the three sentences differ', () => {
    const out = LANGS.map((lang) => translateDecisionReasons('Total not printed', strings[lang] as any, lang));
    LANGS.forEach((lang, i) => expect(out[i]).toBe(strings[lang].reasonTotalNotPrinted));
    expect(new Set(out).size).toBe(3);
    // combined with another reason, both translate and the list separator is the locale's
    expect(translateDecisionReasons('Total not printed, Possible duplicate expense', strings.ar as any, 'ar'))
      .toBe(`${strings.ar.reasonTotalNotPrinted}، ${strings.ar.reasonPossibleDuplicateExpense}`);
  });

  it('the control: a printed total with no reason shows no sentence and no field', async () => {
    await mount('en', { ...INFERRED, status: 'COMPLETED', facts: [
      { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 58.86, currency: 'USD', confidence: 0.99 },
      { key: 'decision', valueString: 'APPROVED' },
    ] });
    expect(container.querySelector('[data-detail-issues]')).toBeNull();
    expect(container.querySelector('#fix-amount')).toBeNull();
    expect(container.querySelector('[data-detail-amount]')!.textContent).toBe('58.86');
  });
});
