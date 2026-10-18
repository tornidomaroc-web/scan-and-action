import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ============================================================================
// DESIGN-TOKEN FOUNDATION contract (PR-A)
// ============================================================================
// Locks the agreed foundation so a regression fails CI:
//   - the accent is the ICON FAMILY, ruled by the owner on 2026-10-12: the
//     mark's middle colour #006784 under a label (6.42:1 under white; the
//     teal end #00BB9F is --sa-accent-bright, charts and icons only, at
//     2.44:1 under white). This REVERSES the lock of 2026-09-26, which pinned
//     the HorizonX blue #3563F0 here; before that, 2026-09-24 to 2026-09-26,
//     it pinned indigo #635BFF. Each change was the owner's and is recorded
//     on the board; kitLanguage.test.ts holds the contrast that chose the
//     value,
//   - Tailwind utility color names map to the --sa-* tokens (single source),
//   - fonts are SELF-HOSTED via @fontsource (NO Google Fonts CDN) so the app
//     works offline / inside the Capacitor WebView.
// This is a config/contract test, not a visual test.
// ============================================================================

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const tokensCss = read('../src/styles/tokens.css');
const indexCss = read('../src/index.css');
const mainTsx = read('../src/main.tsx');
const tailwind = createRequire(import.meta.url)('../tailwind.config.cjs');

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('design tokens: the icon-family accent (ruled 2026-10-12, reversing the blue lock of 2026-09-26)', () => {
  it('tokens.css defines the exact accent ramp of the chosen language', () => {
    expect(tokensCss).toMatch(/--sa-accent:\s*#006784/i);
    expect(tokensCss).toMatch(/--sa-accent-hover:\s*#005A74/i);
    expect(tokensCss).toMatch(/--sa-accent-text:\s*#005A74/i);
    expect(tokensCss).toMatch(/--sa-accent-tint:\s*#DFF4F2/i);
    expect(tokensCss).toMatch(/--sa-accent-tint-2:\s*#E8F6F4/i);
    expect(tokensCss).toMatch(/--sa-accent-border:\s*#9ED9D1/i);
    expect(tokensCss).toMatch(/--sa-accent-bright:\s*#00BB9F/i);
    expect(tokensCss).toMatch(/--sa-on-accent:\s*#FFFFFF/i);
  });

  it('the blue of 2026-09-26 is gone from the tokens, on purpose', () => {
    // The reversal is explicit: a token file that still carried the old
    // accent anywhere would be two languages, not one.
    expect(tokensCss).not.toMatch(/#3563F0|#2F5BE6|#3B6CFF|#E8EEFF/i);
  });

  it('the muted label clears 4.5:1 on the light card (it measured 3.45 before 2026-10-12)', () => {
    const start = tokensCss.indexOf(':root {');
    const root = tokensCss.slice(start, tokensCss.indexOf('\n}', start));
    const get = (name: string) => root.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i'))![1];
    expect(ratio(get('--sa-ink-muted'), get('--sa-surface-raised'))).toBeGreaterThanOrEqual(4.5);
    // the control: the old value fails the same arithmetic
    expect(ratio('#858A99', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('tokens.css ships a .dark block so light/dark is one system', () => {
    expect(tokensCss).toMatch(/\.dark\s*\{/);
  });

  it('the soft depth yields to Increase Contrast and Reduce Transparency', () => {
    expect(tokensCss).toMatch(/@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
    expect(tokensCss).toMatch(/--sa-shadow-pressed:/);
    expect(tokensCss).toMatch(/--sa-shadow-accent:/);
  });
});

describe('design tokens — Tailwind maps utilities to the --sa-* tokens', () => {
  it('accent utilities resolve to the token variables (single source of truth)', () => {
    const c = tailwind.theme.extend.colors;
    expect(c.accent.DEFAULT).toBe('var(--sa-accent)');
    expect(c.accent.hover).toBe('var(--sa-accent-hover)');
    expect(c.ink.DEFAULT).toBe('var(--sa-ink)');
    expect(c.surface.DEFAULT).toBe('var(--sa-surface)');
    expect(c.success.DEFAULT).toBe('var(--sa-success)');
    expect(c.warning.DEFAULT).toBe('var(--sa-warning)');
    expect(c.danger.DEFAULT).toBe('var(--sa-danger)');
  });

  it('does NOT shadow Tailwind default palettes (existing screens unaffected)', () => {
    const c = tailwind.theme.extend.colors;
    // Overriding blue/slate/gray/etc. here would restyle existing utilities.
    for (const reserved of ['blue', 'slate', 'gray', 'amber', 'emerald', 'rose', 'red']) {
      expect(c[reserved]).toBeUndefined();
    }
  });

  it('radius scale is present as additive names (8/9/12/999)', () => {
    const r = tailwind.theme.extend.borderRadius;
    expect(r.nav).toBe('var(--sa-radius-nav)');
    expect(r.btn).toBe('var(--sa-radius-btn)');
    expect(r.card).toBe('var(--sa-radius-card)');
    expect(r.pill).toBe('var(--sa-radius-pill)');
  });

  it('the two soft-depth shadows are utilities (shadow-pressed, shadow-accent)', () => {
    const s = tailwind.theme.extend.boxShadow;
    expect(s.pressed).toBe('var(--sa-shadow-pressed)');
    expect(s.accent).toBe('var(--sa-shadow-accent)');
  });
});

describe('typography — real fonts, self-hosted, no CDN', () => {
  it('fontFamily.sans includes Inter and IBM Plex Sans Arabic', () => {
    const sans = tailwind.theme.extend.fontFamily.sans;
    expect(sans).toContain('Inter');
    expect(sans).toContain('IBM Plex Sans Arabic');
  });

  it('the body font-family is sourced from the token (fixes the unloaded-font defect)', () => {
    expect(indexCss).toMatch(/font-family:\s*var\(--sa-font-sans\)/);
    expect(tokensCss).toMatch(/--sa-font-sans:[^;]*'Inter'[^;]*'IBM Plex Sans Arabic'/);
  });

  it('fonts are imported from @fontsource (self-hosted), not a Google Fonts CDN', () => {
    expect(mainTsx).toMatch(/@fontsource\/inter\/latin-\d00\.css/);
    expect(mainTsx).toMatch(/@fontsource\/ibm-plex-sans-arabic\/arabic-\d00\.css/);
    // Guard against reintroducing a CDN dependency the offline/native shell can't use.
    expect(mainTsx).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(indexCss).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});

describe('reconciliation — one system, legacy vars now bridge onto the tokens', () => {
  it('index.css imports the token layer BEFORE @tailwind (or the bundler drops it)', () => {
    const importIdx = indexCss.indexOf("@import './styles/tokens.css'");
    const tailwindIdx = indexCss.indexOf('@tailwind base');
    expect(importIdx).toBeGreaterThanOrEqual(0);
    // A CSS @import after other statements is dropped at build time, silently
    // disabling every --sa-* token. It must come first.
    expect(importIdx).toBeLessThan(tailwindIdx);
  });

  it('legacy vars alias the --sa-* tokens (PR-D1 bridge)', () => {
    // As of PR-D1 the legacy vars that drive .saas-card/.btn-primary/.nav-item
    // no longer carry their own hex; they alias the token layer so there is
    // one source of truth. (Detailed per-var coverage lives in
    // tokenBridge.test.ts.)
    expect(indexCss).toMatch(/--accent:\s*var\(--sa-accent\)/i);
    expect(indexCss).toMatch(/--background:\s*var\(--sa-surface\)/i);
  });
});
