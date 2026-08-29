# CLAUDE.md

Working notes for this repository. Deliberately minimal: every line here is
loaded into context at the start of every session, so a line earns its place
only by preventing a specific, repeating mistake. The bar is at the bottom.

## Verification gotchas

Checks whose **output** misleads — not a list of things that once broke.

### Branch protection: the legacy endpoint returns a false negative

`GET /repos/{owner}/{repo}/branches/{branch}/protection` reports **only legacy
branch-protection records**. On a repository governed by **rulesets** it returns
`404` with the message body `"Branch not protected"`.

**That 404 carries no information about rulesets.** Never conclude a branch is
unprotected from it, and never report required status checks as unenforced on
its authority.

Ask instead:

| Question | Call |
|---|---|
| Is this branch protected at all? | `GET /branches/{branch}` → `.protected` |
| By which rules, from which ruleset? | `GET /rules/branches/{branch}` |
| Full detail of one ruleset | `GET /rulesets/{id}` |

The first of those is one call, in the same API family, and answers correctly.

This trap does not catch people who have never heard of rulesets — it catches
people who have. Through 2026-08-02, `main` here was declared unprotected on
that 404's authority four separate times; the last reached a merge report as a
false claim that required status checks were unenforced, when in fact they
would have blocked the merge. The 404 is well-formed, quotable and confident,
and nothing about it prompts a second look. That is the whole danger.

### A scheduled workflow that stopped running looks exactly like one that passes

GitHub disables `schedule` triggers in a repository with no activity for **60
days**. It stops firing. Nothing is emailed, no run appears, and no badge turns
red — the absence of a red badge is indistinguishable from a passing check.

This matters for `.github/workflows/password-policy-drift.yml`, which is the
only thing that can notice the Supabase password minimum moving. Every other
guard pins the repository against itself and stays green regardless of
production. A silently dormant monitor is worse than none, because it
manufactures confidence that something is being watched.

**Absence of failure is not evidence of running.** Before relying on any
scheduled check, confirm it actually ran:

```
gh run list --workflow=<file>.yml --limit 5     # when did it last fire?
gh workflow view <file>.yml                     # state: active | disabled_inactivity
```

**Do not reach for a freshness check.** The obvious fix — something that asks
when the schedule last fired and goes red if the gap is too wide — was
recommended, designed and then withdrawn on 2026-08-03. It fails twice, and the
second reason is the one that generalises to any cron:

- **Nowhere it can run is right.** It cannot live in the dormant workflow, since
  a workflow that is not running cannot report that it is not running. Putting
  it in `ci.yml` blocks merges on the monitor's liveness rather than on the
  change under review — a red gate produced by an API hiccup or a rate limit —
  which is the exact trade `password-policy-drift.yml` refuses when it keeps
  itself off the PR gate. It also means editing the file that produces both
  required contexts, where a YAML error stops every merge in the repository.

- **A cron's coverage and its failure mode are anti-correlated.** The 60-day
  disable is triggered by INACTIVITY. During busy periods an activity-triggered
  run fires constantly and the cron adds little; the cron's unique value is
  entirely in quiet periods — which is exactly what disables it. It is most
  valuable in precisely the conditions that kill it. Monitoring it measures the
  proxy, not the thing: a freshness check tells you the instrument died, never
  that the password minimum moved.

So `password-policy-drift.yml` also runs on a push to `main`. That does not
detect dormancy and is not claimed to — the schedule can still die silently and
re-enabling is still a click. It removes the reason to care, by probing whenever
someone is actually working. The residual gap is a quiet period, which is also
the period in which nobody is changing anything.

Recorded 2026-08-02, amended 2026-08-03.

### `grep` answers confidently and wrongly about CR, in both directions

"Does this file contain CR?" is the question under every line-ending audit, and
`grep` cannot be trusted with it here. It fails **both ways, silently**:

- **Clean false negative.** MSYS / Git-Bash `grep` strips CR before matching, so
  `grep -lI $'\r' <file>` prints nothing for a file that is unambiguously CRLF.
  The empty output is indistinguishable from "no CRLF anywhere in the tree".

- **Clean false positive.** In bash, `$"..."` is locale-translation syntax, not
  an escape. `$"\r"` expands to the two characters `\` and `r`, so `grep $"\r"`
  matches every file containing the letter *r* — which is very nearly all of
  them, and reads as "the whole tree is CRLF".

One quote character separates those two spellings. Neither emits a warning, a
non-zero exit, nor anything else that invites a second look, and both produce a
tidy number that reads like a finding.

**Measure the bytes instead.** The replacement is not "be careful with grep", it
is a different instrument:

| Question | Call |
|---|---|
| Does this one file contain CRLF? | `od -c <file>` and look for `\r \n` |
| Which files in the tree do? | PowerShell `[IO.File]::ReadAllBytes($p)`, scan for `0x0D 0x0A` |
| What would a *checkout* produce, without touching the working tree? | `git checkout-index -a --prefix=<dir>/`, then compare |
| What does git *declare* for a path? | `git check-attr text eol -- <path>` |

**And prove the detector before believing it.** Write one known-CRLF file and
one known-LF file, and confirm whatever you are using separates them, before
trusting any census it produces. A positive control is the only thing that
catches this; no amount of reading the command catches it.

Both directions were hit within minutes of each other on 2026-08-07, during the
audit that produced the line-ending policy this repository now guards: one
spelling reported almost every tracked file as CRLF, the other reported none,
and the truth was neither. The wrong answer nearly became the stated premise of
a merged change. The positive control is what caught it.

Recorded 2026-08-07.

### Cite the command, or drop the claim

In merge and verification reports, every statement about repository or platform
configuration carries the call that produced it. If no command was run for it,
it does not go in the report.

Claims volunteered as extra diligence get the least scrutiny of anything
written: nobody asked for them, so nobody checks them — including the author.
Each of the four errors above was volunteered, not requested.

### "Deployed" is a claim about the control plane, not about the process

A deployment console reporting success says the platform believes it shipped a
commit. It is not a reading from the process serving traffic, and a build that
succeeded but never took traffic looks identical from the console.

Ask the process instead:

| Question | Call |
|---|---|
| What commit does the backend report? | `curl -sS https://<host>/api/version` |
| What is `main` right now? | `gh api repos/<owner>/<repo>/commits/main --jq .sha` |

Byte-compare the two. The route is public and mounted above the `/api` auth
middleware, and reports `503 {"commit":null}` when the variable is absent, so a
missing value is loud rather than a plausible string.

**Two things will mislead you here.** An unknown `/api/*` path returns `401`,
not `404`, because `authMiddleware` is mounted on the prefix — a status code
alone cannot separate "route absent" from "no token", so read the body. And the
reported value trails `main` for as long as the deploy takes: 85s and 68s from
merge commit to first serve, on the two deploys measured on 2026-08-29. Those
are two observations, not a bound — a longer wait is a slower deploy, not a
fault. The point is only that a mismatch immediately after a merge is the
expected state. Re-read before concluding anything from one.

Recorded 2026-08-29.

### A stale asset path answers 200, not 404

Vercel serves the SPA fallback for any unmatched path, so an
`assets/index-<hash>.js` URL noted before a deploy returns **HTTP 200 with
`content-type: text/html`** afterwards, not a 404. Grepping that HTML for a JS
token prints nothing — identical output to "the change is not deployed" — and
there is no error status to prompt a second look. Measured after #152: the
stale path returned 200, 2229 bytes, `x-vercel-cache: HIT`; the fresh path
returned 737692 bytes of JS.

Read the asset path from the freshly-served HTML on every check, and verify by
size and content-type. A status-code guard passes cleanly and proves nothing.

## What belongs in this file

A check that answers **confidently and wrongly, with no error to prompt a
second look** — a clean false negative or false positive that reads like a
finding.

Explicitly not:

- things that merely broke once;
- **noisy** failures, which already announce themselves — a suite reporting
  bogus failures is loud, and loud is self-correcting;
- tool or config breakage;
- product facts, which belong next to the code they describe.

**Record the instrument, never the state.** "Ruleset 14939565 protects `main`"
is a fact about live configuration that can be deleted without a commit
touching this repository, and a stale line claiming protection that no longer
exists fails unsafe. A line about which endpoint answers the question stays
true either way.
