import { describe, it, expect } from 'vitest';
import { canonicalizeEntityName } from './canonicalName';

describe('canonicalizeEntityName (item B — the shared Entity matching key)', () => {
  it('uppercases, strips accents/punctuation, keeps spaces, trims', () => {
    expect(canonicalizeEntityName('Café Central')).toBe('CAF CENTRAL');
    expect(canonicalizeEntityName("McDonald's")).toBe('MCDONALDS');
    expect(canonicalizeEntityName('Société Régionale Multiservices Marrakech-Safi SA')).toBe(
      'SOCIT RGIONALE MULTISERVICES MARRAKECHSAFI SA'
    );
  });

  it('is idempotent on an already-canonical value (so both call sites agree)', () => {
    const once = canonicalizeEntityName('Bricks & Barrels Steakhouse');
    expect(canonicalizeEntityName(once)).toBe(once);
  });

  it('is null-safe and returns empty string for blank input', () => {
    expect(canonicalizeEntityName(null)).toBe('');
    expect(canonicalizeEntityName(undefined)).toBe('');
    expect(canonicalizeEntityName('   ')).toBe('');
    expect(canonicalizeEntityName('***')).toBe('');
  });

  it('reproduces the historical write output byte-for-byte (existing rows stay valid)', () => {
    const legacy = (n: string) => n.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
    for (const n of ['Café Central', "McDonald's", 'The Dirty Bird Chicken + Waffles', 'ARTGROUP T-Shirt Emporium']) {
      expect(canonicalizeEntityName(n.trim())).toBe(legacy(n));
    }
  });
});

// ============================================================================
// A merchant written in no Latin letter still gets a key of its own.
// ============================================================================
// FOUND 2026-10-04 (WORK-QUEUE.md, the Step 3 measurement): the key kept only
// [A-Z0-9], so "新宇科技服務(股)公司", "伊神切手社" and every other all-CJK merchant
// became '' and resolved to ONE entity per organisation. An Arabic-only shop name
// does the same, and for a Moroccan user that is every receipt printed in Arabic.
// ============================================================================
describe('canonicalizeEntityName on a name with no Latin letter', () => {
  it('an Arabic-only name is a non-empty key that keeps its letters', () => {
    expect(canonicalizeEntityName('مقهى الأمل')).toBe('مقهى الأمل');
  });

  it('two Arabic merchants get two different keys', () => {
    expect(canonicalizeEntityName('مقهى الأمل')).not.toBe(canonicalizeEntityName('صيدلية النور'));
  });

  it('an Arabic name with a branch number is not reduced to the number', () => {
    expect(canonicalizeEntityName('محل رقم 5')).toBe('محل رقم 5');
    expect(canonicalizeEntityName('مطعم 5')).not.toBe(canonicalizeEntityName('صيدلية 5'));
  });

  it('a CJK name drops punctuation and keeps every character', () => {
    expect(canonicalizeEntityName('新宇科技服務(股)公司')).toBe('新宇科技服務股公司');
    expect(canonicalizeEntityName('伊神切手社')).toBe('伊神切手社');
    expect(canonicalizeEntityName('新宇科技服務(股)公司')).not.toBe(canonicalizeEntityName('伊神切手社'));
  });

  it('Arabic stylings fold: tatweel, harakat and presentation forms read as the plain name', () => {
    expect(canonicalizeEntityName('مـقـهـى الأمـل')).toBe('مقهى الأمل'); // tatweel
    expect(canonicalizeEntityName('مَقْهَى الأَمَل')).toBe('مقهى الأمل'); // harakat
    expect(canonicalizeEntityName('ﻣﻘﻬﻰ')).toBe('مقهى'); // OCR presentation forms
  });

  it('a Cyrillic name folds case like a Latin one', () => {
    expect(canonicalizeEntityName('Пятёрочка')).toBe(canonicalizeEntityName('ПЯТЁРОЧКА'));
  });

  it('is idempotent on a non-Latin key (the re-evaluation path hands the stored key back in)', () => {
    for (const n of ['مقهى الأمل', '新宇科技服務(股)公司', 'محل رقم 5']) {
      const once = canonicalizeEntityName(n);
      expect(canonicalizeEntityName(once)).toBe(once);
    }
  });

  it('every name holding a Latin letter keeps its historical key byte for byte', () => {
    const legacy = (n: string) => n.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
    for (const n of ['Café Central', "McDonald's", '7-Eleven 新宿店', 'Marjane  Casablanca', 'ÉPICERIE Léa', 'Bricks & Barrels']) {
      expect(canonicalizeEntityName(n)).toBe(legacy(n));
    }
  });

  it('a name of digits or symbols alone is unchanged from history too', () => {
    expect(canonicalizeEntityName('1234')).toBe('1234');
    expect(canonicalizeEntityName('***')).toBe('');
    expect(canonicalizeEntityName('١٢٣')).toBe('١٢٣');
  });
});
