import { describe, it, expect } from 'vitest';
import { formatCount } from '../src/lib/formatNumber';

describe('formatCount (locale-aware integer grouping)', () => {
  it('groups with a comma in English', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
    expect(formatCount(1234567, 'en')).toBe('1,234,567');
  });

  it('groups with the French separator (U+202F narrow no-break space)', () => {
    expect(formatCount(1234, 'fr')).toBe('1 234');
    expect(formatCount(1234567, 'fr')).toBe('1 234 567');
  });

  it('emits Latin digits on the bare "ar" subtag (separators localize, digits do not)', () => {
    expect(formatCount(1234, 'ar')).toBe('1,234');
  });

  it('leaves values under 1000 ungrouped in every language', () => {
    for (const l of ['en', 'fr', 'ar']) {
      expect(formatCount(86, l)).toBe('86');
      expect(formatCount(0, l)).toBe('0');
    }
  });

  it('defaults to en when language is empty', () => {
    expect(formatCount(1234, '')).toBe('1,234');
  });

  it('handles NaN / non-finite / nullish safely, without fabricating output', () => {
    expect(formatCount(NaN, 'en')).toBe('');
    expect(formatCount(Infinity, 'en')).toBe('');
    expect(formatCount(-Infinity, 'en')).toBe('');
    expect(formatCount(null as any, 'en')).toBe('');
    expect(formatCount(undefined as any, 'en')).toBe('');
  });
});
