import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// ============================================================================
// THE DRIFT CHECK — and the two ways it can rot into decoration.
// ============================================================================
// scripts/verifyPasswordPolicy.mjs is the only thing in this repository that
// can notice the Supabase password minimum moving. Everything else pins the
// repo against itself: the tripwire in authPasswordLength.test.tsx asserts our
// constant is 8, which stays green forever no matter what production does.
//
// So this file guards the two failures that would make the check pass while
// checking nothing, both of which are invisible in a green suite:
//
//   1. THE COMPARISON BREAKS. Flip `!==` to `===`, or neuter the DRIFT branch
//      into a PASS, and the job goes green on every future dashboard change.
//      A production policy change would go unnoticed indefinitely.
//   2. UNREACHABLE AND DRIFT GET CONFUSED. If an outage is reported as DRIFT
//      the badge cries wolf and gets ignored; if a real contradiction is
//      reported as UNREACHABLE it never turns red at all. Both directions are
//      asserted below, not described.
//   3. THIS FILE, OR THE SCRIPT, STOPS RUNNING AT ALL. Sections 1-5 test what
//      the check DECIDES. They are worth nothing if the module never loads or
//      the workflow's command no longer resolves to a runnable script, and
//      that failure does not look like a failing assertion — it looks like a
//      file reporting "no tests", or like a job that passes without checking
//      anything. Section 6 is that guard, and it exists because this has
//      already happened once: a copied shebang stopped this entire file from
//      loading on every CRLF checkout while CI stayed green.
//
// The safety property of the probe itself — one character, never "minimum - 1"
// — is pinned in section 4, because the tempting "improvement" creates a weak
// production account in exactly the alarm condition.
//
// KNOWN GAP, STATED RATHER THAN PAPERED OVER: nothing here fires if this FILE
// is deleted or renamed out of the `tests/**/*.test.{ts,tsx}` glob. Vitest
// would simply collect one file fewer and report all green. Section 6 closes
// the "stops loading" hole, not the "stops existing" one.
// ============================================================================

import {
  OUTCOME,
  PROBE_PASSWORD,
  parseExpectedMinimum,
  parseObservedMinimum,
  classify,
  probeWithRetries,
  main,
  // @ts-expect-error — plain .mjs module, no types, deliberately
} from '../scripts/verifyPasswordPolicy.mjs';

const POLICY_SOURCE = readFileSync(join(__dirname, '..', 'src', 'lib', 'passwordPolicy.ts'), 'utf8');

// ────────────────────────────────────────────────────────────────────────────
// 1. THE EXPECTED NUMBER COMES FROM THE REPO, NOT FROM YAML.
// ────────────────────────────────────────────────────────────────────────────
describe('the expected minimum is read from passwordPolicy.ts', () => {
  it('parses the real constant out of the real file', () => {
    expect(parseExpectedMinimum(POLICY_SOURCE)).toBe(8);
  });

  it('agrees with what the module actually exports (no second source of truth)', async () => {
    const mod = await import('../src/lib/passwordPolicy');
    expect(
      parseExpectedMinimum(POLICY_SOURCE),
      'the script reads a different number than the module exports — one of them is lying'
    ).toBe(mod.PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH);
  });

  // Without this, a mutation that hardcodes `return 8` survives: the check
  // would still pass today and would silently stop tracking the repo the
  // moment the constant moved.
  it('actually READS the value — it does not return a constant', () => {
    for (const n of [6, 10, 42]) {
      expect(
        parseExpectedMinimum(`export const PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH = ${n};`),
        'parseExpectedMinimum ignored the source and returned a fixed number, so the check no ' +
          'longer compares production against the repo at all'
      ).toBe(n);
    }
  });

  it('throws rather than guessing if the constant is renamed or deleted', () => {
    expect(() => parseExpectedMinimum('export const SOMETHING_ELSE = 8;')).toThrow(
      /PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH/
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. THE COMPARISON. This is the mutation that matters most.
// ────────────────────────────────────────────────────────────────────────────
describe('a production number that disagrees with the repo is DRIFT', () => {
  const answer = (n: number) => ({
    status: 422,
    body: { error_code: 'weak_password', msg: `Password should be at least ${n} characters.` },
  });

  it('matching numbers PASS', () => {
    expect(classify({ ...answer(8), expected: 8 }).outcome).toBe(OUTCOME.PASS);
  });

  it('a LOWER production minimum is DRIFT — the dashboard was weakened', () => {
    const r = classify({ ...answer(6), expected: 8 });
    expect(
      r.outcome,
      'production dropped to 6 while the repo claims 8 and the check went green. ' +
        'A PRODUCTION POLICY CHANGE WOULD NOW GO UNNOTICED — this is the entire purpose of the script.'
    ).toBe(OUTCOME.DRIFT);
    expect(r.message).toContain('6');
    expect(r.message).toContain('8');
  });

  it('a HIGHER production minimum is DRIFT too — the repo must not overstate OR understate', () => {
    expect(
      classify({ ...answer(10), expected: 8 }).outcome,
      'production moved up and the check stayed green; the repo now understates the real minimum ' +
        'and A PRODUCTION POLICY CHANGE WOULD GO UNNOTICED'
    ).toBe(OUTCOME.DRIFT);
  });

  it('every disagreeing value in a wide range is DRIFT, not just the neighbours', () => {
    for (const n of [1, 2, 5, 6, 7, 9, 12, 64]) {
      expect(
        classify({ ...answer(n), expected: 8 }).outcome,
        `production reported ${n} against a repo claim of 8 and the check did not go red`
      ).toBe(OUTCOME.DRIFT);
    }
  });

  it('DRIFT is the only outcome that can turn the badge red', async () => {
    const drift = await main(
      { SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'k' },
      { fetchImpl: async () => new Response(JSON.stringify({ error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }), { status: 422 }) }
    );
    expect(drift, 'DRIFT did not produce a non-zero exit, so CI would stay green on a real change').toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. UNREACHABLE IS NOT DRIFT, AND DRIFT IS NOT UNREACHABLE.
// ────────────────────────────────────────────────────────────────────────────
describe('outage and contradiction are never confused', () => {
  it('a transport failure is UNREACHABLE, never DRIFT', () => {
    const r = classify({ transportError: 'getaddrinfo ENOTFOUND', expected: 8 });
    expect(
      r.outcome,
      'an outage was reported as a policy change; the badge cries wolf and gets ignored'
    ).toBe(OUTCOME.UNREACHABLE);
    expect(r.message).toMatch(/^PROBE-UNREACHABLE:/);
  });

  it('a 5xx is UNREACHABLE, never DRIFT', () => {
    expect(classify({ status: 503, body: null, expected: 8 }).outcome).toBe(OUTCOME.UNREACHABLE);
  });

  it('a 422 whose body cannot be parsed is UNREACHABLE — an answer we do not understand is not evidence', () => {
    const r = classify({ status: 422, body: { error_code: 'something_new', msg: 'nope' }, expected: 8 });
    expect(r.outcome).toBe(OUTCOME.UNREACHABLE);
    expect(r.message).toMatch(/parseObservedMinimum/);
  });

  it('UNREACHABLE keeps the badge GREEN (exit 0) — outages must not train us to ignore it', async () => {
    const code = await main(
      { SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'k' },
      { fetchImpl: async () => { throw new Error('socket hang up'); }, sleepImpl: async () => {}, attempts: 2 }
    );
    expect(code, 'an outage turned the badge red; this is how a monitor gets ignored').toBe(0);
  });

  it('a 2xx — the endpoint ACCEPTED one character — is DRIFT and is RED', async () => {
    const r = classify({ status: 200, body: { id: 'u' }, expected: 8 });
    expect(
      r.outcome,
      'production accepted a ONE-character password and the check did not go red. There is no ' +
        'usable minimum at all and A PRODUCTION POLICY CHANGE WOULD GO UNNOTICED.'
    ).toBe(OUTCOME.DRIFT);

    const code = await main(
      { SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'k' },
      { fetchImpl: async () => new Response(JSON.stringify({ id: 'u' }), { status: 200 }) }
    );
    expect(code).toBe(1);
  });

  it('transport failures are retried; a real policy answer is not', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ error_code: 'weak_password', msg: 'Password should be at least 8 characters.' }), { status: 422 });
    });
    const r = await probeWithRetries('https://x.test', 'k', { fetchImpl, sleepImpl: async () => {}, attempts: 3 });
    expect(calls).toBe(3);
    expect(classify({ ...r, expected: 8 }).outcome).toBe(OUTCOME.PASS);

    calls = 0;
    const once = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }), { status: 422 });
    });
    await probeWithRetries('https://x.test', 'k', { fetchImpl: once, sleepImpl: async () => {}, attempts: 3 });
    expect(calls, 'a real answer was retried; drift would be masked by retrying until it changed').toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. THE PROBE'S SAFETY PROPERTY. Do not let anyone "improve" this back.
// ────────────────────────────────────────────────────────────────────────────
describe('the probe cannot create an account, by construction', () => {
  it('sends exactly ONE character, never "minimum - 1"', () => {
    expect(
      PROBE_PASSWORD.length,
      'PROBE_PASSWORD is no longer one character. If it is set to "minimum - 1" (e.g. 7 against a ' +
        'minimum of 8) it stays safe while everything is fine and CREATES A REAL PRODUCTION ACCOUNT ' +
        'WITH A WEAK PASSWORD in exactly the alarm condition — the day the minimum drops, the ' +
        'monitor commits the harm it exists to detect. Supabase cannot be configured below 6, so ' +
        'one character is rejected at every reachable setting. Read the header of the script.'
    ).toBe(1);
  });

  it('one character is below the lowest minimum Supabase can be configured to (6)', () => {
    expect(PROBE_PASSWORD.length).toBeLessThan(6);
  });

  it('never references a service-role key', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts', 'verifyPasswordPolicy.mjs'), 'utf8');
    expect(src).not.toMatch(/SERVICE_ROLE|service_role_key|SUPABASE_SERVICE/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. MESSAGE PARSING.
// ────────────────────────────────────────────────────────────────────────────
describe('parseObservedMinimum', () => {
  it('reads the number out of the real production sentence', () => {
    expect(
      parseObservedMinimum({ error_code: 'weak_password', msg: 'Password should be at least 8 characters.' })
    ).toBe(8);
  });

  it('returns null for anything that is not a weak_password length rejection', () => {
    expect(parseObservedMinimum({ error_code: 'user_already_exists', msg: 'x' })).toBeNull();
    expect(parseObservedMinimum({ error_code: 'weak_password', msg: 'too weak' })).toBeNull();
    expect(parseObservedMinimum(null)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. THE GUARD'S OWN EXECUTABILITY.
// ────────────────────────────────────────────────────────────────────────────
// The least-tested property of any guard is whether it runs. Everything above
// asserts what the check CONCLUDES, and every one of those assertions is worth
// nothing on a run where the module does not load or the workflow's command
// does not resolve. Both of those failures are quiet in the place that counts:
// a module that will not parse reports as "no tests", not as a red assertion,
// and a workflow step that runs the wrong path can still exit 0.
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = resolve(__dirname, '..', 'scripts', 'verifyPasswordPolicy.mjs');
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github', 'workflows', 'password-policy-drift.yml');
// Comments are stripped before matching. The workflow explains at length why
// it has no setup-node and no `npm ci`, and naming them is how it does that —
// asserting against the raw file would make the documentation trip its own
// guard, and the fix for that is always to delete the explanation.
const WORKFLOW_SRC = readFileSync(WORKFLOW_PATH, 'utf8')
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

describe('the guard can actually run', () => {
  // This is the mutation that already happened once. It is asserted on the
  // SOURCE rather than left to the module loader because on Linux with LF
  // endings a shebang loads fine — so without this, re-adding one would be
  // caught only on Windows checkouts and CI would stay green over a file whose
  // every assertion had stopped running.
  it('the script carries no shebang', () => {
    expect(
      readFileSync(SCRIPT_PATH, 'utf8').startsWith('#!'),
      'verifyPasswordPolicy.mjs starts with a shebang again. This does not fail loudly where it ' +
        'matters: vite\'s SSR transform hoists the node: imports ahead of it, and on a CRLF ' +
        'checkout rolldown then cannot parse the module — vitest reports THIS FILE as "no tests" ' +
        'and every guard in it, including the DRIFT comparison, silently stops running. CI is ' +
        'Linux and checks out LF, so CI would not notice. Nothing executes this file directly ' +
        '(the workflow runs `node <path>` and the file is not mode +x), so the shebang buys ' +
        'nothing. Read the header of the script before removing this test.'
    ).toBe(false);
  });

  // Pins the YAML to the script. A rename, a move, or a typo'd path in the
  // workflow is otherwise discovered only by a human reading a scheduled run.
  it('the command in the workflow points at this script', () => {
    const m = /run:\s*node\s+(\S+verifyPasswordPolicy\.mjs)/.exec(WORKFLOW_SRC);
    expect(
      m,
      'password-policy-drift.yml no longer contains a `node ...verifyPasswordPolicy.mjs` command. ' +
        'Either the drift check is not being invoked at all, or it moved and this test must move with it.'
    ).not.toBeNull();
    expect(
      resolve(REPO_ROOT, m![1]),
      'the workflow invokes a path that is not this script, so the scheduled run is not running ' +
        'the code these tests cover'
    ).toBe(SCRIPT_PATH);
  });

  // Executability through the REAL delivery mechanism: a separate `node`
  // process, not vitest's module graph. This is the only assertion in the file
  // that would survive the transform breaking, and it is also the only one
  // that exercises the `import.meta.url === process.argv[1]` main-guard — a
  // module that imports cleanly but whose main-guard never fires would run in
  // CI, print nothing, and exit 0 forever.
  //
  // Uses the CONFIG-ERROR path (no credentials), so it touches no network.
  it('runs as a standalone node process and exits non-zero when unconfigured', () => {
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_ANON_KEY;

    const r = spawnSync(process.execPath, [SCRIPT_PATH], { env, encoding: 'utf8' });

    expect(
      r.error,
      `could not execute the script as the workflow does: ${r.error?.message}`
    ).toBeUndefined();
    expect(
      r.status,
      'running the script the way the workflow runs it did not exit 1 on missing credentials. ' +
        `Exit was ${r.status}. If it exited 0 with no output the main-guard never fired, which ` +
        'means the scheduled job would pass every day WITHOUT PROBING ANYTHING. ' +
        `stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`
    ).toBe(1);
    expect(r.stderr).toMatch(/CONFIG-ERROR/);
  });

  // The comment in the YAML saying this check installs nothing is load-bearing
  // for two separate reasons, so it is asserted instead of described.
  it('the workflow installs no toolchain and no dependencies', () => {
    expect(
      WORKFLOW_SRC,
      'actions/setup-node is back in the drift workflow. It is not needed (the script uses only ' +
        'node: builtins and the runtime\'s own fetch) and it is not free: on run 30806299900 it ' +
        'downloaded a Node tarball on every run, and it put a PERMANENT ::warning:: annotation on ' +
        'a job that uses the ::warning:: channel for exactly one thing — "the policy was NOT ' +
        'checked on this run". A standing warning there is noise the real signal has to be found in.'
    ).not.toMatch(/actions\/setup-node/);
    expect(
      WORKFLOW_SRC,
      'the drift check now installs dependencies. That adds minutes and a supply-chain surface to ' +
        'a check whose entire value is being boring, reliable and unable to wedge a merge.'
    ).not.toMatch(/npm ci|npm install|yarn |pnpm /);
  });
});
