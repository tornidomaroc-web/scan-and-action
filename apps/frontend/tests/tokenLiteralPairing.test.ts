import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// ============================================================================
// A COLOUR THAT FLIPS MUST NOT BE PAIRED WITH ONE THAT CANNOT.
// ============================================================================
// This is the bug class, stated once, so it stops being rediscovered:
//
//   `bg-ink text-white` paints the background with a token that inverts under
//   `.dark` and the foreground with a literal that does not. In light mode
//   #1A1F36 on #FFFFFF is 16.24:1; in dark mode #F8FAFC on #FFFFFF is 1.05:1.
//   Nothing about the class string says so, and no test caught it until a
//   person looked at a phone.
//
// It has now been found FOUR times on one route — the landing header's CTA
// (#213) and the hero, pricing and final CTAs (this PR) — and it is not a
// property of that route. It can occur anywhere a token colour meets a literal
// one, in either direction:
//
//   token background + literal foreground   (bg-ink text-white)
//   token foreground + literal background   (text-warning-text on bg-slate-50)
//
// The second form is why the hero mock's "Fix required" label measured 4.05:1
// pinned and 1.60:1 unpinned: the label was tokenised inside a picture built
// from palette literals, so it flipped while the picture did not.
//
// `landingLightPin.test.tsx` guards ONE route's pin. This guards the pattern,
// everywhere, and is deliberately independent of whether any route is pinned —
// a pin hides this defect rather than fixing it.
//
// ── WHAT THIS CANNOT DO ────────────────────────────────────────────────────
// jsdom resolves no var() and applies no stylesheet, so this is a SOURCE scan,
// not a contrast measurement. It proves the PAIRING is absent, not that any
// particular contrast passes. The numbers below were measured in a browser and
// are recorded so the ratchet entries are evidence rather than a shrug.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend

/** Tokens whose value actually differs between `:root` and `.dark`. Derived
 *  from tokens.css — a hardcoded list would rot the moment a token is added. */
function flippingVars(): Set<string> {
  const css = readFileSync(join(CWD, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = (sel: string) => {
    const i = css.indexOf(sel + ' {');
    expect(i, `tokens.css has no ${sel} block`).toBeGreaterThan(-1);
    const body = css.slice(i + sel.length + 2, css.indexOf('}', i));
    return Object.fromEntries(
      [...body.matchAll(/(--sa-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  };
  const root = block(':root');
  const dark = block('.dark');
  return new Set(Object.keys(root).filter((k) => k in dark && root[k] !== dark[k]));
}

/** Tailwind utility name -> CSS variable, read out of the real config object. */
function flippingUtilities(): string[] {
  const flip = flippingVars();
  const cfg = createRequire(import.meta.url)(join(CWD, 'tailwind.config.cjs'));
  const colors = cfg.theme.extend.colors as Record<string, unknown>;
  const out: string[] = [];
  const add = (name: string, value: unknown) => {
    const m = typeof value === 'string' && value.match(/var\((--sa-[a-z0-9-]+)\)/);
    if (m && flip.has(m[1])) out.push(name);
  };
  for (const [group, val] of Object.entries(colors)) {
    if (typeof val === 'string') add(group, val);
    else for (const [k, v] of Object.entries(val as Record<string, unknown>))
      add(k === 'DEFAULT' ? group : `${group}-${k}`, v);
  }
  return out.sort((a, b) => b.length - a.length);
}

const PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|' +
  'blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}';
const LITERAL = `(?:white|black|${PALETTE})`;

interface Hit { file: string; line: number; kind: string; cls: string; key: string }

function scan(): Hit[] {
  const U = flippingUtilities();
  expect(U.length, 'no flipping utilities found — the deriver is broken').toBeGreaterThan(0);
  const alt = U.join('|');
  const tokBg = new RegExp(`(?<![\\w:-])bg-(?:${alt})(?![\\w-])`);
  const tokFg = new RegExp(`(?<![\\w:-])text-(?:${alt})(?![\\w-])`);
  const litFg = new RegExp(`(?<![\\w:-])text-${LITERAL}(?![\\w-])`);
  const litBg = new RegExp(`(?<![\\w:-])bg-${LITERAL}(?![\\w-])`);

  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/[.]tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(join(CWD, 'src'));

  const hits: Hit[] = [];
  for (const p of files.sort()) {
    // Strip comments: these files NAME the broken pairing in prose explaining it.
    const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));
    const rel = p.slice(join(CWD, 'src').length + 1).split(/[\\/]/).join('/');
    src.split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      for (const m of line.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
        const cls = (m[1] ?? m[2] ?? m[3]) as string;
        const bgLit = tokBg.test(cls) && litFg.test(cls) && !/dark:text-/.test(cls);
        const fgLit = tokFg.test(cls) && litBg.test(cls) && !/dark:bg-/.test(cls);
        if (!bgLit && !fgLit) continue;
        const token = (cls.match(bgLit ? tokBg : tokFg) ?? [''])[0];
        const literal = (cls.match(bgLit ? litFg : litBg) ?? [''])[0];
        hits.push({
          file: rel, line: i + 1,
          kind: bgLit ? 'token-bg + literal-fg' : 'token-fg + literal-bg',
          cls,
          // KEYED ON file + the offending PAIR, never on the line number: a pin
          // keyed to a line reports every entry below an inserted comment as a
          // brand-new violation. This repo has been bitten by that before.
          key: `${rel} :: ${token} + ${literal}`,
        });
      }
    });
  }
  return hits;
}

// ── KNOWN, PRE-EXISTING, AND MEASURED ──────────────────────────────────────
// Six instances in the authenticated app, all `text-white` on a semantic fill.
// Measured in a browser; the floor for these 14px semibold button labels is
// 4.5:1 and every one of them is under it:
//
//   bg-success  light #2E9E6B 3.38:1   dark #4ADE80 1.74:1
//   bg-danger   light #D9584A 3.86:1   dark #F87171 2.77:1
//   bg-warning  light #E0A33E 2.22:1   dark #F5C368 1.63:1
//
// They are NOT fixed here: they belong to step 3, and changing a semantic fill
// or its foreground is a palette decision, not a rename. The ratchet is TWO-WAY
// — an entry whose violation no longer exists fails as loudly as a new one — so
// this list cannot quietly outlive the defect it records.
const KNOWN: string[] = [
  'components/BottomTabBar.tsx :: bg-warning + text-white',
  'components/FixActionPanel.tsx :: bg-success + text-white',
  'screens/DocumentDetailScreen.tsx :: bg-success + text-white',
  'screens/DocumentDetailScreen.tsx :: bg-danger + text-white',
  'screens/ReviewQueueScreen.tsx :: bg-success + text-white',
  'screens/ReviewQueueScreen.tsx :: bg-danger + text-white',
];

describe('a flipping token is never paired with a literal', () => {
  const hits = scan();

  it('introduces no NEW pairing anywhere in src/', () => {
    const remaining = [...KNOWN];
    const unexpected = hits.filter((h) => {
      const at = remaining.indexOf(h.key);
      if (at === -1) return true;
      remaining.splice(at, 1);
      return false;
    });
    expect(
      unexpected.map((h) => `${h.file}:${h.line}  [${h.kind}]  ${h.cls.slice(0, 90)}`),
      'a token colour paired with a literal one — it will invert on one side only',
    ).toEqual([]);
  });

  it('and every pinned entry still exists (the ratchet is two-way)', () => {
    const keys = hits.map((h) => h.key);
    const stale = KNOWN.filter((k) => !keys.includes(k));
    expect(stale, 'these were fixed — delete them from KNOWN rather than leaving a false record').toEqual([]);
  });

  it('the unregistered routes carry none of it at all', () => {
    // These are the routes a logged-out visitor meets, and the four instances
    // fixed in #213 and this PR all lived here.
    const PUBLIC = /^(components\/LandingHeader|screens\/(LandingScreen|PrivacyPolicy|TermsOfService|RefundPolicy|DeleteAccountInfo))\.tsx$/;
    expect(hits.filter((h) => PUBLIC.test(h.file)).map((h) => `${h.file}:${h.line} ${h.cls.slice(0, 70)}`)).toEqual([]);
  });

  it('the scanner can see a pairing when one exists (positive control)', () => {
    // Without this, a broken regex would report zero everywhere and every
    // assertion above would pass vacuously.
    expect(hits.length, 'the scanner found nothing at all — it is broken, not the tree').toBeGreaterThan(0);
    expect(hits.map((h) => h.key)).toContain('screens/ReviewQueueScreen.tsx :: bg-danger + text-white');
  });
});
