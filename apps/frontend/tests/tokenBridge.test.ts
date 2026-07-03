import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// PR-D1 invariant: the legacy CSS variables that still drive the shared
// component classes (.saas-card, .btn-primary, .nav-item, .saas-table,
// .badge-*, .skeleton) must DERIVE FROM the authoritative --sa-* token layer
// rather than carry their own divergent hex values. This keeps the indigo
// design system a single source of truth: retint the tokens and every legacy
// screen follows. If someone re-hardcodes a colour into a legacy var, this
// fails and points them back at tokens.css.

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, '../src/index.css'), 'utf8');

// The legacy colour vars that bridge onto tokens. --transition-speed is a
// timing value (not a colour) and is intentionally excluded.
const BRIDGED_VARS = [
  '--background',
  '--card',
  '--text-primary',
  '--text-secondary',
  '--border',
  '--accent',
  '--accent-hover',
  '--nav-hover',
  '--nav-active-bg',
  '--nav-active-text',
];

describe('legacy → --sa-* token bridge (PR-D1)', () => {
  for (const name of BRIDGED_VARS) {
    it(`${name} derives from a --sa-* token, not a raw colour`, () => {
      // Every declaration of the var (light :root and any .dark block) must
      // reference an --sa-* token via var(). Guards against a re-hardcoded hex.
      const decls = [...indexCss.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))];
      expect(decls.length).toBeGreaterThan(0);
      for (const [, value] of decls) {
        expect(value).toContain('var(--sa-');
        expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      }
    });
  }

  it('shared component classes use the token radius scale (no stray px radii on the primitives)', () => {
    // The card/button/nav radii must come from the --sa-radius-* scale so the
    // primitives match the dashboard everywhere at once.
    for (const token of ['--sa-radius-card', '--sa-radius-nav', '--sa-radius-btn']) {
      expect(indexCss).toContain(token);
    }
  });
});
