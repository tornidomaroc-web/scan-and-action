import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// The receipt screen, redrawn (design step 3, 2026-09-25): what a person sees
// first, what is gone, and what needs them, in three languages.
// ============================================================================

const h = vi.hoisted(() => ({ getDocumentDetail: vi.fn(), updateStatus: vi.fn(), reextract: vi.fn(), applyFixAction: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/services/documentService', () => ({ documentService: h }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
let container: HTMLDivElement;
let root: Root;

const base = {
  id: 'd1', originalFileName: 'bim-maroc.jpg', documentType: 'RECEIPT', overallConfidence: 0.83, uploadedAt: '2026-09-22T09:14:00Z',
  signedFileUrl: 'https://storage.example/signed/bim.jpg?token=x', reextractable: false, reprocessed: false,
  entities: [{ role: 'VENDOR', displayName: 'BIM MAROC' }], documentEntities: [{ role: 'VENDOR', entity: { displayName: 'BIM MAROC' } }],
};
const FLAGGED = { ...base, status: 'NEEDS_REVIEW', facts: [
  { key: 'category', factType: 'CATEGORY', valueString: 'Food', confidence: 0.99 },
  { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 467.85, currency: 'MAD', confidence: 0.99 },
  { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-09-21T00:00:00.000Z', confidence: 0.99 },
  { key: 'decision', valueString: 'FLAGGED' }, { key: 'decision_reason', valueString: 'High food expense, Possible duplicate expense' },
] };
const CORRECTED = { ...base, id: 'd2', originalFileName: 'marjane.jpg', status: 'COMPLETED', facts: [
  { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 698.35, currency: 'MAD', confidence: 0.99 },
  { key: 'manual_amount', factType: 'AMOUNT', valueNumber: 689.35 },
  { key: 'decision', valueString: 'APPROVED' },
] };
const UNDATED_NO_AMOUNT = { ...base, id: 'd3', originalFileName: 'pharmacie.jpg', status: 'NEEDS_REVIEW', documentEntities: [], entities: [], facts: [
  { key: 'decision', valueString: 'NEEDS_REVIEW' }, { key: 'decision_reason', valueString: 'Missing amount' },
] };

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); document.documentElement.dir = 'ltr'; vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); });

function mount(lang: Lang, doc: any) {
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
}
const text = () => container.textContent ?? '';
const q = (sel: string) => container.querySelector(sel);
const qa = (sel: string) => [...container.querySelectorAll(sel)];
const settled = (name: string) => vi.waitFor(() => expect(text()).toContain(name));

describe('who, how much, when, one status', () => {
  for (const lang of LANGS) {
    it(`${lang}: merchant as the title, category tile and name, the receipt's own date, the ledger amount, ONE status`, async () => {
      mount(lang, FLAGGED);
      await settled('BIM MAROC');
      const h1 = q('h1')!;
      expect(h1.textContent).toBe('BIM MAROC');
      expect(h1.getAttribute('dir')).toBe('auto');
      expect(h1.textContent).not.toContain('.jpg');
      expect(q('[data-category-icon="Food"]')).not.toBeNull();
      const meta = q('[data-detail-meta]')!.textContent!;
      expect(meta).toContain(strings[lang].catFood);
      expect(meta).toContain(strings[lang].docTypeReceipt);
      expect(meta).toMatch(/21/); // the date printed on the receipt
      expect(meta).not.toMatch(/22/); // never the upload day when a date was read
      expect(q('[data-detail-amount]')!.textContent).toBe(lang === 'fr' ? '467,85' : '467.85');
      expect(q('[data-detail-amount]')!.getAttribute('dir')).toBe('ltr');
      expect(q('[data-detail-header]')!.textContent).toContain('MAD');
      // Exactly one status on the whole screen.
      expect(qa('[data-detail-status]')).toHaveLength(1);
      expect(q('[data-detail-status]')!.textContent).toBe(strings[lang].needsReview);
      expect(text().split(strings[lang].needsReview).length - 1).toBe(1);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      expect(text()).not.toMatch(/[٠-٩۰-۹]/);
    });
  }

  it('Approve and Reject are fixed to the viewport, above the tab bar and the safe area', async () => {
    mount('en', FLAGGED);
    await settled('BIM MAROC');
    const bar = q('[data-detail-actions]')!;
    expect(bar.className).toContain('fixed');
    expect(bar.className).toContain('safe-area-inset-bottom');
    expect(bar.className).not.toContain('sticky');
    expect([...bar.querySelectorAll('button')].map(b => b.textContent)).toEqual([strings.en.approve, strings.en.reject]);
  });

  it('an uncorrected flagged receipt shows its total once: at the top, not as a row', async () => {
    mount('en', FLAGGED);
    await settled('BIM MAROC');
    expect(q('[data-detail-amount]')!.textContent).toBe('467.85');
    expect(q('[data-detail-facts]')!.textContent).not.toContain(strings.en.totalAmount);
    expect(q('[data-detail-facts]')!.textContent).not.toContain('467.85');
  });

  it('a corrected receipt shows the correction, its currency, and an Edited mark; never the extraction', async () => {
    mount('en', CORRECTED);
    await settled('BIM MAROC');
    expect(q('[data-detail-amount]')!.textContent).toBe('689.35');
    expect(q('[data-detail-header]')!.textContent).toContain('MAD');
    expect(q('[data-detail-edited]')!.textContent).toBe(strings.en.ledgerCorrectedTag);
    expect(q('[data-detail-header]')!.textContent).not.toContain('698');
    expect(q('[data-detail-status]')!.textContent).toBe(strings.en.statusProcessed);
    // Approved and nothing to do: no issues card, no "no issues" claim.
    expect(q('[data-detail-issues]')).toBeNull();
    expect(text()).not.toContain(strings.en.decisionApprovedDesc);
    expect(text()).not.toContain(strings.en.statusApproved);
  });

  it('no amount read, no date read, no merchant: each is said plainly, nothing invented', async () => {
    mount('en', UNDATED_NO_AMOUNT);
    await settled(strings.en.detailNoAmount);
    expect(q('[data-detail-amount]')).toBeNull();
    expect(q('h1')!.textContent).toBe(strings.en.ledgerUnknownVendor);
    expect(q('[data-detail-meta]')!.textContent).toContain(strings.en.ledgerNoDate.split('{day}')[0].trim());
    expect(q('[data-detail-meta]')!.textContent).toMatch(/22/); // the upload day, labelled as such
  });
});

describe('what is gone', () => {
  it('no "Verified" claim, no confidence percentage, no per-fact match label, no relationships section', async () => {
    mount('en', FLAGGED);
    await settled('BIM MAROC');
    expect(text()).not.toContain(strings.en.verifiedExtraction);
    expect(text()).not.toContain('83%');
    expect(text()).not.toContain('99%');
    expect(text()).not.toContain(strings.en.match);
    expect(text()).not.toContain(strings.en.graphRelationships);
    expect(text()).not.toContain(strings.en.entityRoleVendor);
    expect(text()).not.toContain(strings.en.excellent);
    expect(text()).not.toContain(strings.en.findingsRationale);
    expect(text()).not.toContain(strings.en.reviewActionRequired);
    expect(text()).not.toContain(strings.en.sourceVisualization);
    expect(text()).not.toContain(strings.en.extractedFacts);
  });
});

describe('what needs the person', () => {
  for (const lang of LANGS) {
    it(`${lang}: a flagged receipt lists the reasons as sentences, in the reader's language, with the fix actions inside the same card`, async () => {
      mount(lang, FLAGGED);
      await settled('BIM MAROC');
      const card = q('[data-detail-issues]')!;
      expect(card.textContent).toContain(strings[lang].detailNeedsYou);
      expect(card.textContent).toContain(strings[lang].decisionFlaggedDesc);
      expect(card.textContent).toContain(strings[lang].reasonHighFoodExpense);
      expect(card.textContent).toContain(strings[lang].reasonPossibleDuplicateExpense);
      if (lang !== 'en') expect(card.textContent).not.toContain('High food expense');
      expect(card.querySelector('[data-fix-actions]')).not.toBeNull();
      expect(card.querySelector('textarea')).not.toBeNull();
      expect([...card.querySelectorAll('button')].map(b => b.textContent)).toEqual(expect.arrayContaining([strings[lang].fixMarkValid, strings[lang].fixSaveNote]));
    });
  }

  it('a missing amount asks for it in the document\'s own currency, and the retry sits in the card only when the server allows it', async () => {
    mount('en', { ...UNDATED_NO_AMOUNT, reextractable: true, facts: [...UNDATED_NO_AMOUNT.facts, { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: null, currency: 'EUR' }] });
    await settled(strings.en.detailNoAmount);
    const card = q('[data-detail-issues]')!;
    expect(card.textContent).toContain(strings.en.reasonMissingAmount);
    expect(card.querySelector('input[type="number"]')).not.toBeNull();
    expect(card.querySelector('[data-fix-actions]')!.textContent).toContain('EUR');
    expect(card.querySelector('[data-fix-actions]')!.textContent).not.toContain('MAD');
    expect([...card.querySelectorAll('button')].some(b => b.textContent?.includes(strings.en.retryExtraction))).toBe(true);
  });

  it('the fix actions still write what they wrote: the same action names and payloads', async () => {
    h.applyFixAction.mockResolvedValue({});
    mount('en', FLAGGED);
    await settled('BIM MAROC');
    const ta = q('textarea') as HTMLTextAreaElement;
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Team lunch');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    flushSync(() => { ([...container.querySelectorAll('button')].find(b => b.textContent === strings.en.fixMarkValid) as HTMLButtonElement).click(); });
    await vi.waitFor(() => expect(h.applyFixAction).toHaveBeenCalledWith('d1', 'marked_valid', { justification: 'Team lunch' }));
  });
});

describe('the receipt and the facts', () => {
  it('the image is a card that opens the original on tap; the facts are rows with the file name last and no confidence', async () => {
    mount('en', CORRECTED);
    await settled('BIM MAROC');
    const link = q('[data-detail-receipt] a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(CORRECTED.signedFileUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.querySelector('img')).not.toBeNull();
    const rows = qa('[data-detail-facts] li').map(li => li.textContent);
    // The correction is the figure at the top; the extracted total is a row;
    // the file name is the last row, labelled as a file.
    expect(rows[0]).toContain(strings.en.totalAmount);
    expect(rows[0]).toContain('698.35');
    expect(rows.some(r => r!.includes(strings.en.correctedAmount))).toBe(false);
    expect(rows[rows.length - 1]).toContain(strings.en.fileNameLabel);
    expect(rows[rows.length - 1]).toContain('marjane.jpg');
    expect(rows[rows.length - 1]).not.toContain(strings.en.nameLabel);
    expect(q('[data-detail-facts]')!.textContent).not.toContain('%');
    // The preview is a fixed-height crop, not the full image inline.
    expect(q('[data-detail-image]')!.className).toContain('h-44');
    expect(link.querySelector('img')!.className).toContain('object-cover');
  });
});
