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
