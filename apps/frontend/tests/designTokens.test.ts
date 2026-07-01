import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ============================================================================
// DESIGN-TOKEN FOUNDATION contract (PR-A)
// ============================================================================
// Locks the agreed foundation so a regression fails CI:
//   - the accent is indigo #635BFF (LOCKED decision, from the approved design),
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

describe('design tokens — indigo accent (locked)', () => {
  it('tokens.css defines the exact approved indigo accent ramp', () => {
    expect(tokensCss).toMatch(/--sa-accent:\s*#635BFF/i);
    expect(tokensCss).toMatch(/--sa-accent-hover:\s*#5147E8/i);
    expect(tokensCss).toMatch(/--sa-accent-text:\s*#4A3FE0/i);
    expect(tokensCss).toMatch(/--sa-accent-tint:\s*#EEEDFE/i);
    expect(tokensCss).toMatch(/--sa-accent-tint-2:\s*#F1F0FE/i);
    expect(tokensCss).toMatch(/--sa-accent-border:\s*#E4E2FB/i);
  });

  it('tokens.css ships a .dark block so light/dark is one system', () => {
    expect(tokensCss).toMatch(/\.dark\s*\{/);
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

describe('reconciliation — one system, legacy vars intentionally preserved', () => {
  it('index.css imports the token layer BEFORE @tailwind (or the bundler drops it)', () => {
    const importIdx = indexCss.indexOf("@import './styles/tokens.css'");
    const tailwindIdx = indexCss.indexOf('@tailwind base');
    expect(importIdx).toBeGreaterThanOrEqual(0);
    // A CSS @import after other statements is dropped at build time, silently
    // disabling every --sa-* token. It must come first.
    expect(importIdx).toBeLessThan(tailwindIdx);
  });

  it('legacy vars remain (unchanged this PR) so the app does not restyle yet', () => {
    // These still drive .saas-card/.btn-primary/.nav-item; PR-B migrates them.
    expect(indexCss).toMatch(/--accent:\s*#2563eb/i);
    expect(indexCss).toMatch(/--background:\s*#f9fafb/i);
  });
});
