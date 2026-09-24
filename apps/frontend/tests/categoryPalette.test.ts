import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEDGER_CATEGORIES } from '../src/lib/ledgerTypes';
import { CATEGORY_FILL, CATEGORY_ICON } from '../src/components/ui/CategoryIcon';

// ============================================================================
// The category colours pass contrast in BOTH themes, computed, not asserted.
// ============================================================================
// Each --sa-cat-* is the fill of a tile with a white glyph, and ONE value serves
// light and dark. Two WCAG 1.4.11 (non-text, 3:1) requirements follow, and this
// file computes both from tokens.css with the WCAG 2 relative-luminance formula:
//   1. the white glyph against its fill;
//   2. the tile against every surface it can sit on, in both themes: the page
//      (--sa-surface) and the card (--sa-surface-raised), from :root and .dark.
// The surfaces are read from tokens.css as well, so a surface change that sinks
// a tile fails here too. jsdom paints nothing, but these are literal hex values
// in a stylesheet, so the arithmetic is the measurement.
// ============================================================================

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`);
  expect(i, `tokens.css has no ${selector} block`).toBeGreaterThan(-1);
  const body = css.slice(i, css.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries([...body.matchAll(/(--sa-[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

const root = block(':root');
const dark = block('.dark');

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const FLOOR = 3; // WCAG 1.4.11, the only floor for a non-text graphic
const SURFACES = {
  'light page': root['--sa-surface'],
  'light card': root['--sa-surface-raised'],
  'dark page': dark['--sa-surface'],
  'dark card': dark['--sa-surface-raised'],
};
const tokenOf = (c: string) => `--sa-cat-${c.toLowerCase()}`;

describe('the contrast arithmetic can fail (controls)', () => {
  it('reproduces known ratios and fails a colour known to be too light', () => {
    expect(ratio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    // The warning fill: white on it is 2.22:1, recorded in tokenLiteralPairing.test.ts.
    expect(ratio(root['--sa-warning'], '#FFFFFF')).toBeLessThan(FLOOR);
    // A dark fill fails on the dark card.
    expect(ratio('#1F2937', dark['--sa-surface-raised'])).toBeLessThan(FLOOR);
  });

  it('read four surfaces, all different', () => {
    expect(new Set(Object.values(SURFACES)).size).toBe(4);
  });
});

describe('category colours', () => {
  it('there is exactly one token, one fill class and one distinct glyph per category', () => {
    const tokens = Object.keys(root).filter(k => k.startsWith('--sa-cat-')).sort();
    expect(tokens).toEqual(LEDGER_CATEGORIES.map(tokenOf).sort());
    expect(new Set(tokens.map(t => root[t].toUpperCase())).size).toBe(LEDGER_CATEGORIES.length);
    expect(new Set(Object.values(CATEGORY_ICON)).size).toBe(LEDGER_CATEGORIES.length);
    for (const c of LEDGER_CATEGORIES) expect(CATEGORY_FILL[c]).toBe(`bg-cat-${c.toLowerCase()}`);
  });

  it('one value in both themes: no category token is redefined under .dark', () => {
    expect(Object.keys(dark).filter(k => k.startsWith('--sa-cat-'))).toEqual([]);
  });

  it('no category reuses a status colour', () => {
    const status = ['--sa-warning', '--sa-danger', '--sa-success', '--sa-accent'].map(k => root[k].toUpperCase());
    for (const c of LEDGER_CATEGORIES) expect(status).not.toContain(root[tokenOf(c)].toUpperCase());
  });

  for (const c of LEDGER_CATEGORIES) {
    it(`${c}: white glyph >= 3:1 on the fill, and the tile >= 3:1 on every surface in both themes`, () => {
      const fill = root[tokenOf(c)];
      expect(ratio(fill, '#FFFFFF'), `${c} glyph`).toBeGreaterThanOrEqual(FLOOR);
      for (const [name, surface] of Object.entries(SURFACES)) {
        expect(ratio(fill, surface), `${c} tile on ${name}`).toBeGreaterThanOrEqual(FLOOR);
      }
    });
  }
});
