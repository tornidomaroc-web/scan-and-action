import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// A file the single-document check refused says so, in three languages.
// ============================================================================
// Two receipts in one PDF (the owner's iPhone, build 15) came back as "Unknown
// vendor", "No amount read" and "The reading was uncertain": the refusal left
// the stub a status and nothing else. The backend now writes the reason
// (persistence.ts MULTIPLE_DOCUMENTS_REASON); the screen turns it into the
// sentence that says what happened and what to do, with no amount field and
// no retry (the server's `reextractable` is false for this shape).
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

type Lang = 'en' | 'fr' | 'ar';
let container: HTMLDivElement;
let root: Root;

// The refused stub as the detail route serves it: UNKNOWN type, no content,
// status and the two decision facts, nothing else.
const REFUSED = {
  id: 'm1', originalFileName: 'scan-20261004-023429.pdf', documentType: 'UNKNOWN', overallConfidence: 0, uploadedAt: '2026-10-04T02:34:29Z',
  processedAt: '2026-10-04T02:34:40Z', status: 'NEEDS_REVIEW', signedFileUrl: 'https://storage.example/signed/scan.pdf?token=x', reextractable: false, reprocessed: null,
  entities: [], documentEntities: [],
  facts: [{ key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Multiple documents' }],
};

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); document.documentElement.dir = 'ltr'; vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
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

describe('"Multiple documents" on the receipt screen', () => {
  it.each<Lang>(['en', 'fr', 'ar'])('%s: the sentence, no "uncertain", no amount field, no retry', async (lang) => {
    await mount(lang, REFUSED);
    const s = strings[lang];
    const issues = container.querySelector('[data-detail-issues]')!;
    expect(issues.textContent).toContain(s.reasonMultipleDocuments);
    expect(issues.textContent).not.toContain('Multiple documents');
    expect(issues.textContent).not.toContain(s.expenseAttention);
    expect(container.querySelector('#fix-amount')).toBeNull();
    expect(container.textContent).not.toContain(s.retryExtraction);
    // the person can still settle it: Reject is there
    expect(container.querySelector('[data-detail-actions]')).toBeTruthy();
  });

  it('the control: the same stub with NO reason still says "uncertain", as before this change', async () => {
    await mount('en', { ...REFUSED, facts: [] });
    expect(container.querySelector('[data-detail-issues]')!.textContent).toContain(strings.en.expenseAttention);
  });

  it('the three sentences differ', () => {
    expect(new Set([strings.en.reasonMultipleDocuments, strings.fr.reasonMultipleDocuments, strings.ar.reasonMultipleDocuments]).size).toBe(3);
  });
});
