import { describe, it, expect } from 'vitest';
import { formatCellValue } from '../src/lib/formatCellValue';

// ============================================================================
// Safe cell-value formatting (Search results table)
// ============================================================================
// Guards the fix for the "[object Object]" bug: search "table" rows are raw
// document records whose `facts` / `documentEntities` columns are arrays of
// objects. These must render as readable text, never "[object Object]", and
// genuinely-empty values must become null (a muted placeholder), never a blank
// or a stringified object.

describe('formatCellValue — primitives', () => {
  it('passes strings and numbers through (0 is a real value)', () => {
    expect(formatCellValue('Aurora', 'vendor', 'en')).toBe('Aurora');
    expect(formatCellValue(120, 'amount', 'en')).toBe('120');
    expect(formatCellValue(0, 'amount', 'en')).toBe('0');
    expect(formatCellValue(false, 'flag', 'en')).toBe('false');
  });
});

describe('formatCellValue — empty values', () => {
  it('returns null for null/undefined/blank/empty-array', () => {
    expect(formatCellValue(null, 'x', 'en')).toBeNull();
    expect(formatCellValue(undefined, 'x', 'en')).toBeNull();
    expect(formatCellValue('', 'x', 'en')).toBeNull();
    expect(formatCellValue('   ', 'x', 'en')).toBeNull();
    expect(formatCellValue([], 'facts', 'en')).toBeNull();
  });
});

describe('formatCellValue — dates', () => {
  it('formats an ISO datetime into a readable localized date (not the raw ISO)', () => {
    const out = formatCellValue('2026-07-01T10:00:00Z', 'uploadedAt', 'en')!;
    expect(out).toContain('2026');
    expect(out).not.toContain('T10:00');
    expect(out).not.toContain('[object Object]');
  });

  it('formats a date-only string too', () => {
    const out = formatCellValue('2026-03-01', 'valueDate', 'en')!;
    expect(out).toContain('2026');
  });
});

describe('formatCellValue — objects and arrays never render as [object Object]', () => {
  it('summarizes a documentEntities row via the entity canonical name + role', () => {
    const out = formatCellValue({ role: 'VENDOR', entity: { canonicalName: 'Aurora Studios' } }, 'documentEntities', 'en')!;
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('Aurora Studios');
  });

  it('joins an array of entity objects into readable names', () => {
    const out = formatCellValue(
      [
        { role: 'VENDOR', entity: { canonicalName: 'Aurora' } },
        { role: 'CLIENT', entity: { canonicalName: 'Contoso' } },
      ],
      'documentEntities',
      'en'
    )!;
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('Aurora');
    expect(out).toContain('Contoso');
  });

  it('summarizes an array of fact objects as "key: value (+ currency)"', () => {
    const out = formatCellValue(
      [
        { key: 'AMOUNT', valueNumber: 120, currency: 'USD' },
        { key: 'CATEGORY', valueString: 'Travel' },
      ],
      'facts',
      'en'
    )!;
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('120');
    expect(out).toContain('USD');
    expect(out).toContain('Travel');
  });

  it('falls back to the first primitive field for an unknown object shape', () => {
    const out = formatCellValue({ status: 'COMPLETED', nested: { a: 1 } }, 'meta', 'en')!;
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('COMPLETED');
  });
});
