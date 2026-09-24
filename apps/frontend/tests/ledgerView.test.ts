import { describe, it, expect } from 'vitest';
import {
  categoryCards, currentMonth, figureSizeClass, moneyParts, monthTitle, receiptRows, shiftMonth,
} from '../src/lib/ledgerView';
import type { LedgerMonth } from '../src/lib/ledgerTypes';

const CATS = ['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other'] as const;
const lines = (m: Partial<Record<(typeof CATS)[number], [number, number]>>) =>
  CATS.map(c => ({ category: c, total: m[c]?.[0] ?? 0, receiptCount: m[c]?.[1] ?? 0 }));

describe('the category list cannot drift from the backend\'s', () => {
  it('LEDGER_CATEGORIES equals EXPENSE_CATEGORIES in apps/backend, in order', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { LEDGER_CATEGORIES } = await import('../src/lib/ledgerTypes');
    const src = readFileSync(join(process.cwd(), '../backend/src/services/expenseCategories.ts'), 'utf8');
    const m = /export const EXPENSE_CATEGORIES = \[([^\]]+)\] as const/.exec(src);
    expect(m, 'EXPENSE_CATEGORIES declaration not found').toBeTruthy();
    const backend = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    expect([...LEDGER_CATEGORIES]).toEqual(backend);
  });
});

describe('months', () => {
  it('shifts across year boundaries both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-05', -17)).toBe('2024-12');
  });

  it('reads the current month in the caller\'s zone, not in UTC', () => {
    const instant = new Date('2026-06-30T23:30:00Z');
    expect(currentMonth('UTC', instant)).toBe('2026-06');
    expect(currentMonth('Africa/Casablanca', instant)).toBe('2026-07'); // UTC+1
    expect(currentMonth('America/Los_Angeles', instant)).toBe('2026-06');
  });

  it('titles the month in each language', () => {
    expect(monthTitle('2026-05', 'en')).toBe('May 2026');
    expect(monthTitle('2026-05', 'fr')).toBe('mai 2026');
    expect(monthTitle('2026-05', 'ar')).toMatch(/2026/);
  });
});

describe('money', () => {
  it('shows the ISO code, never a symbol, because a bare $ is ambiguous', () => {
    expect(moneyParts(7282.31, 'CAD', 'en')).toMatchObject({ number: '7,282.31', code: 'CAD' });
    expect(moneyParts(7282.31, 'CAD', 'en').number).not.toContain('$');
  });

  it('names the currency in the reader\'s language', () => {
    expect(moneyParts(1, 'MAD', 'en').name).toBe('Moroccan Dirham');
    expect(moneyParts(1, 'MAD', 'fr').name?.toLowerCase()).toContain('dirham');
  });

  it('an unknown currency gets a plain number and no code', () => {
    expect(moneyParts(16.5, null, 'en')).toEqual({ number: '16.50', code: null, name: null });
  });

  it('keeps each currency\'s own precision', () => {
    expect(moneyParts(12.345, 'KWD', 'en').number).toBe('12.345');
    expect(moneyParts(1500, 'JPY', 'en').number).toBe('1,500');
  });

  it('steps a long figure down in size instead of cutting it', () => {
    expect(figureSizeClass('7,282.31')).toBe('text-[44px]');
    expect(figureSizeClass('80,616,000.00')).toBe('text-[30px]');
    expect(figureSizeClass('1,234,567,890.12')).toBe('text-[24px]');
  });
});

describe('categories and rows', () => {
  const data: LedgerMonth = {
    month: '2026-02', timeZone: 'UTC', excluded: { status: 0, duplicate: 0, noAmount: 0 },
    currencies: [
      { currency: 'MAD', total: 935.7, receiptCount: 2, uncategorizedCount: 0, categories: lines({ Food: [935.7, 2] }),
        receipts: [
          { documentId: 'b', date: '2026-02-25', dateSource: 'document', amount: 467.85, amountSource: 'extracted', category: 'Food', merchant: 'BIM', status: 'COMPLETED' },
          { documentId: 'a', date: '2026-02-25', dateSource: 'document', amount: 467.85, amountSource: 'extracted', category: 'Food', merchant: 'MHAMMADI', status: 'COMPLETED' },
        ] },
      { currency: 'USD', total: 54.76, receiptCount: 1, uncategorizedCount: 1, categories: lines({ Other: [54.76, 1] }),
        receipts: [
          { documentId: 'c', date: '2026-02-03', dateSource: 'document', amount: 54.76, amountSource: 'extracted', category: null, merchant: null, status: 'NEEDS_REVIEW' },
        ] },
    ],
  };

  it('each card keeps one line per currency, ordered by receipt count, and lists the empty categories', () => {
    const { active, empty } = categoryCards(data);
    expect(active.map(c => [c.category, c.receiptCount, c.lines.map(l => `${l.currency} ${l.total}`)])).toEqual([
      ['Food', 2, ['MAD 935.7']],
      ['Other', 1, ['USD 54.76']],
    ]);
    expect(active.find(c => c.category === 'Other')!.notYetSorted).toBe(1);
    expect(empty).toEqual(['Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office']);
  });

  it('rows are newest first across currencies, ties by id, each carrying its own currency', () => {
    expect(receiptRows(data).map(r => `${r.documentId} ${r.currency}`)).toEqual(['a MAD', 'b MAD', 'c USD']);
  });
});
