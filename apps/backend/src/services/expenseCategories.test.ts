import { describe, it, expect } from 'vitest';
import { EXPENSE_CATEGORIES, normalizeCategory, categoryPromptFragment } from './expenseCategories';
import { ExpenseCategorizationService } from './expenseCategorizationService';

describe('expense categories: the enum and how the model answer is read', () => {
  it('is the ruled list, in order, with Other last', () => {
    expect([...EXPENSE_CATEGORIES]).toEqual(['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other']);
  });

  it('maps the uppercase code the prompt asks for onto the stored label', () => {
    expect(normalizeCategory('FOOD')).toBe('Food');
    expect(normalizeCategory(' "bills" ')).toBe('Bills');
    expect(normalizeCategory('Office')).toBe('Office');
  });

  it('answers null, not Other, for anything off the list, so the fallback runs', () => {
    expect(normalizeCategory('GROCERIES')).toBeNull();
    expect(normalizeCategory('')).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
    expect(normalizeCategory(42)).toBeNull();
  });

  it('puts every code and its definition in the prompt fragment', () => {
    const f = categoryPromptFragment();
    for (const c of EXPENSE_CATEGORIES) expect(f).toContain(c.toUpperCase());
    expect(f).toContain('bakeries');
  });
});

describe('keyword fallback: still answers the ruled enum', () => {
  const svc = new ExpenseCategorizationService();
  const cat = (m: string | null, t = '') => svc.categorize({ merchantName: m, rawText: t, facts: [] }).category;
  it('grocery receipt with "market" in the name is Food', () => { expect(cat('Green Basket Market')).toBe('Food'); });
  it('software is Office now, not a category of its own', () => { expect(cat('GitHub')).toBe('Office'); });
  it('pharmacy is Health', () => { expect(cat('Pharmacie Atlas')).toBe('Health'); });
  it('Arabic text matches nothing and is Other, which is why the fallback is the fallback', () => {
    expect(cat('مخبزة الأمل', 'خبز بلدي ×4 8.00 المجموع 86.50 درهم')).toBe('Other');
  });
});
