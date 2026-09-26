import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The visual language of 2026-09-26, held to its three rulings (tokens.css):
//
//   1. The button accent carries its label at 4.5:1 or more, in both themes.
//      The design's brighter blue stays a chart and icon colour: it is never
//      the fill under a label.
//   2. Every category fill clears 3:1 on every surface token it can sit on,
//      in both themes: the page, the card, the alt surface and the muted
//      inset (categoryPalette.test.ts checks the first two; this checks all).
//   3. The sign-in screens' dark scope is byte-identical to the app's dark
//      palette, so the two cannot drift apart.
//
// Plus: motion honours prefers-reduced-motion at the root of the stylesheet.
//
// jsdom applies no stylesheet, so like its sibling tests this is a SOURCE
// reading with the WCAG arithmetic done here; the numbers are the ones a
// browser computes for solid colours.
// ============================================================================

const CWD = process.cwd();
const css = readFileSync(join(CWD, 'src', 'styles', 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const i = css.indexOf(selector + ' {');
  expect(i, `tokens.css has no ${selector} block`).toBeGreaterThan(-1);
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/(--sa-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const hex6 = (v: string) => {
  const m = v.match(/^#([0-9a-f]{6})$/i);
  expect(m, `${v} is not a solid 6-digit hex; a ratio needs a solid colour`).not.toBeNull();
  return m![1];
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (v: string) => {
  const h = hex6(v);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const root = block(':root');
const dark = block('.dark');
const THEMES = { light: root, dark };
const CATEGORIES = ['food', 'transport', 'travel', 'shopping', 'health', 'bills', 'office', 'other'];
const SURFACES = ['--sa-surface', '--sa-surface-raised', '--sa-surface-alt', '--sa-surface-muted'];

describe('the arithmetic can fail (controls)', () => {
  it('reproduces black on white and rejects the design chart blue under white text', () => {
    expect(ratio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    // The design's own blue: 4.40:1 under white, which is why buttons take
    // the darker step (tokens.css, adjustment 1).
    expect(ratio('#3B6CFF', '#FFFFFF')).toBeLessThan(4.5);
  });
});

describe('1. the button accent carries its label', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    it(`${theme}: --sa-on-accent on --sa-accent is 4.5:1 or more`, () => {
      expect(ratio(t['--sa-accent'], t['--sa-on-accent'])).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: the accent text reads on the page and on the card (4.5:1)`, () => {
      expect(ratio(t['--sa-accent-text'], t['--sa-surface'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['--sa-accent-text'], t['--sa-surface-raised'])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the brighter blue exists for charts and icons, and no source pairs it with a label colour', () => {
    expect(root['--sa-accent-bright']).toBeTruthy();
    const walk = (d: string): string[] => {
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []));
    };
    for (const f of walk(join(CWD, 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        if (/\bbg-accent-bright\b/.test(cls)) {
          expect(/\btext-(?:on-accent|white|surface-raised|ink)\b/.test(cls), `${f}: a label sits on the chart blue: ${cls}`).toBe(false);
        }
      }
    }
  });
});

describe('2. every category fill clears 3:1 on every surface, in both themes', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const c of CATEGORIES) {
      it(`${theme}: ${c}`, () => {
        const fill = t[`--sa-cat-${c}`] ?? root[`--sa-cat-${c}`];
        for (const key of SURFACES) {
          expect(ratio(fill, t[key]), `${c} on ${key} (${theme})`).toBeGreaterThanOrEqual(3);
        }
        // The white glyph on the fill.
        expect(ratio(fill, '#FFFFFF'), `${c} glyph`).toBeGreaterThanOrEqual(3);
      });
    }
  }
  it('control: the design inner tile would have failed for Shopping, Health and Other', () => {
    for (const c of ['shopping', 'health', 'other']) expect(ratio(root[`--sa-cat-${c}`], '#303038')).toBeLessThan(3);
  });
});

describe('3. the sign-in dark scope is the dark palette, byte for byte', () => {
  it('.theme-dark declares exactly what .dark declares', () => {
    const scope = block('.theme-dark');
    expect(Object.keys(scope)).toEqual(Object.keys(dark));
    for (const k of Object.keys(dark)) expect(scope[k], k).toBe(dark[k]);
  });
});

describe('motion', () => {
  it('the stylesheet honours prefers-reduced-motion', () => {
    const index = readFileSync(join(CWD, 'src', 'index.css'), 'utf8');
    expect(index).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important[\s\S]*transition-duration: 0\.01ms !important/);
  });
});
