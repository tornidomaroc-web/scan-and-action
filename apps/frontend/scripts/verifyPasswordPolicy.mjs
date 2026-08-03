/**
 * NO SHEBANG, DELIBERATELY. Read this before typing `#!/usr/bin/env node` on
 * the line above — adding one back does not fail loudly, it silently switches
 * off every test in tests/passwordPolicyDrift.test.ts.
 *
 * That file imports this module, so vite's SSR transform rewrites it. The
 * transform hoists the `node:` builtin requires onto line 1, AHEAD of the
 * shebang. With LF endings vite strips the shebang first and nothing breaks;
 * on a CRLF checkout it does not, and rolldown then meets `#!` in the middle
 * of line 1 and refuses to parse the module at all.
 *
 * The failure does not look like a failing assertion. Vitest reports the FILE
 * as failed with "no tests" — all 20-odd guards below stop running at once,
 * including the DRIFT-vs-PASS comparison that is the entire point of this
 * script.
 *
 * And it is invisible where it matters most: CI is Linux and checks out LF, so
 * CI stays green while every Windows clone (git core.autocrlf=true, the
 * Windows default) has a dead guard. Verified 2026-08-03 by flipping each
 * factor alone: CRLF+shebang fails to load; LF+shebang passes; CRLF without
 * the shebang passes.
 *
 * The shebang was never load-bearing. Nothing executes this file directly: the
 * workflow runs `node apps/frontend/scripts/verifyPasswordPolicy.mjs`, and the
 * file is mode 100644 — not executable, so `./verifyPasswordPolicy.mjs` never
 * worked in the first place. It arrived as a copy of verifyRenamedKeyBytes.mjs
 * (which carries the same unused shebang, harmlessly, because nothing imports
 * it). Copying is exactly how it got here; that is why this note is at the top
 * rather than in a commit message.
 *
 * Section 6 of the test file fails if it comes back.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Drift check: does production still enforce the password minimum this
 * repository CLAIMS it enforces?
 *
 * WHY THIS EXISTS. The Supabase minimum is dashboard configuration. It moved
 * 6 -> 8 on 2026-08-02 through a web UI with no PR, no test, no review and no
 * revert trail, and was noticed only because a human went looking.
 * PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH in src/lib/passwordPolicy.ts records a
 * DATED observation, and a dated observation decays. The tripwire test in
 * authPasswordLength.test.tsx pins the repository's claim against itself — if
 * the dashboard drops back to 6 tomorrow, that test keeps passing. Nothing in
 * CI would notice. This is the thing that notices.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A ONE-CHARACTER PASSWORD AND NOT A SEVEN-CHARACTER ONE.
 * READ THIS BEFORE "IMPROVING" THE PROBE. It is a safety property, not a style
 * choice, and the obvious tightening reintroduces the exact harm.
 *
 * The natural design is "send one character below the minimum and assert 422".
 * With a minimum of 8 that means seven characters. It is wrong, and it is wrong
 * in the worst possible way: it is SAFE while everything is fine and HARMFUL in
 * precisely the alarm condition.
 *
 * If the minimum ever drops back to 6, a seven-character signup no longer 422s
 * — it SUCCEEDS. The probe then CREATES A REAL PRODUCTION ACCOUNT with a weak
 * password, every single day, as its way of reporting that weak passwords are
 * now possible. The monitor would commit the harm it was built to detect.
 *
 * One character cannot do that. Supabase's own floor is 6 and the setting
 * cannot be configured below it, so a 1-character password is rejected at ANY
 * reachable configuration. The account-creation branch is unreachable by
 * construction, not by luck and not by us guessing the current value right.
 *
 * We lose nothing by it: the 422 body states the live number verbatim
 * ("Password should be at least 8 characters."), so one guaranteed-safe request
 * yields the EXACT minimum rather than a binary at-or-above answer. It is both
 * safer and more informative. Do not "fix" it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THREE OUTCOMES, DELIBERATELY NOT TWO. A badge that goes red when Supabase has
 * an outage is a badge people learn to ignore, and an ignored badge fails
 * silently on the day it matters. So only a real contradiction is red:
 *
 *   PASS         422 weak_password, observed number == the repo's constant  -> exit 0
 *   DRIFT        a well-formed answer that contradicts the repo             -> exit 1  (RED)
 *   UNREACHABLE  transport failure / 5xx / unparseable, after retries       -> exit 0 + ::warning::
 *
 * Known limit, stated rather than hidden: a LONG outage warns green and we lose
 * coverage without noticing. Escalating after N consecutive unreachable runs
 * needs state across runs and is deliberately not built here.
 *
 * WHAT THIS CANNOT SEE: the admin create-user API bypasses the project policy
 * entirely (observed 2026-08-02), so this says nothing about service-role
 * writes. It also cannot see "Password requirements" or leaked-password
 * protection changing, and it cannot tell you whether a legacy short password
 * still exists — that last one is unknowable from a bcrypt hash. It pins ONE
 * number on ONE path: the anon signup path, which is the only path our app can
 * reach, and the number that actually moved.
 *
 * Uses the ANON key only — the public key that already ships inside the client
 * bundle. It must never be given a service-role key: that key bypasses the
 * password policy, so a probe holding one would report success no matter what
 * the policy said.
 *
 *   node apps/frontend/scripts/verifyPasswordPolicy.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const OUTCOME = {
  PASS: 'PASS',
  DRIFT: 'DRIFT',
  UNREACHABLE: 'UNREACHABLE',
};

/** The password we send. See the header — one character, never "minimum - 1". */
export const PROBE_PASSWORD = 'x';

const POLICY_PATH = 'apps/frontend/src/lib/passwordPolicy.ts';

/**
 * The number the REPOSITORY claims, read from the source of truth rather than
 * hardcoded in YAML. This is what makes the check a drift detector in both
 * directions: it goes red if the dashboard moves, and equally if someone edits
 * the constant without re-verifying production.
 */
export function parseExpectedMinimum(source) {
  const m = /^export const PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH = (\d+);/m.exec(source);
  if (!m) {
    throw new Error(
      `Could not find PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH in ${POLICY_PATH}. ` +
        'If the constant was renamed or moved, update this script with it — do not delete the check.'
    );
  }
  return Number(m[1]);
}

/**
 * The number PRODUCTION states, lifted out of the GoTrue rejection message.
 * Returns null when the body is not a recognisable length rejection, which the
 * caller treats as UNREACHABLE (an unparseable answer is not evidence of
 * drift — it is evidence we did not get an answer we understand).
 */
export function parseObservedMinimum(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.error_code !== 'weak_password') return null;
  const m = /at least (\d+) characters/.exec(String(body.msg ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Pure classification. Every branch that can turn the badge red lives here so
 * it can be tested without touching the network.
 */
export function classify({ transportError = null, status = null, body = null, expected }) {
  if (transportError) {
    return {
      outcome: OUTCOME.UNREACHABLE,
      message:
        `PROBE-UNREACHABLE: could not reach the Supabase signup endpoint (${transportError}). ` +
        'The password policy was NOT checked on this run. This is not a policy failure and is ' +
        'deliberately not red — but coverage was lost, so treat a run of these as a problem.',
    };
  }

  if (status !== 422) {
    // A 2xx here is the alarm case that matters most: the endpoint accepted a
    // one-character password, so there is effectively no minimum at all.
    if (status !== null && status >= 200 && status < 300) {
      return {
        outcome: OUTCOME.DRIFT,
        message:
          `POLICY-DRIFT: the signup endpoint ACCEPTED a ${PROBE_PASSWORD.length}-character password ` +
          `(HTTP ${status}). Production is enforcing no usable minimum, while ${POLICY_PATH} claims ` +
          `${expected}. Check Authentication -> Sign In/Providers -> Email immediately.`,
      };
    }
    if (status !== null && status >= 500) {
      return {
        outcome: OUTCOME.UNREACHABLE,
        message:
          `PROBE-UNREACHABLE: Supabase answered HTTP ${status}. The password policy was NOT ` +
          'checked on this run. Not a policy failure, so not red.',
      };
    }
    return {
      outcome: OUTCOME.UNREACHABLE,
      message:
        `PROBE-UNREACHABLE: unexpected HTTP ${status} from the signup endpoint — not a recognised ` +
        'policy answer. The password policy was NOT checked on this run.',
    };
  }

  const observed = parseObservedMinimum(body);
  if (observed === null) {
    return {
      outcome: OUTCOME.UNREACHABLE,
      message:
        'PROBE-UNREACHABLE: got HTTP 422 but could not read a minimum out of the response ' +
        `(error_code=${body?.error_code ?? 'none'}, msg=${JSON.stringify(body?.msg ?? null)}). ` +
        'GoTrue may have changed its wording — update parseObservedMinimum. NOT checked this run.',
    };
  }

  if (observed !== expected) {
    return {
      outcome: OUTCOME.DRIFT,
      message:
        `POLICY-DRIFT: production enforces a minimum of ${observed}, but ${POLICY_PATH} records ` +
        `PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH = ${expected}. The dashboard moved without a commit, ` +
        'or the constant was edited without re-verifying production. Re-run this script by hand, ' +
        'then update the constant AND the dated note above it.',
    };
  }

  return {
    outcome: OUTCOME.PASS,
    message: `POLICY-OK: production enforces a minimum of ${observed}, matching ${POLICY_PATH}.`,
  };
}

/** One probe attempt. Never throws — transport failures come back as data. */
export async function probeOnce(url, key, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `policy-probe-${Date.now()}@example.invalid`,
        password: PROBE_PASSWORD,
      }),
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed, transportError: null };
  } catch (err) {
    return { status: null, body: null, transportError: err?.message ?? String(err) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry only transport failures — a real policy answer is never retried. */
export async function probeWithRetries(url, key, { attempts = 3, backoffMs = 2000, fetchImpl = fetch, sleepImpl = sleep } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await probeOnce(url, key, fetchImpl);
    if (!last.transportError) return last;
    if (i < attempts - 1) await sleepImpl(backoffMs * (i + 1));
  }
  return last;
}

export async function main(env = process.env, deps = {}) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      'CONFIG-ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set. Use the ANON key (the public ' +
        'one that ships in the client bundle) — never the service-role key, which bypasses the ' +
        'password policy and would make this check report success unconditionally.'
    );
    return 1;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const expected = parseExpectedMinimum(readFileSync(join(here, '..', 'src', 'lib', 'passwordPolicy.ts'), 'utf8'));

  const probe = await probeWithRetries(url, key, deps);
  const { outcome, message } = classify({ ...probe, expected });

  if (outcome === OUTCOME.DRIFT) {
    console.error(`::error::${message}`);
    return 1;
  }
  if (outcome === OUTCOME.UNREACHABLE) {
    console.log(`::warning::${message}`);
    return 0;
  }
  console.log(message);
  return 0;
}

// Only run when invoked directly, so the module can be imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
