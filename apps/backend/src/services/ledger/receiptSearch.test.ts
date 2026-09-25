import { describe, it, expect } from 'vitest';
import { buildLedger, LedgerDocInput, LedgerFactInput } from './ledgerCore';
import { EXPENSE_CATEGORIES } from '../expenseCategories';
import { foldText, RECENT_LIMIT, searchReceipts, SearchDocInput } from './receiptSearch';

// ============================================================================
// A search total is the ledger's total for the same receipts. Proved on the
// ledger's own fixture (ledgerCore.test.ts), copied here so a change to that
// test cannot loosen this one: for every month the fixture touches and every
// category, the search's per-currency lines equal buildLedger's category
// lines, and with no category they equal buildLedger's currency totals. The
// arithmetic is never compared to a hand figure here; it is compared to the
// function the home is built on, which is the claim the screen makes.
// ============================================================================

const SEP_UPLOAD = new Date('2026-09-10T10:00:00Z');

function doc(
  id: string,
  status: string,
  o: {
    total?: number; cur?: string | null; manual?: number; cat?: string; date?: string | null;
    uploadedAt?: string; dup?: boolean; action?: string; merchant?: string; fileName?: string;
  } = {},
): SearchDocInput {
  const f = (key: string, p: Partial<LedgerFactInput>): LedgerFactInput => ({
    key, valueString: null, valueNumber: null, valueDate: null, currency: null, sourceSpan: 'fixture', ...p,
  });
  const facts: LedgerFactInput[] = [];
  if (o.total !== undefined) facts.push(f('TOTAL_AMOUNT', { valueNumber: o.total, currency: o.cur === undefined ? 'MAD' : o.cur }));
  if (o.manual !== undefined) facts.push(f('manual_amount', { valueNumber: o.manual, sourceSpan: 'user_correction' }));
  if (o.cat !== undefined) facts.push(f('category', { valueString: o.cat, sourceSpan: 'extractor' }));
  if (o.date !== undefined) facts.push(f('TRANSACTION_DATE', { valueDate: o.date === null ? null : new Date(`${o.date}T00:00:00Z`) }));
  if (o.dup) facts.push(f('decision_reason', { valueString: 'High food expense, Possible duplicate expense' }));
  if (o.action) facts.push(f('review_action', { valueString: o.action }));
  return {
    id, status,
    uploadedAt: o.uploadedAt ? new Date(o.uploadedAt) : SEP_UPLOAD,
    merchant: o.merchant ?? null,
    fileName: o.fileName ?? `${id}.jpg`,
    facts,
  };
}

const FIXTURE: SearchDocInput[] = [
  doc('d01', 'COMPLETED', { total: 120.5, cat: 'Food', date: '2026-09-03', merchant: 'Marjane' }),
  doc('d02', 'NEEDS_REVIEW', { total: 0.1, cat: 'Food', date: '2026-09-30', merchant: 'Café Résidence' }),
  doc('d03', 'COMPLETED', { total: 0.2, cat: 'Transport', date: '2026-09-01' }),
  doc('d04', 'REJECTED', { total: 999, cat: 'Food', date: '2026-09-10', merchant: 'Marjane' }),
  doc('d05', 'FAILED', { fileName: 'marjane-blurry.jpg' }),
  doc('d06', 'PROCESSING'),
  doc('d07', 'LIMIT_REACHED'),
  doc('d08', 'COMPLETED', { total: 45, cat: 'Food', date: '2026-09-12', dup: true, merchant: 'Marjane' }),
  doc('d09', 'COMPLETED', { total: 45, cat: 'Food', date: '2026-09-12', merchant: 'Marjane' }),
  doc('d10', 'NEEDS_REVIEW', { total: 300, cat: 'Bills', date: '2026-09-12', dup: true, action: 'marked_valid' }),
  doc('d11', 'COMPLETED', { total: 71.11, manual: 85, cat: 'Shopping', date: '2026-09-15', merchant: 'مقهى الأمل' }),
  doc('d12', 'COMPLETED', { total: 60, date: '2026-09-20' }),
  doc('d13', 'COMPLETED', { total: 10, cat: 'Software', date: '2026-09-21' }),
  doc('d14', 'COMPLETED', { total: 500, cat: 'Travel', date: '2026-08-31', merchant: 'Royal Air Maroc' }),
  doc('d15', 'COMPLETED', { total: 70, cat: 'Food', date: '2026-10-01', merchant: 'Marjane' }),
  doc('d16', 'COMPLETED', { cat: 'Food', date: '2026-09-18', merchant: 'Marjane' }),
  doc('d17', 'COMPLETED', { total: 33, cat: 'Food', date: '2026-09-19', dup: true, action: 'note_added' }),
  doc('d18', 'COMPLETED', { total: 25, cat: 'Health', uploadedAt: '2026-08-31T21:00:00Z' }),
  doc('d19', 'COMPLETED', { total: 40, cat: 'Health', date: null, uploadedAt: '2026-09-30T20:30:00Z' }),
  doc('d20', 'COMPLETED', { total: 7, cat: 'Office', date: '2026-09-01', uploadedAt: '2026-10-05T12:00:00Z' }),
  doc('u01', 'COMPLETED', { total: 1000, cur: 'USD', cat: 'Office', date: '2026-09-05', merchant: 'Amazon' }),
  doc('u02', 'NEEDS_REVIEW', { total: 250.25, cur: 'USD', cat: 'Travel', date: '2026-09-06' }),
  doc('u03', 'REJECTED', { total: 5000, cur: 'USD', cat: 'Travel', date: '2026-09-06' }),
  doc('u04', 'COMPLETED', { total: 1000, cur: 'USD', cat: 'Office', date: '2026-09-05', dup: true, merchant: 'Amazon' }),
  doc('u05', 'COMPLETED', { total: 12, manual: 12.345, cur: 'USD', cat: 'Food', date: '2026-09-07', merchant: 'Marjane' }),
  doc('y01', 'COMPLETED', { total: 1, cur: ' eur', cat: 'Food', date: '2026-09-02' }),
  doc('x01', 'COMPLETED', { total: 9999, cur: 'UNKNOWN', cat: 'Food', date: '2026-09-09' }),
  doc('x02', 'COMPLETED', { manual: 15, cat: 'Food', date: '2026-09-10' }),
  doc('x03', 'COMPLETED', { total: 5, cur: null, cat: 'Other', date: '2026-09-11' }),
];
const TZ = 'Asia/Dubai';
const MONTHS = ['2026-08', '2026-09', '2026-10'];
const asLedger = (d: SearchDocInput): LedgerDocInput => d;

describe('a search total is the ledger total for the same receipts', () => {
  for (const month of MONTHS) {
    it(`${month}: with no category, each currency line equals buildLedger's`, () => {
      const ledger = buildLedger(FIXTURE.map(asLedger), month, TZ);
      const search = searchReceipts(FIXTURE, { q: '', category: null, month, timeZone: TZ });
      expect(search.mode).toBe('filtered');
      expect(search.currencies).toEqual(ledger.currencies.map(c => ({ currency: c.currency, total: c.total, receiptCount: c.receiptCount })));
      // The same receipts, in the same order as the home lists them.
      const homeRows = ledger.currencies.flatMap(c => c.receipts.map(r => ({ ...r, currency: c.currency })))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0));
      expect(search.receipts).toEqual(homeRows);
      // What the ledger excluded is exactly what is listed as not counted.
      expect(search.notCounted.length).toBe(ledger.excluded.status + ledger.excluded.duplicate + ledger.excluded.noAmount);
    });

    for (const category of EXPENSE_CATEGORIES) {
      it(`${month} / ${category}: the line equals buildLedger's category line`, () => {
        const ledger = buildLedger(FIXTURE.map(asLedger), month, TZ);
        const search = searchReceipts(FIXTURE, { q: '', category, month, timeZone: TZ });
        const expected = ledger.currencies
          .map(c => ({ currency: c.currency, line: c.categories.find(l => l.category === category)! }))
          .filter(x => x.line.receiptCount > 0)
          .map(x => ({ currency: x.currency, total: x.line.total, receiptCount: x.line.receiptCount }))
          .sort((a, b) => {
            if ((a.currency === null) !== (b.currency === null)) return a.currency === null ? 1 : -1;
            return b.total - a.total || (a.currency ?? '').localeCompare(b.currency ?? '');
          });
        expect(search.currencies).toEqual(expected);
      });
    }
  }

  it('control: the comparison can fail (a receipt dropped from the search changes the line)', () => {
    const ledger = buildLedger(FIXTURE.map(asLedger), '2026-09', TZ);
    const search = searchReceipts(FIXTURE.filter(d => d.id !== 'd01'), { q: '', category: 'Food', month: '2026-09', timeZone: TZ });
    const mad = ledger.currencies.find(c => c.currency === 'MAD')!.categories.find(l => l.category === 'Food')!;
    expect(search.currencies.find(c => c.currency === 'MAD')!.total).not.toBe(mad.total);
  });

  it('a total never mixes currencies: every line is one currency, and the unknown line is last', () => {
    const search = searchReceipts(FIXTURE, { q: '', category: 'Food', month: '2026-09', timeZone: TZ });
    const codes = search.currencies.map(c => c.currency);
    expect(codes).toEqual(['MAD', 'USD', 'EUR', null]); // 165.6 > 12.345 > 1, the unknown line last
    expect(search.currencies.find(c => c.currency === 'MAD')!.total).toBe(165.6);
    expect(search.currencies.find(c => c.currency === 'USD')!.total).toBe(12.345); // the correction, not the 12
    expect(search.currencies.find(c => c.currency === null)!.total).toBe(10014); // 9999 + 15, never folded into MAD
  });
});

describe('the category a not-counted row carries', () => {
  const rows = [
    doc('n1', 'COMPLETED', { total: 30, cat: 'Transport', date: '2026-09-05', dup: true, merchant: 'Tilden Cabs' }),
    doc('n2', 'COMPLETED', { total: 30, cat: 'Other', date: '2026-09-05', dup: true, merchant: 'Tilden Cabs' }),
    doc('n3', 'COMPLETED', { total: 30, cat: 'Groceries', date: '2026-09-05', dup: true, merchant: 'Tilden Cabs' }),
    doc('n4', 'REJECTED', { total: 30, date: '2026-09-05', merchant: 'Tilden Cabs' }),
  ];
  const ask = (category: null | 'Transport' | 'Other') =>
    searchReceipts(rows, { q: 'tilden', category, month: null, timeZone: TZ }).notCounted.map(x => `${x.documentId}:${x.category}`);

  it('is the stored one when it names one of the eight, Other included; none for an off-list value or no fact', () => {
    expect(ask(null)).toEqual(['n1:Transport', 'n2:Other', 'n3:null', 'n4:null']);
  });

  it('the chips still read a missing category as Other, as the ledger does, while the row says none', () => {
    expect(ask('Transport')).toEqual(['n1:Transport']);
    expect(ask('Other')).toEqual(['n2:Other', 'n3:null', 'n4:null']);
  });
});

describe('text: what a query matches, and where', () => {
  it('a merchant word, case- and accent-insensitive, across months, with the not-counted rows apart', () => {
    const r = searchReceipts(FIXTURE, { q: 'MARJANE', category: null, month: null, timeZone: TZ });
    expect(r.mode).toBe('filtered');
    expect(r.receipts.map(x => x.documentId)).toEqual(['d15', 'd09', 'u05', 'd01']);
    expect(r.notCounted.map(x => `${x.documentId}:${x.reason}`)).toEqual(['d16:noAmount', 'd08:duplicate', 'd04:status', 'd05:status']);
    // Each not-counted row carries its own category, the one it would show if
    // it were counted; none when it has none. Until 2026-09-26 the route left
    // it off, and the screen drew every such row as Other.
    expect(r.notCounted.map(x => `${x.documentId}:${x.category}`)).toEqual(['d16:Food', 'd08:Food', 'd04:Food', 'd05:null']);
    // The rejected 999, the duplicate 45 and the unread row add to nothing.
    expect(r.currencies).toEqual([
      { currency: 'MAD', total: 235.5, receiptCount: 3 },
      { currency: 'USD', total: 12.345, receiptCount: 1 },
    ]);
  });

  it('accents and Arabic letter forms fold on both sides', () => {
    expect(foldText('Café Résidence')).toBe('cafe residence');
    expect(foldText('مقهى الأمل')).toBe(foldText('مقهي الامل'));
    expect(searchReceipts(FIXTURE, { q: 'cafe', category: null, month: null, timeZone: TZ }).receipts.map(x => x.documentId)).toEqual(['d02']);
    expect(searchReceipts(FIXTURE, { q: 'مقهي الامل', category: null, month: null, timeZone: TZ }).receipts.map(x => x.documentId)).toEqual(['d11']);
  });

  it('every word must match; the file name counts; a match on nothing is empty, not everything', () => {
    expect(searchReceipts(FIXTURE, { q: 'marjane blurry', category: null, month: null, timeZone: TZ }).receipts).toEqual([]);
    expect(searchReceipts(FIXTURE, { q: 'marjane blurry', category: null, month: null, timeZone: TZ }).notCounted.map(x => x.documentId)).toEqual(['d05']);
    expect(searchReceipts(FIXTURE, { q: 'zzz', category: null, month: null, timeZone: TZ })).toMatchObject({ mode: 'filtered', receipts: [], currencies: [], notCounted: [] });
  });

  it('text, category and month combine', () => {
    const r = searchReceipts(FIXTURE, { q: 'marjane', category: 'Food', month: '2026-10', timeZone: TZ });
    expect(r.receipts.map(x => x.documentId)).toEqual(['d15']);
    expect(r.currencies).toEqual([{ currency: 'MAD', total: 70, receiptCount: 1 }]);
  });
});

describe('recent mode', () => {
  it('with nothing asked: the newest counted receipts, bounded, no totals and nothing not counted', () => {
    const r = searchReceipts(FIXTURE, { q: '  ', category: null, month: null, timeZone: TZ });
    expect(r.mode).toBe('recent');
    expect(r.receipts).toHaveLength(RECENT_LIMIT);
    expect(r.receipts[0].documentId).toBe('d15'); // 2026-10-01, the newest
    expect(r.currencies).toEqual([]);
    expect(r.notCounted).toEqual([]);
  });

  it('rejects what the ledger rejects', () => {
    expect(() => searchReceipts(FIXTURE, { q: '', category: null, month: '2026-13', timeZone: TZ })).toThrow(/invalid month/);
    expect(() => searchReceipts(FIXTURE, { q: '', category: null, month: null, timeZone: 'Mars/Olympus' })).toThrow(/invalid time zone/);
    expect(() => searchReceipts(FIXTURE, { q: '', category: 'Groceries' as any, month: null, timeZone: TZ })).toThrow(/invalid category/);
  });
});
