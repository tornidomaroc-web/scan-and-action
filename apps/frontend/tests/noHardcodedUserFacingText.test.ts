import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

// ============================================================================
// STRUCTURAL SINK GUARD — audit #7 PR 3, Part 1.
// ============================================================================
// The #118 guard compares rendered text against the EN catalog, so it is
// structurally blind to a hardcoded literal that was never a catalog key —
// which is the entire #7 bug class (docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md
// §5). This guard targets the SHAPE instead: "a bare string literal reached a
// user-facing sink". It never asks "is this English?", so legitimate Latin —
// filenames, merchant names, PRO, CSV, MAD, emails — cannot false-positive.
//
// MECHANISM: a vitest source scan over the TypeScript AST, NOT an ESLint rule.
// Three reasons, all verified against this repo:
//   1. apps/frontend has ESLint 9 deps installed but NO flat config; `npm run
//      lint` currently errors out. An ESLint rule would mean authoring a whole
//      eslint.config.js — a toolchain change this PR is not allowed to make.
//   2. .github/workflows/ci.yml runs `npm ci`, `npm test`, `npm run build`,
//      `npx cap sync android`. It does NOT run lint. An ESLint rule would gate
//      nothing without also editing CI.
//   3. `npm test` IS the required check ("Frontend — typecheck & build"), so a
//      vitest guard fails CI on the exact path that already gates merges.
// The AST (not a regex) is what makes this precise: it can tell a bare literal
// from a template literal carrying an interpolated, localized value.
// ============================================================================

const SRC = path.resolve(__dirname, '../src');

// The user-facing sinks. Confirmed against current source:
//   showToast   — contexts/ToastContext.tsx:13,21 (the app-wide toast API)
//   setError    — useState setters in AuthScreen, DashboardScreen,
//                 ActivityScreen, DeleteAccountModal, FixActionPanel
//   setErrorMsg — useState setters in DocumentDetailScreen, ReviewQueueScreen,
//                 SearchScreen
// All three render their argument directly to the user.
const SINKS = ['showToast', 'setError', 'setErrorMsg'];

// Core component set: everything a user actually looks at. Deliberately the
// whole of components/ + screens/ + contexts/ rather than a curated list, so a
// NEW file is covered the day it lands instead of being silently outside scope.
const CORE_DIRS = ['components', 'screens', 'contexts'];

// ── Known-unremediated sites: audit #7 PR 2, NOT YET LANDED. ────────────────
// These are REAL LEAKS, not legitimate exceptions. They are pinned here rather
// than suppressed, and the test asserts this set matches EXACTLY:
//   - add a new literal to these files  -> set no longer matches -> FAIL
//   - PR 2 fixes them                   -> set no longer matches -> FAIL,
//                                          forcing this list to be emptied
// So it is a self-retiring ratchet, not an exclusion. Nothing is hidden.
// Fixing them here is out of scope: this PR changes no app behavior or strings.
const KNOWN_PENDING_PR2 = [
  'components/Sidebar.tsx:73 showToast',
  'screens/DashboardScreen.tsx:135 setError',
  'screens/DashboardScreen.tsx:137 setError',
  'screens/DashboardScreen.tsx:142 setError',
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function coreFiles(): string[] {
  return CORE_DIRS.flatMap((d) => {
    const full = path.join(SRC, d);
    return fs.existsSync(full) ? walkFiles(full) : [];
  }).sort();
}

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

interface Violation {
  id: string;
  text: string;
}

// A literal reaching a sink. What counts:
//   showToast('Upload failed')          -> VIOLATION (bare literal)
//   showToast(`Upload failed`)          -> VIOLATION (template, no expression)
//   showToast(s.uploadFailed)           -> ok (catalog reference)
//   showToast(`${f.name}: ${tr(s)}`)    -> ok (interpolated; content localized)
//   setError('')                        -> ok (state clear, renders nothing)
// The empty-string allowance is a RULE property, not an exception list: an
// empty string is a reset, never user-facing copy.
function scanSinks(file: string): Violation[] {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Violation[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.getText(sf)
        : node.expression.getText(sf);
      if (SINKS.includes(callee) && node.arguments.length > 0) {
        const arg = node.arguments[0];
        let bad: string | null = null;
        if (ts.isStringLiteral(arg) && arg.text.trim() !== '') bad = arg.text;
        else if (ts.isNoSubstitutionTemplateLiteral(arg) && arg.text.trim() !== '') bad = arg.text;
        if (bad !== null) {
          const line = sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line + 1;
          found.push({ id: `${rel(file)}:${line} ${callee}`, text: bad });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('structural sink guard — no bare string literals reach user-facing sinks', () => {
  it('scans a non-trivial core set (guard is actually pointed at the app)', () => {
    const files = coreFiles();
    // Sanity: if a refactor moves these dirs, the guard must fail loudly rather
    // than silently scan nothing and report success.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => rel(f) === 'contexts/ProcessingContext.tsx')).toBe(true);
    expect(files.some((f) => rel(f) === 'components/UploadModal.tsx')).toBe(true);
  });

  it('finds NO literal at a sink outside the pinned PR-2 set', () => {
    const violations = coreFiles().flatMap(scanSinks);
    const unexpected = violations.filter((v) => !KNOWN_PENDING_PR2.includes(v.id));
    expect(
      unexpected.map((v) => `${v.id} -> ${JSON.stringify(v.text)}`),
      'A hardcoded user-facing string reached a toast/error sink. Route it through the ' +
        's.* catalog (src/i18n/strings.ts) instead — see docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md.'
    ).toEqual([]);
  });

  it('the pinned PR-2 leak set is EXACTLY as recorded (ratchet: fixes and regressions both fail)', () => {
    const ids = coreFiles().flatMap(scanSinks).map((v) => v.id).sort();
    expect(
      ids,
      'The known-unremediated set drifted. If audit #7 PR 2 fixed these, DELETE the ' +
        'corresponding entries from KNOWN_PENDING_PR2 (that is the intended retirement ' +
        'path). If something new appeared, it is a new leak — localize it.'
    ).toEqual([...KNOWN_PENDING_PR2].sort());
  });
});

// ============================================================================
// NOT BUILT HERE: the hardcoded-JSX-text half of the guard.
// ============================================================================
// The recon (§5) paired the sink guard with a "no raw JSX text node" guard over
// the same core set. Measured against current main it reports 123 violations,
// and 115 of them sit in five files that are DEFERRED BY PRODUCT DECISION, not
// broken: LandingScreen (51), DeleteAccountInfo (21), PrivacyPolicy (18),
// TermsOfService (14), RefundPolicy (12). Recon §6 defers Landing + legal pages
// because they render before any language switcher exists — localizing them is
// really "add Accept-Language detection for anonymous visitors", a product call.
//
// Making that guard green today would take five whole-file exclusions plus a
// brand-token allowlist (AppLogo "Scan"/"Action"/"Intelligence OS", Layout
// "Scan & Action"). That is a whitelist-driven guard — the same shape §5 rejects
// as a TRAP, just in different dress — so it is deliberately NOT built here.
// It belongs in its own PR once the marketing/legal deferral is decided.
//
// The census was still worth running: it surfaced two leaks the recon never
// listed, both real and both outside PR 2's scope —
//   src/components/Sidebar.tsx:107      "New Scan"
//   src/screens/ProfileScreen.tsx       "Security, notifications, and subscription
//                                        management are under development."
// Neither is fixed here (this PR changes no app behavior).
// ============================================================================
