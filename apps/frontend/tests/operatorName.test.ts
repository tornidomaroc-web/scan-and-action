import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================================
// THE OPERATOR OF SCAN & ACTION IS ABDELFETTAH AMELLAH, AN INDIVIDUAL.
// ============================================================================
// Until 2026-09-29 the Terms and the Privacy Policy named "KnowFlow" as the
// operator. KnowFlow is another of the owner's products, not a legal entity,
// and the App Store account that sells the app is his personal one. A policy
// that names the wrong party is a statement about who is responsible for the
// data, so the name must not drift back in: this file scans every source the
// app ships and every backend source for it.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend
const ROOTS = [join(CWD, 'src'), join(CWD, '..', 'backend', 'src')];
const TEXT = /\.(tsx?|jsx?|html|css|json|md)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    return statSync(p).isDirectory() ? walk(p) : TEXT.test(name) ? [p] : [];
  });
}

const FILES = ROOTS.flatMap(walk);
const read = (p: string) => readFileSync(p, 'utf8');

describe('the operator named on the site and in the app', () => {
  it('no shipped source names KnowFlow', () => {
    const hits = FILES.filter((p) => /know\s*flow/i.test(read(p))).map((p) => relative(CWD, p));
    expect(hits).toEqual([]);
  });

  it('the scanner reads real sources (positive control)', () => {
    // Without this, a walk that found nothing would pass the test above.
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((p) => p.endsWith(join('screens', 'TermsOfService.tsx')))).toBe(true);
    expect(FILES.some((p) => p.includes(join('backend', 'src')))).toBe(true);
    // And the pattern catches the name in the spellings it would come back in.
    for (const s of ['KnowFlow', 'Knowflow', 'Know Flow']) expect(s).toMatch(/know\s*flow/i);
  });

  it('the Terms and the Privacy Policy name the individual operator', () => {
    for (const page of ['TermsOfService', 'PrivacyPolicy']) {
      const src = read(join(CWD, 'src', 'screens', `${page}.tsx`));
      expect(src, page).toMatch(/operated by Abdelfettah Amellah, an individual developer/);
    }
    expect(read(join(CWD, 'src', 'screens', 'TermsOfService.tsx'))).toMatch(/agreement between you and Abdelfettah Amellah/);
  });
});
