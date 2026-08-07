import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ============================================================================
// THE LINE-ENDING POLICY — and why asserting it is not the same as restating it.
// ============================================================================
// .gitattributes carries two rules, and everything about M1a rests on them:
//
//   * text=auto eol=lf      every text file checks out LF, on every platform
//   *.bat text eol=crlf     except Windows batch files, which must keep CRLF
//
// Delete either one and NOTHING ELSE IN THIS REPOSITORY GOES RED. CI runs on
// ubuntu-latest, where checkouts are LF whether or not the first rule exists,
// so the guard that protects Windows developers is invisible to the only
// machine that enforces anything. That is the same shape as gradlew.bat itself
// ("CI runs no Gradle step, so a regression appears only on Windows and only in
// silence") and the same shape that made the backend's dist/ exclude necessary.
//
// WHY THIS IS NOT A STRING MATCH. The obvious version of this file reads
// .gitattributes and asserts it contains "eol=lf". That is theatre: it can only
// ever restate its own input, and it passes for at least one mutation that
// genuinely breaks the policy — SWAPPING THE TWO LINES. Attributes are
// last-match-wins, so with `*.bat text eol=crlf` written ABOVE `* text=auto
// eol=lf`, the global rule wins on .bat files, gradlew.bat checks out LF, and
// cmd.exe stops resolving `goto` against its labels. Both strings are still
// present and in order. A grep-shaped test sees nothing wrong.
//
// So this file never reads .gitattributes for its content. It asks GIT:
//
//   1. `git check-attr` — what does git RESOLVE for this path? This accounts
//      for pattern matching, rule precedence, nested .gitattributes anywhere in
//      the tree, and .git/info/attributes. It is the resolution engine's answer,
//      not the file's text.
//
//   2. `git checkout-index` — what BYTES does a checkout actually produce? This
//      is the end of the causal chain, and it is where the policy either works
//      or does not.
//
// HOW THE WINDOWS-ONLY HALF IS MADE VISIBLE ON LINUX. The reason CI cannot
// currently notice is that Linux never sets core.autocrlf. So section 2 forces
// it: `git -c core.autocrlf=true checkout-index` reproduces, on ubuntu-latest,
// exactly the condition a Windows developer checks out under. With eol=lf in
// force the file still comes out LF; with the rule deleted it comes out CRLF.
// The Windows failure becomes reproducible on the Linux runner, which is the
// whole point of the file.
//
// KNOWN GAPS, STATED RATHER THAN PAPERED OVER:
//
//   - TRIAGE, ESTABLISHED BY MUTATION RATHER THAN ASSUMED. Deleting
//     .gitattributes from the WORKING TREE does not switch the policy off: git
//     falls back to the copy in the index, and check-attr still answers lf and
//     crlf. Verified — renaming the file away leaves all of sections 1-4 green,
//     and only section 0 fires. Read the combination:
//
//         only section 0 red  -> file missing from disk, but THE POLICY IS
//                                STILL IN FORCE from the index. Restore it.
//         sections 1-4 red    -> the policy genuinely is not in force.
//         both red            -> the removal is staged or committed, so it is
//                                gone for every clone, not just this one.
//
//     What check-attr still cannot separate is "the rule was edited away" from
//     "the file was removed from the index" — both resolve to `unspecified`.
//     That residual ambiguity is real, and is stated rather than papered over.
//
//   - Nothing here fires if THIS FILE is deleted or renamed out of the
//     `tests/**/*.test.ts` glob. Vitest would collect one file fewer and report
//     green. This closes the "policy silently weakened" hole, not the "guard
//     silently removed" one — the same gap passwordPolicyDrift.test.ts names.
//
//   - SAMPLE_TEXT_FILES are representative paths, not an exhaustive sweep. If
//     one of them is legitimately renamed, this file fails for a reason that is
//     not a line-ending regression; the assertion messages say so explicitly so
//     nobody "fixes" the policy in response.
//
//   - The `*.png/*.jpg/*.jar binary` lines are deliberately NOT asserted. They
//     are belt-and-braces over text=auto's own heuristic, which classifies those
//     files correctly on its own, so a mutation to them has no observable
//     consequence to pin. Asserting them WOULD be the theatre this file avoids.
// ============================================================================

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const GITATTRIBUTES = join(REPO_ROOT, '.gitattributes');

/** The one file in the repository that must NOT be normalized. */
const BAT_FILE = 'apps/frontend/android/gradlew.bat';

/**
 * Representative tracked text files. verifyRenamedKeyBytes.mjs leads the list
 * deliberately: it still carries a `#!/usr/bin/env node` shebang, and a shebang
 * on a CRLF checkout is precisely the M1a failure — vite's SSR transform hoists
 * the import above it, leaving `#!` mid-line, and rolldown rejects the file.
 * That file is safe today *because of the rule this test defends*, and for no
 * other reason.
 */
const SAMPLE_TEXT_FILES = [
  'apps/frontend/scripts/verifyRenamedKeyBytes.mjs',
  'apps/frontend/scripts/verifyPasswordPolicy.mjs',
  'apps/frontend/src/App.tsx',
  '.github/workflows/ci.yml',
];

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (r.error) throw new Error(`git ${args.join(' ')} could not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/** What git RESOLVES for this path — not what the file says. */
function resolvedAttr(attr: string, path: string): string {
  // Format: "<path>: <attr>: <value>"; the value may itself contain no colons.
  const out = git(['check-attr', attr, '--', path]).trim();
  const marker = `: ${attr}: `;
  const at = out.lastIndexOf(marker);
  if (at === -1) throw new Error(`could not parse check-attr output: ${JSON.stringify(out)}`);
  return out.slice(at + marker.length);
}

/**
 * The bytes a real checkout produces, with core.autocrlf forced to a chosen
 * value so the Windows condition can be reproduced on a Linux runner.
 */
function checkedOutBytes(path: string, autocrlf: 'true' | 'false' | 'input'): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'eolcheck-'));
  git(['-c', `core.autocrlf=${autocrlf}`, 'checkout-index', '-f', '--prefix', `${dir}/`, '--', path]);
  return readFileSync(join(dir, ...path.split('/')));
}

function eolOf(buf: Buffer): 'CRLF' | 'LF' | 'NONE' {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) return 'CRLF';
  }
  return buf.includes(0x0a) ? 'LF' : 'NONE';
}

/**
 * Appended to rule failures. check-attr answers `unspecified` both when a rule
 * was edited away and when .gitattributes was removed from the INDEX, so this
 * points at section 0 to separate them. Note it does NOT say "the file is
 * missing from disk" — that alone leaves the policy in force via the index.
 */
const OR_THE_POLICY_IS_GONE =
  ' (this reads identically whether the rule was edited away or .gitattributes was removed ' +
  'from the index — section 0 separates those. Deleting the file from the working tree ' +
  'ALONE would not cause this, because git falls back to the indexed copy.)';

// ────────────────────────────────────────────────────────────────────────────
// 0. THE DISCRIMINATOR. Read this one first when several sections are red.
// ────────────────────────────────────────────────────────────────────────────
describe('the policy file exists at all', () => {
  it('.gitattributes is present in the working tree', () => {
    expect(
      existsSync(GITATTRIBUTES),
      '.gitattributes is missing from the working tree. Read this together with sections ' +
        '1-4: if THEY are green, the policy is still being enforced from the index and this ' +
        'is a local deletion — restore the file. If they are red too, the removal is staged ' +
        'or committed and every clone has lost the guarantee: Windows checkouts silently ' +
        'revert to CRLF, which re-opens M1a, and gradlew.bat loses its CRLF pin.'
    ).toBe(true);
  });

  it('.gitattributes is TRACKED — an untracked copy protects only this machine', () => {
    // A .gitattributes present on disk but absent from the index would make this
    // suite green locally while every other clone, and CI, had no policy at all.
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.gitattributes'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(
      tracked.status,
      '.gitattributes exists on disk but is NOT tracked by git. It therefore travels to ' +
        'nobody: every other clone, and every CI run, checks out with no line-ending policy ' +
        'at all, while this machine looks correct.'
    ).toBe(0);
  });

  it('git can answer attribute questions here', () => {
    expect(() => resolvedAttr('eol', SAMPLE_TEXT_FILES[0])).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 1. RULE ONE, AS GIT RESOLVES IT: every text file is declared eol=lf.
// ────────────────────────────────────────────────────────────────────────────
describe('rule 1 — text files are declared LF', () => {
  it.each(SAMPLE_TEXT_FILES)('%s resolves to eol=lf', (path) => {
    expect(
      resolvedAttr('eol', path),
      `git resolves eol=${resolvedAttr('eol', path)} for ${path}, not lf. The global ` +
        '`* text=auto eol=lf` rule has been deleted, weakened to a bare `text=auto`, or ' +
        'overridden by a later rule or a nested .gitattributes. Consequence: WINDOWS ' +
        'CHECKOUTS SILENTLY REVERT TO CRLF while this suite stays green on Linux. Note ' +
        '`text=auto` ALONE IS NOT ENOUGH — it normalizes the index, which is already clean, ' +
        'and leaves core.autocrlf free to smudge CRLF back on checkout.' + OR_THE_POLICY_IS_GONE
    ).toBe('lf');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. RULE ONE, AS BYTES. The Windows condition, reproduced on the Linux runner.
//    This is the section that makes the guard visible to CI at all.
// ────────────────────────────────────────────────────────────────────────────
describe('rule 1 — a Windows checkout still produces LF', () => {
  it.each(SAMPLE_TEXT_FILES)('%s checks out LF even with core.autocrlf=true', (path) => {
    expect(
      eolOf(checkedOutBytes(path, 'true')),
      `${path} checks out with CRLF when core.autocrlf=true — which is the default on ` +
        'every Git for Windows install. This is not a hypothetical: it is what a Windows ' +
        'developer gets on their next clone or checkout. A shebang-bearing .mjs in this ' +
        'state fails to parse under vite (rolldown: Invalid Character "!"), and the ' +
        'source-scanning byte-comparison tests compare the wrong bytes. Linux CI cannot ' +
        'see any of it.' + OR_THE_POLICY_IS_GONE
    ).toBe('LF');
  });

  it('the guarantee is the attribute, not the platform (autocrlf=false agrees)', () => {
    expect(eolOf(checkedOutBytes(SAMPLE_TEXT_FILES[0], 'false'))).toBe('LF');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RULE TWO, AS GIT RESOLVES IT. The half that breaks Windows-only, silently.
// ────────────────────────────────────────────────────────────────────────────
describe('rule 2 — gradlew.bat is declared CRLF', () => {
  it('resolves to eol=crlf', () => {
    expect(
      resolvedAttr('eol', BAT_FILE),
      `git resolves eol=${resolvedAttr('eol', BAT_FILE)} for ${BAT_FILE}, not crlf. Either ` +
        '`*.bat text eol=crlf` was deleted/weakened, or — and this is the mutation a ' +
        'grep-shaped test cannot see — IT WAS MOVED ABOVE THE GLOBAL RULE. Attributes are ' +
        'last-match-wins, so the `*` line then wins and .bat files normalize to LF. ' +
        'Consequence: cmd.exe reads gradlew.bat line by line to resolve `goto` against its ' +
        'labels (:execute, :fail, :omega); with LF that parsing misbehaves. It breaks on ' +
        'Windows only, and ci.yml deliberately runs no Gradle step, so nothing else in this ' +
        'repository will ever tell you.' + OR_THE_POLICY_IS_GONE
    ).toBe('crlf');
  });

  it('is still classified as text (a `binary` mutation would strip the pin)', () => {
    // Deliberately "not unset" rather than "=== set". Reordering the two rules
    // leaves this resolving to `auto`, which is still text and still honours
    // eol — so asserting 'set' exactly would ALSO fire on a precedence bug,
    // with a message blaming text-ness for something that is not about it.
    // Only `binary` / `-text` makes the pin inert, and that is what this catches;
    // reordering is caught by the eol assertions above, which say the right thing.
    expect(
      resolvedAttr('text', BAT_FILE),
      `${BAT_FILE} is marked binary (text is unset), so eol=crlf has nothing to act on and ` +
        'the CRLF pin is inert: the file checks out exactly as stored, with no line-ending ' +
        'conversion, on every platform. It is stored LF, so Windows gets LF.' +
        OR_THE_POLICY_IS_GONE
    ).not.toBe('unset');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. RULE TWO, AS BYTES — and the precedence proof.
//    autocrlf=false is the Linux condition: if CRLF still appears, it can ONLY
//    have come from the attribute, which is exactly what we mean to assert.
// ────────────────────────────────────────────────────────────────────────────
describe('rule 2 — gradlew.bat checks out CRLF from the attribute alone', () => {
  it('produces CRLF with core.autocrlf=false', () => {
    expect(
      eolOf(checkedOutBytes(BAT_FILE, 'false')),
      `${BAT_FILE} checked out with LF endings under core.autocrlf=false. Nothing but ` +
        '`*.bat text eol=crlf` can produce CRLF in that configuration, so the pin is not in ' +
        'force. gradlew.bat is stored as LF in the index — the CRLF exists ONLY at checkout ' +
        'time, and only because of that rule.' + OR_THE_POLICY_IS_GONE
    ).toBe('CRLF');
  });

  it('produces CRLF with core.autocrlf=true as well (both platforms agree)', () => {
    expect(eolOf(checkedOutBytes(BAT_FILE, 'true'))).toBe('CRLF');
  });

  it('the two rules do not collide — LF and CRLF files coexist in one checkout', () => {
    // The precedence assertion in its most direct form: if the .bat rule were
    // moved above the global rule, or the global rule were widened to swallow
    // it, these two would come out the same. They must not.
    const bat = eolOf(checkedOutBytes(BAT_FILE, 'false'));
    const src = eolOf(checkedOutBytes(SAMPLE_TEXT_FILES[0], 'false'));
    expect(
      `${src}/${bat}`,
      'the ordering of the two rules in .gitattributes has changed: text files and .bat ' +
        'files now check out with the SAME line ending, so one of the two rules is being ' +
        'shadowed by the other. Last-match-wins — the specific `*.bat` rule must come AFTER ' +
        'the general `*` rule.' + OR_THE_POLICY_IS_GONE
    ).toBe('LF/CRLF');
  });
});
