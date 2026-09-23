import { describe, it, expect } from 'vitest';
import { buildLedger, LedgerDocInput, LedgerFactInput } from './ledgerCore';

// ============================================================================
// A HAND-COMPUTED MONTH. Every expected figure below was worked out by hand and
// written here before buildLedger was first run; the assertions are exact
// equality on the whole response, not a tolerance and not a subset.
//
// Month 2026-09, caller time zone Asia/Dubai (UTC+4, no daylight saving, so the
// fallback arithmetic is certain). Four currency lines: USD, MAD, EUR and the
// UNKNOWN line. Every status the code writes appears: COMPLETED, NEEDS_REVIEW,
// REJECTED, FAILED, PROCESSING, LIMIT_REACHED. Duplicates: flagged and not
// kept (d08, u04), flagged with a note but not kept (d17), flagged and kept
// (d10), and the unflagged twin that stays (d09).
//
// Worked totals:
//   MAD  d01 120.5 + d02 0.1 + d03 0.2 + d09 45 + d10 300 + d11 85 (corrected
//        from 71.11) + d12 60 + d13 10 + d18 25 + d20 7            = 652.8
//        Food 120.5+0.1+45 = 165.6 | Bills 300 | Shopping 85 |
//        Other 60+10 = 70 (both uncategorized) | Health 25 | Office 7 |
//        Transport 0.2 | Travel 0                         sum = 652.8
//   USD  u01 1000 + u02 250.25 + u05 12.345 (corrected from 12)   = 1262.595
//   EUR  y01 1 (stored as ' eur')                                 = 1
//   ???  x01 9999 ('UNKNOWN') + x02 15 (correction, no extracted total)
//        + x03 5 (null)                                           = 10019
//   Order: USD 1262.595 > MAD 652.8 > EUR 1, then the unknown line LAST
//   although it is the largest. MAD has the most receipts and is still second.
//   Excluded in September: status d04 d05 d06 d07 u03 = 5; duplicate d08 d17
//   u04 = 3; no amount d16 = 1.
//   Not in September at all: d14 (printed 2026-08-31), d15 (printed
//   2026-10-01), d19 (undated, uploaded 2026-09-30T20:30Z = 2026-10-01 in Dubai).
// ============================================================================

const SEP_UPLOAD = new Date('2026-09-10T10:00:00Z');

function doc(
  id: string,
  status: string,
  o: {
    total?: number;
    cur?: string | null;
    manual?: number;
    cat?: string;
    date?: string | null; // printed date; null = a TRANSACTION_DATE fact with no value
    uploadedAt?: string;
    dup?: boolean;
    action?: string;
    merchant?: string;
  } = {},
): LedgerDocInput {
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
    id,
    status,
    uploadedAt: o.uploadedAt ? new Date(o.uploadedAt) : SEP_UPLOAD,
    merchant: o.merchant ?? null,
    facts,
  };
}

const FIXTURE: LedgerDocInput[] = [
  // ---- MAD
  doc('d01', 'COMPLETED', { total: 120.5, cat: 'Food', date: '2026-09-03', merchant: 'Marjane' }),
  doc('d02', 'NEEDS_REVIEW', { total: 0.1, cat: 'Food', date: '2026-09-30' }),
  doc('d03', 'COMPLETED', { total: 0.2, cat: 'Transport', date: '2026-09-01' }),
  doc('d04', 'REJECTED', { total: 999, cat: 'Food', date: '2026-09-10' }),
  doc('d05', 'FAILED'),
  doc('d06', 'PROCESSING'),
  doc('d07', 'LIMIT_REACHED'),
  doc('d08', 'COMPLETED', { total: 45, cat: 'Food', date: '2026-09-12', dup: true }),
  doc('d09', 'COMPLETED', { total: 45, cat: 'Food', date: '2026-09-12' }),
  doc('d10', 'NEEDS_REVIEW', { total: 300, cat: 'Bills', date: '2026-09-12', dup: true, action: 'marked_valid' }),
  doc('d11', 'COMPLETED', { total: 71.11, manual: 85, cat: 'Shopping', date: '2026-09-15' }),
  doc('d12', 'COMPLETED', { total: 60, date: '2026-09-20' }),
  doc('d13', 'COMPLETED', { total: 10, cat: 'Software', date: '2026-09-21' }),
  doc('d14', 'COMPLETED', { total: 500, cat: 'Travel', date: '2026-08-31' }),
  doc('d15', 'COMPLETED', { total: 70, cat: 'Food', date: '2026-10-01' }),
  doc('d16', 'COMPLETED', { cat: 'Food', date: '2026-09-18' }),
  doc('d17', 'COMPLETED', { total: 33, cat: 'Food', date: '2026-09-19', dup: true, action: 'note_added' }),
  doc('d18', 'COMPLETED', { total: 25, cat: 'Health', uploadedAt: '2026-08-31T21:00:00Z' }),
  doc('d19', 'COMPLETED', { total: 40, cat: 'Health', date: null, uploadedAt: '2026-09-30T20:30:00Z' }),
  doc('d20', 'COMPLETED', { total: 7, cat: 'Office', date: '2026-09-01', uploadedAt: '2026-10-05T12:00:00Z' }),
  // ---- USD
  doc('u01', 'COMPLETED', { total: 1000, cur: 'USD', cat: 'Office', date: '2026-09-05' }),
  doc('u02', 'NEEDS_REVIEW', { total: 250.25, cur: 'USD', cat: 'Travel', date: '2026-09-06' }),
  doc('u03', 'REJECTED', { total: 5000, cur: 'USD', cat: 'Travel', date: '2026-09-06' }),
  doc('u04', 'COMPLETED', { total: 1000, cur: 'USD', cat: 'Office', date: '2026-09-05', dup: true }),
  doc('u05', 'COMPLETED', { total: 12, manual: 12.345, cur: 'USD', cat: 'Food', date: '2026-09-07' }),
  // ---- EUR, stored in the wrong case with a space
  doc('y01', 'COMPLETED', { total: 1, cur: ' eur', cat: 'Food', date: '2026-09-02' }),
  // ---- no usable currency
  doc('x01', 'COMPLETED', { total: 9999, cur: 'UNKNOWN', cat: 'Food', date: '2026-09-09' }),
  doc('x02', 'COMPLETED', { manual: 15, cat: 'Food', date: '2026-09-10' }),
  doc('x03', 'COMPLETED', { total: 5, cur: null, cat: 'Other', date: '2026-09-11' }),
];

const r = (
  documentId: string, date: string, amount: number, category: string | null,
  extra: { dateSource?: 'document' | 'uploaded'; amountSource?: 'extracted' | 'corrected'; status?: string; merchant?: string | null } = {},
) => ({
  documentId, date, dateSource: extra.dateSource ?? 'document', amount,
  amountSource: extra.amountSource ?? 'extracted', category, merchant: extra.merchant ?? null,
  status: extra.status ?? 'COMPLETED',
});
const c = (category: string, total: number, receiptCount: number) => ({ category, total, receiptCount });

const EXPECTED_SEPTEMBER_DUBAI = {
  month: '2026-09',
  timeZone: 'Asia/Dubai',
  currencies: [
    {
      currency: 'USD',
      total: 1262.595,
      receiptCount: 3,
      uncategorizedCount: 0,
      categories: [
        c('Office', 1000, 1), c('Travel', 250.25, 1), c('Food', 12.345, 1),
        c('Transport', 0, 0), c('Shopping', 0, 0), c('Health', 0, 0), c('Bills', 0, 0), c('Other', 0, 0),
      ],
      receipts: [
        r('u05', '2026-09-07', 12.345, 'Food', { amountSource: 'corrected' }),
        r('u02', '2026-09-06', 250.25, 'Travel', { status: 'NEEDS_REVIEW' }),
        r('u01', '2026-09-05', 1000, 'Office'),
      ],
    },
    {
      currency: 'MAD',
      total: 652.8,
      receiptCount: 10,
      uncategorizedCount: 2,
      categories: [
        c('Bills', 300, 1), c('Food', 165.6, 3), c('Shopping', 85, 1), c('Other', 70, 2),
        c('Health', 25, 1), c('Office', 7, 1), c('Transport', 0.2, 1), c('Travel', 0, 0),
      ],
      receipts: [
        r('d02', '2026-09-30', 0.1, 'Food', { status: 'NEEDS_REVIEW' }),
        r('d13', '2026-09-21', 10, null),
        r('d12', '2026-09-20', 60, null),
        r('d11', '2026-09-15', 85, 'Shopping', { amountSource: 'corrected' }),
        r('d09', '2026-09-12', 45, 'Food'),
        r('d10', '2026-09-12', 300, 'Bills', { status: 'NEEDS_REVIEW' }),
        r('d01', '2026-09-03', 120.5, 'Food', { merchant: 'Marjane' }),
        r('d03', '2026-09-01', 0.2, 'Transport'),
        r('d18', '2026-09-01', 25, 'Health', { dateSource: 'uploaded' }),
        r('d20', '2026-09-01', 7, 'Office'),
      ],
    },
    {
      currency: 'EUR',
      total: 1,
      receiptCount: 1,
      uncategorizedCount: 0,
      categories: [
        c('Food', 1, 1), c('Transport', 0, 0), c('Travel', 0, 0), c('Shopping', 0, 0),
        c('Health', 0, 0), c('Bills', 0, 0), c('Office', 0, 0), c('Other', 0, 0),
      ],
      receipts: [r('y01', '2026-09-02', 1, 'Food')],
    },
    {
      currency: null,
      total: 10019,
      receiptCount: 3,
      uncategorizedCount: 0,
      categories: [
        c('Food', 10014, 2), c('Other', 5, 1), c('Transport', 0, 0), c('Travel', 0, 0),
        c('Shopping', 0, 0), c('Health', 0, 0), c('Bills', 0, 0), c('Office', 0, 0),
      ],
      receipts: [
        r('x03', '2026-09-11', 5, 'Other'),
        r('x02', '2026-09-10', 15, 'Food', { amountSource: 'corrected' }),
        r('x01', '2026-09-09', 9999, 'Food'),
      ],
    },
  ],
  excluded: { status: 5, duplicate: 3, noAmount: 1 },
};

describe('the month ledger against a hand-computed fixture', () => {
  it('September in Asia/Dubai equals the hand-computed ledger exactly', () => {
    expect(buildLedger(FIXTURE, '2026-09', 'Asia/Dubai')).toEqual(EXPECTED_SEPTEMBER_DUBAI);
  });

  it('is independent of the order the database returns rows in', () => {
    expect(buildLedger([...FIXTURE].reverse(), '2026-09', 'Asia/Dubai')).toEqual(EXPECTED_SEPTEMBER_DUBAI);
  });

  it('the time zone moves only the undated rows: in UTC d18 leaves September and d19 joins it', () => {
    const utc = buildLedger(FIXTURE, '2026-09', 'UTC');
    const mad = utc.currencies.find(x => x.currency === 'MAD')!;
    // By hand: 652.8 - 25 (d18, uploaded 2026-08-31T21:00Z, is August in UTC)
    // + 40 (d19, uploaded 2026-09-30T20:30Z, is September in UTC) = 667.8.
    // The first hand figure written here was 627.8: it forgot d19, and this
    // assertion is what caught it. The code was right; the arithmetic was not.
    expect(mad.total).toBe(667.8);
    expect(mad.receipts.map(x => x.documentId)).not.toContain('d18');
    expect(mad.receipts.find(x => x.documentId === 'd19')).toEqual(r('d19', '2026-09-30', 40, 'Health', { dateSource: 'uploaded' }));
    // d20 is printed 2026-09-01 and uploaded in October: the printed date holds in every zone.
    expect(mad.receipts.map(x => x.documentId)).toContain('d20');
    expect(utc.currencies.map(x => x.total)).toEqual([1262.595, 667.8, 1, 10019]);
  });

  it('October picks up the rows September left out, and nothing counted twice', () => {
    const oct = buildLedger(FIXTURE, '2026-10', 'Asia/Dubai');
    // d15 printed 2026-10-01 (70) and d19 undated, uploaded 2026-10-01 in Dubai (40): 110 by hand.
    expect(oct.currencies).toHaveLength(1);
    expect(oct.currencies[0].currency).toBe('MAD');
    expect(oct.currencies[0].total).toBe(110);
    expect(oct.currencies[0].receipts.map(x => [x.documentId, x.dateSource])).toEqual([['d15', 'document'], ['d19', 'uploaded']]);
  });

  it('an empty month is empty, not an error', () => {
    expect(buildLedger(FIXTURE, '2025-01', 'UTC')).toEqual({
      month: '2025-01', timeZone: 'UTC', currencies: [], excluded: { status: 0, duplicate: 0, noAmount: 0 },
    });
  });

  it('refuses a malformed month and an unknown time zone', () => {
    expect(() => buildLedger(FIXTURE, '2026-13', 'UTC')).toThrow('invalid month');
    expect(() => buildLedger(FIXTURE, '2026-9', 'UTC')).toThrow('invalid month');
    expect(() => buildLedger(FIXTURE, '2026-09', 'Mars/Olympus')).toThrow('invalid time zone');
  });
});
