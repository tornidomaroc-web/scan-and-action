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
