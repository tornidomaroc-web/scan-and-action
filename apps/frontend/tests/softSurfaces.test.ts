import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Restyle PR 3 (Home and Detail, 2026-10-13): the soft surfaces and the text
// placed on them. The shadows are decoration; the text is not, so every label
// these screens put on the page, on a card or in an inset cell is measured
// here with the same WCAG arithmetic kitLanguage.test.ts runs. Two pairs the
// design proposal drew FAIL in light mode and are held out as controls:
// ink-muted on the page (4.27:1) and ink-muted in an inset cell (4.49:1).
// ============================================================================

const APP = join(__dirname, '..');
const F = (rel: string) => readFileSync(join(APP, rel), 'utf8');
const css = F('src/styles/tokens.css');

function block(selector: string): Record<string, string> {
  const i = css.indexOf(selector + ' {');
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/(--sa-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const THEMES = { light: block(':root'), dark: block('.dark') };

describe('text on the soft surfaces', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it.each([
      ['eyebrow (secondary) on the page', '--sa-ink-secondary', '--sa-surface'],
      ['inset cell label (secondary) on the inset', '--sa-ink-secondary', '--sa-surface-alt'],
      ['inset cell value (ink) on the inset', '--sa-ink', '--sa-surface-alt'],
      ['totals card caption (muted) on the card', '--sa-ink-muted', '--sa-surface-raised'],
    ])(`${name}: %s clears 4.5:1`, (_label, fg, bg) => {
      expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('controls: muted on the page and muted in an inset cell fail in light, so the arithmetic can fail', () => {
    const t = THEMES.light;
    expect(ratio(t['--sa-ink-muted'], t['--sa-surface'])).toBeLessThan(4.5);
    expect(ratio(t['--sa-ink-muted'], t['--sa-surface-alt'])).toBeLessThan(4.5);
  });
});

describe('the classes that carry the rule', () => {
  const panel = F('src/components/ui/Panel.tsx');
  const cls = (name: string) => panel.match(new RegExp(`export const ${name} = '([^']+)'`))![1];

  it('eyebrows and inset labels never use ink-muted', () => {
    expect(cls('eyebrowClass')).toContain('text-ink-secondary');
    expect(cls('eyebrowClass')).not.toContain('ink-muted');
  });

  it('eyebrows drop their letter-spacing in Arabic, which is written joined', () => {
    expect(cls('eyebrowClass')).toMatch(/tracking-\[[\d.]+em\]/);
    expect(cls('eyebrowClass')).toContain('rtl:tracking-normal');
  });

  it('the raised card is the ordinary card one shadow higher, ring kept for dark mode', () => {
    expect(cls('raisedPanelClass')).toBe(cls('panelClass').replace('shadow-card', 'shadow-raised'));
    expect(cls('raisedPanelClass')).toContain('ring-1 ring-line');
  });

  it('an inset cell is pressed in, not raised', () => {
    expect(cls('insetCellClass')).toContain('shadow-pressed');
    expect(cls('insetCellClass')).toContain('bg-surface-alt');
  });
});

describe('Home and Detail use them', () => {
  const home = F('src/screens/LedgerScreen.tsx');
  const detail = F('src/screens/DocumentDetailScreen.tsx');

  it("Home's totals sit on the raised card, under an eyebrow", () => {
    expect(home).toMatch(/<section className=\{`mt-6 p-4 \$\{raisedPanelClass\}`\} aria-labelledby="ledger-spent" data-ledger-total>/);
    expect(home).toContain('<p id="ledger-spent" className={eyebrowClass}>');
  });

  it("Home's note under the categories, on the page, is not muted", () => {
    expect(home).toMatch(/text-ink-secondary" data-ledger-empty-categories/);
  });

  it("Detail's facts are inset cells whose labels are secondary, and the grid's minimum is in rem", () => {
    const facts = detail.slice(detail.indexOf('data-detail-facts'), detail.indexOf('data-detail-actions'));
    expect(facts).toContain('{s.detailWhatWasRead}');
    expect(facts).toContain('insetCellClass');
    expect(facts).toContain('grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]');
    expect(facts).not.toContain('text-ink-muted');
  });

  it("Detail's values align with the cell's start in both directions (no text-start on a dir-pinned value)", () => {
    const facts = detail.slice(detail.indexOf('data-detail-facts'), detail.indexOf('data-detail-actions'));
    expect(facts).toContain('flex-col items-start');
    expect(facts).not.toMatch(/text-start[^"]*" dir=\{factValueDir/);
  });

  it('the review actions keep their semantic text colours and never wear the accent', () => {
    const bar = detail.slice(detail.indexOf('data-detail-actions'));
    expect(bar).toContain('bg-success-tint text-sm font-bold text-success-text');
    expect(bar).toContain('bg-danger-tint text-sm font-bold text-danger-text');
    expect(bar).not.toMatch(/bg-accent|text-accent/);
  });
});

describe('the Gradle wrapper', () => {
  it('pins the same distribution sum the Android build check pins', () => {
    const props = F('android/gradle/wrapper/gradle-wrapper.properties');
    const wf = readFileSync(join(APP, '..', '..', '.github', 'workflows', 'android-build.yml'), 'utf8');
    const sum = props.match(/^distributionSha256Sum=([0-9a-f]{64})$/m)![1];
    expect(wf).toContain(`distributionSha256Sum=${sum}`);
  });
});
