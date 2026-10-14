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

  it("Detail's facts are inset cells in one column, whose labels are secondary", () => {
    const facts = detail.slice(detail.indexOf('data-detail-facts'), detail.indexOf('data-detail-actions'));
    expect(facts).toContain('{s.detailWhatWasRead}');
    expect(facts).toContain('insetCellClass');
    // One column: on Android, rem lengths do not grow with the text zoom.
    expect(facts).toContain('<ul className="mt-3 flex flex-col gap-2">');
    expect(facts).not.toMatch(/grid-cols-\[repeat\(auto-fit/);
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

// ============================================================================
// Restyle PR 4 (Queue, Search, Activity, 2026-10-13). A contrast audit run in
// the browser over every text node of the six screens found, on main: muted
// text on the light page under Search's "found, not counted" heading and under
// Activity's title (4.27:1), and the currency inside Detail's amount field on
// the field's muted surface (3.97:1). Each is held here.
// ============================================================================

describe('PR 4: the pairs it introduces or fixes', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it.each([
      ['the amount field currency (secondary) on the field surface', '--sa-ink-secondary', '--sa-surface-muted'],
      ['the on-page notes (secondary) on the page', '--sa-ink-secondary', '--sa-surface'],
    ])(`${name}: %s clears 4.5:1`, (_label, fg, bg) => {
      expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('control: muted on the field surface fails in light, as main shipped it', () => {
    expect(ratio(THEMES.light['--sa-ink-muted'], THEMES.light['--sa-surface-muted'])).toBeLessThan(4.5);
  });
});

describe('PR 4: Queue, Search and Activity use the soft classes', () => {
  const queue = F('src/screens/ReviewQueueScreen.tsx');
  const search = F('src/screens/SearchScreen.tsx');
  const activity = F('src/screens/ActivityScreen.tsx');

  it('no note that sits on the page is muted', () => {
    expect(queue).toContain('text-ink-secondary">{s.queueFirstFifty}');
    expect(search).toContain('text-ink-secondary">{s.searchNotCountedBody}');
    expect(activity).toContain('text-ink-secondary">{s.auditDesc}');
  });

  it("the amount field's currency is secondary", () => {
    expect(F('src/components/FixActionPanel.tsx')).toContain('tracking-wide text-ink-secondary">{currency}');
  });

  it("Search's headings are eyebrows and its totals sit on the raised card, as Home's do", () => {
    expect(search).toContain('<h2 id="search-recent" className={eyebrowClass}>');
    expect(search).toContain('<h2 id="search-not-counted" className={eyebrowClass}>');
    expect(search).toMatch(/<div className=\{`p-4 \$\{raisedPanelClass\}`\} data-search-total>/);
  });

  it("Queue's Approve and Reject take the card shadow and keep their semantic colours", () => {
    expect(queue).toContain('bg-success-tint text-sm font-semibold text-success-text shadow-card');
    expect(queue).toContain('bg-danger-tint text-sm font-semibold text-danger-text shadow-card');
  });

  it("Activity's status drops under the name rather than cutting it to a few characters", () => {
    expect(activity).toContain('flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1');
    expect(activity).toContain('min-w-[9rem] flex-1');
  });

  it("Activity's subtitle says what the list is, in every language, with no release name", () => {
    const strings = F('src/i18n/strings.ts');
    const lines = [...strings.matchAll(/auditDesc: '([^']+)'/g)].map((m) => m[1]);
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).not.toMatch(/v1|Top 100|أفضل/);
    expect(lines[0]).toBe('Your 100 most recent documents, newest first.');
  });
});

// ============================================================================
// Restyle PR 5 (sign-in, Settings and the sheets, 2026-10-14). The paywall,
// the processing tray and the Pro welcome carried raw slate / blue / emerald
// classes that no token reached; they are on tokens now. Primary buttons and
// the paywall's prices take the strong-contrast rule the review states have.
// Settings' Delete account button put white on the danger fill at 4.08:1 in
// light, held below as the control.
// ============================================================================

const composite = (rgba: string, under: string) => {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number);
  const h = under.replace('#', '');
  const base = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return '#' + [r, g, b].map((v, i) => Math.round(v * a + base[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
};
// A token as a colour on the raised card: translucent tints (dark mode) are
// composited over the card they sit on.
const onCard = (t: Record<string, string>, v: string) => (t[v].startsWith('rgba') ? composite(t[v], t['--sa-surface-raised']) : t[v]);

describe('PR 5: the pairs on sign-in, Settings and the sheets', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it.each([
      ['primary button label on the accent', '--sa-on-accent', '--sa-accent'],
      ['paywall price (ink) on the chosen plan tint', '--sa-ink', '--sa-accent-tint'],
      ['paywall price (ink) on an idle plan card', '--sa-ink', '--sa-surface-raised'],
      ['paywall period and plan label (secondary) on the chosen tint', '--sa-ink-secondary', '--sa-accent-tint'],
      ['paywall yearly label (success text) on the chosen tint', '--sa-success-text', '--sa-accent-tint'],
      ['paywall save badge (card colour) on the success text fill', '--sa-surface-raised', '--sa-success-text'],
      ['paywall feature (ink) in an inset row', '--sa-ink', '--sa-surface-alt'],
      ['paywall feature tick (accent text) on the accent tint', '--sa-accent-text', '--sa-accent-tint'],
      ['sheet body and tray hint (secondary) on the sheet', '--sa-ink-secondary', '--sa-surface-raised'],
      ['tray chip and clear button (ink) on the muted pill', '--sa-ink', '--sa-surface-muted'],
      ['Settings delete (danger text) on the danger tint', '--sa-danger-text', '--sa-danger-tint'],
      ['Settings subtitle (secondary) on the page', '--sa-ink-secondary', '--sa-surface'],
      ['file meta (secondary) in the capture inset', '--sa-ink-secondary', '--sa-surface-alt'],
    ])(`${name}: %s clears 4.5:1`, (_label, fg, bg) => {
      expect(ratio(onCard(t, fg), onCard(t, bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the sign-in screens are dark in both themes; their own pairs, on the dark page', () => {
    const t = THEMES.dark;
    expect(ratio(t['--sa-surface'], t['--sa-ink'])).toBeGreaterThanOrEqual(4.5); // the active segment
    expect(ratio(t['--sa-ink-secondary'], t['--sa-surface-alt'])).toBeGreaterThanOrEqual(4.5); // the idle segment in the track
    expect(ratio(t['--sa-ink-muted'], t['--sa-surface'])).toBeGreaterThanOrEqual(4.5); // the legal line
  });

  it('control: white on the danger fill fails in light, as Settings shipped it', () => {
    expect(ratio('#FFFFFF', THEMES.light['--sa-danger'])).toBeLessThan(4.5);
  });
});

describe('PR 5: the classes that carry it', () => {
  const RAW = /\b(?:bg|text|border|ring|shadow|fill|from|to)-(?:slate|gray|blue|indigo|emerald|red|rose|amber|white)(?:-\d{2,3})?\b/;
  const code = (rel: string) => F(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(['src/components/PaywallModal.tsx', 'src/components/ProcessingTray.tsx', 'src/components/ProWelcome.tsx'])(
    '%s carries no raw palette class and no magic z-index',
    (rel) => {
      expect(code(rel)).not.toMatch(RAW);
      expect(code(rel)).not.toMatch(/z-\[\d+\]/);
      expect(code(rel)).not.toMatch(/font-black|italic/);
    },
  );

  it('the control: the scan catches the classes these files carried on main', () => {
    expect('bg-slate-900 dark:bg-slate-800 text-white').toMatch(RAW);
    expect('bg-emerald-500').toMatch(RAW);
  });

  it('every sheet and dialog is the lifted card: highest shadow, hairline ring', () => {
    const panel = F('src/components/ui/Panel.tsx');
    expect(panel).toContain("export const sheetClass = 'bg-surface-raised shadow-lg ring-1 ring-line';");
    for (const rel of ['src/components/PaywallModal.tsx', 'src/components/ProcessingTray.tsx', 'src/components/ProWelcome.tsx']) {
      expect(F(rel)).toContain('${sheetClass}');
    }
    for (const rel of ['src/components/CaptureSheet.tsx', 'src/components/DeleteAccountModal.tsx', 'src/components/UploadModal.tsx']) {
      expect(F(rel)).toMatch(/bg-surface-raised rounded-(?:t-)?panel[^"]*shadow-lg ring-1 ring-line/);
    }
  });

  it("the paywall's prices are ink, never faded, and its action is the primary button", () => {
    const pw = F('src/components/PaywallModal.tsx');
    expect(pw).toContain("const planPrice = 'text-2xl font-bold tracking-tight text-ink';");
    expect(pw).not.toContain('opacity-50');
    expect(pw.match(/primaryButtonClass/g)!.length).toBeGreaterThanOrEqual(3); // import, native, web
  });

  it('uppercase labels drop their letter-spacing in Arabic', () => {
    const pw = F('src/components/PaywallModal.tsx');
    for (const m of pw.match(/'[^']*uppercase[^']*'|"[^"]*uppercase[^"]*"/g)!) expect(m).toContain('rtl:tracking-normal');
  });

  it("Settings' delete button is the quiet danger idiom; its subtitle is not muted", () => {
    const st = F('src/screens/SettingsScreen.tsx');
    expect(st).toContain('bg-danger-tint text-sm font-bold text-danger-text shadow-card');
    expect(st).not.toMatch(/bg-danger\b(?!-)/);
    expect(st).toContain('text-ink-secondary">{s.manageAccount}');
  });

  it('the sign-in cards are the ordinary card, shadow included', () => {
    expect(F('src/screens/AuthScreen.tsx')).toContain('data-auth-check-inbox className={`p-5 ${panelClass}`}');
    expect(F('src/screens/AuthConfirmScreen.tsx').match(/\$\{panelClass\}/g)).toHaveLength(2);
    expect(F('src/screens/ResetPasswordScreen.tsx')).toContain('data-reset-done className={`p-5 ${panelClass}`}');
  });
});
