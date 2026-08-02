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

Not solved here — re-enabling is a click, and detecting dormancy automatically
needs state across runs. Recorded 2026-08-02 so it is met before it is trusted.

### Cite the command, or drop the claim

In merge and verification reports, every statement about repository or platform
configuration carries the call that produced it. If no command was run for it,
it does not go in the report.

Claims volunteered as extra diligence get the least scrutiny of anything
written: nobody asked for them, so nobody checks them — including the author.
Each of the four errors above was volunteered, not requested.

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
