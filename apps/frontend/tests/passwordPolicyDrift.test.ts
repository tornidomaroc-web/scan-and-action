import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
//
// The safety property of the probe itself — one character, never "minimum - 1"
// — is pinned in section 4, because the tempting "improvement" creates a weak
// production account in exactly the alarm condition.
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
