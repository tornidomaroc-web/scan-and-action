import { describe, it, expect } from 'vitest';
import { formatCount, formatPercent } from '../src/lib/formatNumber';

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

describe('formatPercent (locale-aware percent)', () => {
  it('takes a RATIO and renders whole percent by default (English byte-identical)', () => {
    expect(formatPercent(0.98, 'en')).toBe('98%'); // recent-activity confidence
    expect(formatPercent(80 / 100, 'en')).toBe('80%'); // by-status row
    expect(formatPercent(10 / 100, 'en')).toBe('10%');
  });

  it('honours fractionDigits (the avgConfidence KPI keeps one decimal)', () => {
    expect(formatPercent(0.964, 'en', { fractionDigits: 1 })).toBe('96.4%');
  });

  it("signDisplay 'exceptZero' makes the FORMATTER emit the +, not concatenation", () => {
    expect(formatPercent(25 / 100, 'en', { signDisplay: 'exceptZero' })).toBe('+25%');
    expect(formatPercent(-25 / 100, 'en', { signDisplay: 'exceptZero' })).toBe('-25%');
  });

  it('shows no sign for zero and negative zero (never "+0%" or "-0%")', () => {
    expect(formatPercent(0, 'en', { signDisplay: 'exceptZero' })).toBe('0%');
    expect(formatPercent(-0, 'en', { signDisplay: 'exceptZero' })).toBe('0%');
  });

  it('localizes the decimal separator and percent-sign spacing in French', () => {
    // fr uses a comma decimal separator and a NO-BREAK SPACE (U+00A0) before the
    // percent sign. This is NOT the space used as the GROUP separator, which is a
    // NARROW no-break space (U+202F) - see the formatCount suite above. Both are
    // invisible and trivially mistyped, so they are written as escapes here.
    expect(formatPercent(0.964, 'fr', { fractionDigits: 1 })).toBe('96,4 %');
    expect(formatPercent(0.8, 'fr')).toBe('80 %');
    // Guard the distinction: the percent space must not become the group space.
    expect(formatPercent(0.8, 'fr')).not.toBe('80 %');
    expect(formatCount(1234, 'fr')).toBe('1 234');
  });

  it('emits Latin digits on the bare "ar" subtag (digits do not localize)', () => {
    // Intl wraps the sign in bidi isolation marks; the DIGITS stay Latin.
    expect(formatPercent(0.98, 'ar')).toContain('98');
    expect(formatPercent(0.98, 'ar')).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
  });

  it('defaults to en when language is empty', () => {
    expect(formatPercent(0.25, '')).toBe('25%');
  });

  it('handles NaN / non-finite / nullish safely, without fabricating "NaN%"', () => {
    expect(formatPercent(NaN, 'en')).toBe('');
    expect(formatPercent(Infinity, 'en')).toBe('');
    expect(formatPercent(-Infinity, 'en')).toBe('');
    expect(formatPercent(null as any, 'en')).toBe('');
    expect(formatPercent(undefined as any, 'en')).toBe('');
  });
});
