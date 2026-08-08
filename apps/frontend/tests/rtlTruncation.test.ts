import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// RTL TRUNCATION — app-wide source guard (Class A)
// ============================================================================
// <bdi> is a bidi ISOLATE. dir="auto" takes its direction from the first strong
// character of the element's OWN text, and it does not look inside an isolate.
// So this shape:
//
//     <p className="truncate ..." dir="auto"><bdi>{fileName}</bdi></p>
//
// finds no strong character, falls back to LTR, and the truncating box clips the
// LEADING (identifying) end of an Arabic filename — the user loses the part of
// the name that tells them which document it is. Measured in Chrome: it kept
// "…مغربية_مارس_2026_نسخة_نهائية.pdf" and threw away "فاتورة_شركة_الاتصالات_ال".
//
// The canonical idiom for a truncating box holding ONE mixed-direction user
// string is dir="auto" ON the truncating element, with NO isolate child stealing
// it. <bdi> remains correct — and must be kept — where a value renders INLINE
// beside other text (an amount or date next to a label), because there the
// isolate is what stops the neighbours from scrambling.
//
// HONEST LIMIT OF THIS GUARD: it covers Class A (an isolate swallowing dir="auto"
// on a truncating box) only. It CANNOT catch Class B — a truncating box holding
// user text with NO dir at all, which then inherits the page direction and clips
// a *Latin* filename from its leading end in the Arabic UI. Source alone cannot
// distinguish a box holding a filename from one holding an i18n label (the
// status-label spans truncate too, and correctly inherit the locale direction),
// so Class B is guarded per-screen at the DOM level instead, not here.
// ============================================================================

// Resolved from the vitest root (apps/frontend), not import.meta.url: this file
// scans a DIRECTORY, and the jsdom environment does not reliably hand back a
// file: URL for a directory specifier.
const SRC = join(process.cwd(), 'src');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });

// A truncating element whose very next child is a <bdi> isolate. Whitespace- and
// newline-tolerant so the multi-line form is caught too:
//   <h1 className="... truncate ..." dir="auto">
//     <bdi>{doc.originalFileName}</bdi>
//   </h1>
const ANTI_PATTERN = /className="[^"]*\btruncate\b[^"]*"\s+dir="auto"\s*>\s*<bdi/;

describe('RTL truncation — the <bdi>-inside-a-truncating-box anti-pattern (app-wide)', () => {
  const files = walk(SRC);

  it('scans a non-trivial number of source files (the walker actually works)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no source file puts a <bdi> isolate inside a truncating dir="auto" box', () => {
    const offenders = files.filter((f) => ANTI_PATTERN.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('the guard actually detects the shape it claims to (positive control)', () => {
    expect(ANTI_PATTERN.test('<p className="truncate text-sm" dir="auto"><bdi>{name}</bdi></p>')).toBe(true);
    // multi-line form
    expect(
      ANTI_PATTERN.test('<h1 className="mb-2 truncate text-title-lg" dir="auto">\n  <bdi>{name}</bdi>\n</h1>')
    ).toBe(true);
    // legitimate inline isolate beside other text — must NOT trip the guard
    expect(ANTI_PATTERN.test('<span dir="auto"><bdi>{dateStr}</bdi></span>')).toBe(false);
    // legitimate wrapping (never-truncated) value — must NOT trip the guard
    expect(
      ANTI_PATTERN.test('<span className="min-w-0 break-words text-sm" dir="auto"><bdi>{ent.name}</bdi></span>')
    ).toBe(false);
  });
});

// ============================================================================
// CLASS B — a truncating box holding user data with NO dir at all
// ============================================================================
// Class B cannot be guarded in general: source cannot tell a box holding a
// filename from one holding an i18n label, and the status-label spans truncate
// too and CORRECTLY inherit the locale direction. A guard that fires on those
// gets suppressed, and a suppressed guard guards nothing.
//
// So this rule is deliberately NARROW. It fires only on an allowlist of three
// identifiers whose content is unambiguously user data of unknown direction:
//
//     fileName | originalFileName | email
//
// THE EXCLUSION IS THE LOAD-BEARING PART, not the inclusion. Names that also
// denote i18n strings are deliberately OUT: `label`, `title`, `name`, `userName`,
// `vendor`, `category`. Those elements still need a dir when they hold user data
// — SettingsScreen's {userName} does, and carries dir="auto" — but that is
// enforced per-screen at the DOM level, where a human decided which it is. This
// rule buys only the case a future author is most likely to add blind: another
// filename or email box.
//
// WHAT IF A TRUNCATING {fileName} BOX LEGITIMATELY SHOULD NOT CARRY dir?
// That case does not exist, and the rule is built so it could not block one if
// it did: the rule demands the PRESENCE of a dir attribute, never a particular
// value. dir="auto" (unknown direction), dir="ltr" (identifier structure, as the
// email uses) and dir="rtl" all satisfy it. A filename's direction is a property
// of the DATA, never of the UI language, so inheriting the ambient page direction
// is never the right answer — it is only ever the unconsidered one. The rule is
// unsatisfiable by silence and satisfiable by any stated intent, which is exactly
// the line it is meant to draw.
//
// HONEST LIMIT: like everything else in this file, green means the attribute is
// PRESENT. It does not mean the ellipsis lands on the correct side. jsdom has no
// layout engine and no bidi resolution, so no test in this repo can establish
// that. The instrument itself was proven once by hand in Chrome (see the measured
// strings at the top of this file); these guards only stop it being dropped.
// ============================================================================

// A truncating element and its content, paired by tag name. Non-greedy content,
// so the nearest matching close tag wins.
const TRUNCATING_ELEMENT = /<(p|span|div|h[1-6])\b([^>]*\btruncate\b[^>]*)>([\s\S]*?)<\/\1>/g;

// Unambiguous user-data identifiers. See the exclusion note above before adding.
const USER_DATA = /\b(fileName|originalFileName|email)\b/;

const HAS_DIR = /\bdir\s*=/;

/** Returns every truncating element seen, and the subset that holds allowlisted
 *  user data without any dir attribute. */
const scanClassB = (src: string) => {
  const scanned: { attrs: string; content: string }[] = [];
  const offenders: string[] = [];
  for (const m of src.matchAll(TRUNCATING_ELEMENT)) {
    const [, , attrs, content] = m;
    scanned.push({ attrs, content });
    if (USER_DATA.test(content) || USER_DATA.test(attrs)) {
      if (!HAS_DIR.test(attrs)) offenders.push(`${attrs.trim().slice(0, 70)} >>> ${content.trim().slice(0, 40)}`);
    }
  }
  return { scanned, offenders };
};

describe('RTL truncation — Class B: a truncating filename/email box must state a direction', () => {
  const files = walk(SRC);

  it('positive control: the rule catches a truncating {fileName} box with no dir', () => {
    expect(scanClassB('<p className="flex-1 truncate">{job.fileName}</p>').offenders).toHaveLength(1);
    expect(scanClassB('<h1 className="truncate">{doc.originalFileName}</h1>').offenders).toHaveLength(1);
    expect(scanClassB('<p className="truncate" title={user?.email}>{user?.email}</p>').offenders).toHaveLength(1);
  });

  it('the rule is satisfied by ANY stated direction, not just dir="auto"', () => {
    expect(scanClassB('<p dir="auto" className="truncate">{job.fileName}</p>').offenders).toEqual([]);
    expect(scanClassB('<p dir="ltr" className="truncate">{user?.email}</p>').offenders).toEqual([]);
    expect(scanClassB('<p dir="rtl" className="truncate">{job.fileName}</p>').offenders).toEqual([]);
  });

  it('EXCLUSION control: a truncating i18n-label span with no dir is NOT an offender', () => {
    // This is the shape the guard must tolerate or it gets suppressed. It is
    // scanned (so the rule really looked at it) and deliberately not flagged.
    const labelSpan = '<span className={`truncate text-xs font-medium ${status.text}`}>{status.label}</span>';
    const r = scanClassB(labelSpan);
    expect(r.scanned).toHaveLength(1);
    expect(r.offenders).toEqual([]);
    expect(scanClassB('<span className="flex-1 truncate text-sm">{meta.label}</span>').offenders).toEqual([]);
  });

  it('EXCLUSION holds against CURRENT code: every real i18n-label truncating span is scanned and cleared', () => {
    // Not asserted in the abstract — these are the live spans the guard must not
    // fire on. Each is read from the real file, confirmed to truncate, confirmed
    // to carry no dir, and confirmed to produce zero offenders.
    const LABEL_SITES = [
      ['components/ResultTable.tsx', 'status.label'],
      ['screens/ActivityScreen.tsx', 'status.label'],
      ['screens/DashboardScreen.tsx', 'meta.label'],
      ['screens/DocumentDetailScreen.tsx', 'status.label'],
      ['screens/ReviewQueueScreen.tsx', 'status.label'],
    ] as const;

    for (const [rel, expr] of LABEL_SITES) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      const { scanned, offenders } = scanClassB(src);
      const labelBoxes = scanned.filter((e) => e.content.includes(expr));
      expect(labelBoxes.length, `${rel}: expected a truncating {${expr}} span to exist`).toBeGreaterThan(0);
      // it genuinely has no dir — so it is only cleared by the allowlist, not by luck
      expect(labelBoxes.some((e) => !HAS_DIR.test(e.attrs)), `${rel}: the {${expr}} span should carry no dir`).toBe(true);
      expect(offenders, `${rel}: guard must not fire on i18n labels`).toEqual([]);
    }
  });

  it('the scan reaches a non-trivial number of truncating elements app-wide', () => {
    const total = files.reduce((n, f) => n + scanClassB(readFileSync(f, 'utf8')).scanned.length, 0);
    expect(total).toBeGreaterThan(10);
  });

  it('no truncating filename/email box in the app is missing a direction', () => {
    const offenders = files.flatMap((f) => {
      const { offenders: o } = scanClassB(readFileSync(f, 'utf8'));
      return o.map((x) => `${f.slice(SRC.length + 1)}: ${x}`);
    });
    expect(offenders).toEqual([]);
  });
});
