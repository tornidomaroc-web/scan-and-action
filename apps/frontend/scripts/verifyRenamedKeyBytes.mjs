#!/usr/bin/env node
/**
 * Rename-time proof: passwordTooShort carries the SAME approved bytes that
 * resetPasswordTooShort carried before the rename — read from the git blob at
 * the base commit, never from a copy living in a test file.
 *
 * WHY THIS IS A SCRIPT AND NOT A VITEST TEST. The comparison needs the OLD
 * blob, which means git history. CI checks out with actions/checkout@v4 and no
 * fetch-depth, i.e. depth 1, so `git show <base-sha>:<path>` cannot resolve
 * there. Two bad options were rejected:
 *   - a test that skips when history is missing: it would skip in CI, which is
 *     the only place it would ever run unattended, and a silently-skipped guard
 *     is worse than no guard because it reads as coverage;
 *   - fetch-depth: 0 on every CI run forever, to prove something that only
 *     needed proving once, in this PR.
 * So it is a manual, read-only gate, the same shape as
 * apps/backend/scripts/verifyEntitlement.ts. Run it on the PR, paste the
 * output, and never think about it again.
 *
 * Read-only. Touches no file, no network, no database. Exits non-zero on any
 * difference so it can gate by hand.
 *
 *   node apps/frontend/scripts/verifyRenamedKeyBytes.mjs [baseSha]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CATALOG = 'apps/frontend/src/i18n/strings.ts';
const OLD_KEY = 'resetPasswordTooShort';
const NEW_KEY = 'passwordTooShort';
const LOCALES = ['en', 'fr', 'ar'];

// main as it stood immediately before this branch — the commit that carries the
// approved wording under its old name.
const BASE = process.argv[2] ?? 'aaea7ece7ccace87f59c82ffff9496dc4d9aa00f';

const cps = (s) => [...s].map((c) => c.codePointAt(0));

/** All values of `key: '...'` in file order. The catalog is en, then fr, then ar. */
function extract(source, key) {
  const re = new RegExp(`^\\s*${key}: '(.*)',$`, 'gm');
  return [...source.matchAll(re)].map((m) => m[1]);
}

let repoRoot;
try {
  repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch {
  console.error('[verify-bytes][ERROR] not inside a git repository');
  process.exit(1);
}

let oldSource;
try {
  oldSource = execFileSync('git', ['show', `${BASE}:${CATALOG}`], {
    encoding: 'utf8',
    cwd: repoRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
} catch {
  console.error(
    `[verify-bytes][ERROR] cannot read ${CATALOG} at ${BASE}. A shallow clone ` +
      `(CI default) will not have it; run this in a full clone.`
  );
  process.exit(1);
}

const newSource = readFileSync(`${repoRoot}/${CATALOG}`, 'utf8');

const before = extract(oldSource, OLD_KEY);
const after = extract(newSource, NEW_KEY);

console.log(`[verify-bytes] base commit      : ${BASE}`);
console.log(`[verify-bytes] old key          : ${OLD_KEY}  (${before.length} value(s) found)`);
console.log(`[verify-bytes] new key          : ${NEW_KEY}  (${after.length} value(s) found)`);

if (before.length !== LOCALES.length || after.length !== LOCALES.length) {
  console.error(
    `[verify-bytes][FAIL] expected exactly ${LOCALES.length} values per key ` +
      `(en, fr, ar). Extraction found ${before.length} old and ${after.length} new — ` +
      `the regex did not see what it expected, so NOTHING here is proven.`
  );
  process.exit(1);
}

// The old key must be gone entirely; a leftover would mean two spellings of the
// same sentence, which is the thing the rename exists to prevent.
const strays = extract(newSource, OLD_KEY);
if (strays.length !== 0) {
  console.error(`[verify-bytes][FAIL] ${OLD_KEY} still present in the catalog (${strays.length}x)`);
  process.exit(1);
}

let bad = 0;
for (let i = 0; i < LOCALES.length; i++) {
  const a = cps(before[i]);
  const b = cps(after[i]);
  const same = a.length === b.length && a.every((v, j) => v === b[j]);
  console.log(`\n[verify-bytes] ${LOCALES[i]}:`);
  console.log(`  before (${OLD_KEY}) : ${JSON.stringify(a)}`);
  console.log(`  after  (${NEW_KEY}) : ${JSON.stringify(b)}`);
  console.log(`  identical            : ${same ? 'YES' : 'NO'}`);
  if (!same) bad++;
}

if (bad > 0) {
  console.error(
    `\n[verify-bytes][FAIL] ${bad} locale(s) changed. The rename was supposed to move ` +
      `approved text, not re-author it. Anything that changed here needs sign-off.`
  );
  process.exit(1);
}

console.log(
  `\n[verify-bytes][PASS] all ${LOCALES.length} locales byte-identical to the approved text at ${BASE}. ` +
    `No new copy was authored; nothing needs re-approval.`
);
