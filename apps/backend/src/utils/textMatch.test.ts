import { describe, it, expect } from 'vitest';
import { foldForMatch, matchesKeyword, matchesAnyKeyword } from './textMatch';

describe('foldForMatch — accent folding + lowercase (deferred item C)', () => {
  it('folds Latin diacritics to their base letter', () => {
    expect(foldForMatch('é')).toBe('e');
    expect(foldForMatch('ê')).toBe('e');
    expect(foldForMatch('à')).toBe('a');
    expect(foldForMatch('ñ')).toBe('n');
    expect(foldForMatch('ç')).toBe('c');
  });

  it('folds accents inside real words and lowercases', () => {
    expect(foldForMatch('Café')).toBe('cafe');
    expect(foldForMatch('Crêperie Déli')).toBe('creperie deli');
    expect(foldForMatch('RESTAURANT')).toBe('restaurant');
  });

  it('leaves plain ASCII unchanged (only lowercased/trimmed)', () => {
    expect(foldForMatch('cafe')).toBe('cafe');
    expect(foldForMatch('Hello World')).toBe('hello world');
  });

  it('trims surrounding whitespace', () => {
    expect(foldForMatch('  Foo  ')).toBe('foo');
  });

  it('is null/undefined/empty-safe', () => {
    expect(foldForMatch(null)).toBe('');
    expect(foldForMatch(undefined)).toBe('');
    expect(foldForMatch('')).toBe('');
  });
});

describe('matchesKeyword / matchesAnyKeyword — accent- and boundary-aware', () => {
  it('matches an accented target against an ASCII keyword (the core bug)', () => {
    expect(matchesAnyKeyword('Café Central', ['cafe'])).toBe(true);
    expect(matchesKeyword('Crêperie du Coin', 'creperie')).toBe(true);
  });

  it('matches a keyword as a whole word', () => {
    expect(matchesAnyKeyword('corner bar', ['bar'])).toBe(true);
    expect(matchesAnyKeyword('Le Bistro', ['bistro'])).toBe(true);
  });

  it('does NOT match a keyword that is only a substring/prefix of another word', () => {
    expect(matchesAnyKeyword('Barber Shop', ['bar'])).toBe(false);
    expect(matchesAnyKeyword('Publix', ['pub'])).toBe(false);
    expect(matchesAnyKeyword('Delivery Co', ['deli'])).toBe(false);
  });

  it('matches multi-word keywords only as a contiguous whole-word phrase', () => {
    expect(matchesAnyKeyword('Uber Eats order #42', ['uber eats'])).toBe(true);
    expect(matchesAnyKeyword('fast food joint', ['fast food'])).toBe(true);
    // "uber" alone must NOT satisfy the two-word "uber eats" phrase.
    expect(matchesAnyKeyword('Uber ride home', ['uber eats'])).toBe(false);
  });

  it('handles punctuated keywords like booking.com via tokenization', () => {
    expect(matchesKeyword('paid on www.booking.com today', 'booking.com')).toBe(true);
  });

  it('is null/empty-safe', () => {
    expect(matchesAnyKeyword(null, ['bar'])).toBe(false);
    expect(matchesAnyKeyword('anything', [])).toBe(false);
    expect(matchesKeyword('anything', '')).toBe(false);
  });
});
