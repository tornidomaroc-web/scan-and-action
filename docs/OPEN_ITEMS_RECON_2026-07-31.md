# Open items after audit #7 — recon

**Date:** 2026-07-31 · **Status:** RECON ONLY. No code changed, no file added except this doc, no deps, no database contact, no dashboard contact.
**Repo:** main @ `25788bd998ecde4e905998064e1e921c2d125ffa`. Frontend i18n is `apps/frontend/src/i18n/strings.ts` (en/fr/ar), consumed via `useStrings()` → `s.*`.

This file is a **dated snapshot, not a tracker.** It is deliberately written to become *historical* rather than
*stale*: when the state changes, write a new dated file. Of the 25 documents in `docs/`, 22 have exactly one commit
and none of them are stale. The two that behaved as living trackers — `LAUNCH_TODO.md`, which says so in its own
words ("Keep this up to date across sessions"), and `DASHBOARD_REDESIGN_PROGRESS.md`, which was amended across 34
commits — are the two that rotted. §7 records two items they still list as open that are in fact already closed.

**HOW TO USE THIS FILE — it saves *discovery*, never *verification*.** It tells you which items exist, roughly where
they live, which are already closed, and which are blocked on a human rather than on engineering. Every coordinate
below was re-derived against `25788bd` and mechanically re-checked by grep, and every one of them becomes historical
the moment `main` moves past that commit. **Re-grep any coordinate before you act on it.** Drift is the expected
case, not the exception: the five RTL sites recorded in `DASHBOARD_REDESIGN_PROGRESS.md` had, when re-swept here,
moved by two lines *and* lost two entries to fixes nobody recorded (§3.2, §7). Trusting a line number in this file
instead of re-deriving it is a misuse of the file.

**§6 is different from the rest of this document** and is labelled accordingly: it records repository *configuration*
and GitHub-side state, which no commit pins and which can be changed through a web UI without any code change.
Claims elsewhere in this file are pinned by the SHA. Claims in §6 are not.

---

## 0. VERDICT UP FRONT (correcting the six-item framing)

The working assumption was "six open items, tracked nowhere in the repository." That is **wrong in both directions**:

1. **Three of the six are already tracked in-repo.** Items 1–3 live in `docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md`,
   and item 3 additionally carries exact per-file counts in a code comment in
   `apps/frontend/tests/noHardcodedUserFacingText.test.ts`. Only items 4, 5 and 6 were genuinely untracked. (§1, §2)
2. **There are more than six.** Re-derivation surfaced **seven further open items** (§3). The true count at `25788bd`
   is **thirteen**.

Two things believed open are **already closed** and must not be carried forward (§7): the "main is not
branch-protected" finding is a **false negative from a deprecated endpoint** (§6), and **two of the five** recorded
RTL-truncation sites now carry `dir="auto"`.

This codebase uses **no inline markers at all** — a repo-wide search for `TODO|FIXME|XXX|HACK` returns zero
first-party hits (the only `XXX` is a base64 substring in `apps/backend/package-lock.json:3441`). Tracking here is by
dated `docs/` file, by code comment, and by executable guard. GitHub Issues is enabled and templated but has
**never been used** — see §6.3 for the reading, and for why that count is not pinned by the SHA.

---

## 1. ALREADY TRACKED — items 1–3 and where they live

| Item | Tracked at | Note |
|---|---|---|
| 1 — document-detail error copy | `docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md:88` | Recorded as the *raw `err.message`* leak. That leak was fixed by PR #128; what remains is a **copy-quality** follow-up, not a leak. |
| 2 — attribute leaks | `docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md:93-97` | The ACCESSIBILITY section lists **8 of the 9**. `App.tsx:68` was never listed there. |
| 3 — Class C English | `docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md:99-105` | The DEFERRED section, with the "no language switcher → Accept-Language is a product decision" reasoning. |
| 3 — Class C English (counts) | `apps/frontend/tests/noHardcodedUserFacingText.test.ts:204-227` | Exact per-file census at `:210-211`. See §3.6 for an arithmetic defect in that comment. |

**Item 1, restated precisely.** `DocumentDetailScreen.tsx:84` sets `s.somethingWrong`; `:114` renders
`<ErrorState title={s.errorTitle} message={errorMsg} />`. The siblings pass **no `title` at all** —
`ReviewQueueScreen.tsx:143` and `SearchScreen.tsx:198` are `<ErrorState message={errorMsg} … />`, so
`ErrorState.tsx:21` falls back to `title ?? s.somethingWrong`.

| Screen | Title rendered | Body rendered |
|---|---|---|
| `DocumentDetailScreen.tsx:114` | `s.errorTitle` | `s.somethingWrong` (generic) |
| `ReviewQueueScreen.tsx:143` | `s.somethingWrong` (default) | `s.queueFetchError` (specific) |
| `SearchScreen.tsx:198` | `s.somethingWrong` (default) | `s.searchFailed` (specific) |

So the defect is real — document detail is the only one of the three stacking **two generic phrases** — but the
generic pair is `errorTitle` + `somethingWrong`, **not** `somethingWrong` twice. The fix is one new per-screen
catalog key for the body, gated on Arabic code-point sign-off like every catalog change since #118.

---

## 2. GENUINELY UNTRACKED — items 4, 5, 6

### Item 4 — signup has no client-side password-length check

| File:line | Fact |
|---|---|
| `apps/frontend/src/screens/ResetPasswordScreen.tsx:31` | `export const MIN_PASSWORD_LENGTH = 8;` |
| `apps/frontend/src/screens/ResetPasswordScreen.tsx:48` | `if (password.length < MIN_PASSWORD_LENGTH) { … }` — enforced |
| `apps/frontend/src/screens/AuthScreen.tsx:62` | `supabase.auth.signUp({ email, password })` — **no length check of any kind** |
| `apps/frontend/src/i18n/strings.ts:352` | Comment pinning the literal "8" in `resetPasswordTooShort` to the constant |
| `apps/frontend/tests/resetPasswordLocalization.test.tsx:167-173` | Asserts the stated minimum agrees with the constant in all three locales |

`MIN_PASSWORD_LENGTH` appears **nowhere else in the repository**. There is no signup-specific "too short" catalog key;
`resetPasswordTooShort` is reset-flow copy and reusing it verbatim on signup would be wrong.

**What is established:** the signup path performs **no client-side length check**, so a user who chooses a short
password learns of it only after a round-trip, and in whatever language the auth provider answers in.
**What is NOT established:** whether any server-side minimum applies, and if so what it is. Supabase Auth is
configured in a dashboard this session was instructed not to touch, and `apps/backend` was not searched for an
independent signup validator. **Do not characterise this as "UX only" until that is checked** — the severity of this
item is genuinely unknown, and assuming a platform default is how a real gap gets filed as cosmetic.

### Item 5 — no shadow database for the mandated pre-merge `migrate diff`

| Fact | Evidence |
|---|---|
| Datasource declares only two URLs | `apps/backend/prisma/schema.prisma:8-9` — `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")` |
| **No `shadowDatabaseUrl`** | Absent from `schema.prisma` |
| Next migration is **#8** | `apps/backend/prisma/migrations/` holds 7 directories, `20260328193618_init` … `20260709120000_add_entity_display_name` |
| The gate is mandated | `README.md:106-110` — "Run `prisma migrate diff` read-only and confirm it comes back **empty**" |
| The only reachable DB is production | `README.md:70-74` |

**Not verified:** `.env.example` could not be read in this session (tool permission denied), so whether a
`SHADOW_DATABASE_URL` variable is *documented but unprovisioned* is unconfirmed. The `schema.prisma` evidence is
decisive on its own — Prisma cannot use a shadow database that the datasource does not declare.

The consequence is concrete: the one gate standing between migration #8 and production is currently **only runnable
against production itself**.

### Item 6 — `text-balance` visual check still owed

| File:line | Fact |
|---|---|
| `apps/frontend/src/screens/ResetPasswordScreen.tsx:96` | `className="text-balance …"` on the success paragraph |
| `apps/frontend/tests/resetPasswordSuccessWrap.test.tsx:76-79` | Asserts the class **source-level via regex**, deliberately |
| `apps/frontend/tests/resetPasswordSuccessWrap.test.tsx:16` | "It CANNOT prove the visual wrapping improved. jsdom performs no layout" |

The test pins that the class is present and that the catalog string is untouched. It cannot pin that the paragraph
*looks* better. This is a human-eyeball item and no test will ever close it.

---

## 3. NOT IN THE SIX — seven further open items

Ordered by how likely each is to be lost.

### 3.1 Two hardcoded English strings outside every guard

| File:line | String | Status |
|---|---|---|
| `apps/frontend/src/components/Sidebar.tsx:107` | `New Scan` (bare JSX text node) | Open. Named in **two** places already — `noHardcodedUserFacingText.test.ts:223` and `DASHBOARD_REDESIGN_PROGRESS.md:1370` — and fixed in neither. |
| `apps/frontend/src/screens/ProfileScreen.tsx:49` | `Security, notifications, and subscription management are under development.` | Open. Named at `noHardcodedUserFacingText.test.ts:224-225`. |

Both render raw English to every locale. Both were discovered *by a census that was run and then discarded*, which is
precisely how findings get lost.

### 3.2 RTL truncation — three sites remain, not five

`DASHBOARD_REDESIGN_PROGRESS.md:1335-1345` records five. Re-swept at `25788bd`, **two are already fixed** (§7) and the
line numbers of all five had drifted. The three that remain:

| File:line | Node | Missing |
|---|---|---|
| `apps/frontend/src/components/ProcessingTray.tsx:97` | `{job.fileName}` in a `truncate` box | `dir="auto"` — file has no `dir` attribute anywhere |
| `apps/frontend/src/screens/SettingsScreen.tsx:68` | `{user?.email}` in a `truncate` box | `dir="auto"` — file has no `dir` attribute anywhere |
| `apps/frontend/src/components/SharedComponents.tsx:77` | `{label}` in a `truncate` box | `dir="auto"` — file has no `dir` attribute anywhere |

Same defect in each: a truncating box holding Latin user text with no `dir`, so it inherits page direction and clips a
filename or address from its leading end under Arabic. The app-wide guard is Class-A only and does not catch these.

### 3.3 Review-account reset — gated, and the gate was last checked 13 days ago

`DASHBOARD_REDESIGN_PROGRESS.md:1410-1425` records that `unicornapps.support@gmail.com` holds PRO via
`Organization.planOverride = PRO` with zero `Subscription` rows, and that the reset must set **both**
`planOverride = null` **and** `plan = FREE` in one transaction — because `Organization.plan` is a cache recomputed only
on a billing event, so nulling the override alone leaves `plan = PRO` frozen forever.

**Gate status as recorded there: 2026-07-18, "STILL CLOSED."** This session made **no database and no dashboard
contact**, so whether Google's production review has since completed is **unverified as of 2026-07-31**. Treat the
13-day-old gate reading as the last known state, not as current.

### 3.4 `npm run lint` is broken and CI never runs it

| Fact | Evidence |
|---|---|
| `eslint: ^9.0.0` plus 4 plugin deps installed | `apps/frontend/package.json` devDependencies |
| Script exists: `"lint": "eslint ."` | `apps/frontend/package.json` scripts |
| **No config of any kind** | `eslint.config.{js,mjs,cjs}`, `.eslintrc.cjs`, `.eslintrc.json` all absent |
| CI never invokes it | `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run build`, `npx cap sync android` |

ESLint 9 requires a flat config; with none present, `npm run lint` cannot succeed. Because CI never calls it, this is
invisible — asserted at `noHardcodedUserFacingText.test.ts:18-20` and re-derived structurally here (no ESLint config
file of any name exists in `apps/frontend`, and `package.json` carries no `eslintConfig` key). The practical
consequence is that **no ESLint rule can currently gate anything in this repo**, which is why the audit-#7 guard was
built as a vitest source scan instead.

### 3.5 Pull request #1 has been open since 2026-04-04

`#1 "Create test.js"`, branch `tornidomaroc-web-patch-1`, **opened 2026-04-04** and still open when this file was
written. Unrelated to any audit. It should be closed. Its age and the current open-PR count are GitHub state, not
code — see §6.3.

### 3.6 Arithmetic defect in the guard's census comment

`apps/frontend/tests/noHardcodedUserFacingText.test.ts:208-211` states 123 JSX-text violations of which "**115** sit in
five files" (`:209`), then lists (`:210-211`): LandingScreen 51, DeleteAccountInfo 21, PrivacyPolicy 18,
TermsOfService 14, RefundPolicy 12. Those sum to **116**, not 115.

**Deliberately not fixed in this PR** — this PR changes no file outside `docs/`. It should be corrected in the guard PR
that opens that file anyway (§4), where the census will be re-run regardless.

---

## 4. VERIFIED COORDINATES — the nine attribute leaks, re-swept at 25788bd

Item 2 is recorded here as a **pointer to executable work, not as prose to be re-derived later.** These coordinates
exist so the guard PR starts from a known pin set; they are not a substitute for the guard.

Full sweep of `aria-label=` / `title=` / `placeholder=` / `alt=` carrying a **string literal** (expression-valued
attributes excluded) across every `*.tsx` under `apps/frontend/src`. Eleven hits; nine are user-facing English:

| File:line | Attribute |
|---|---|
| `apps/frontend/src/App.tsx:68` | `aria-label="Loading application"` |
| `apps/frontend/src/components/BottomTabBar.tsx:57` | `aria-label="Primary"` |
| `apps/frontend/src/components/CaptureSheet.tsx:149` | `aria-label="Close"` |
| `apps/frontend/src/components/CaptureSheet.tsx:208` | `aria-label="Close"` |
| `apps/frontend/src/components/PaywallModal.tsx:144` | `aria-label="Close"` |
| `apps/frontend/src/components/PaywallModal.tsx:264` | `aria-label="Close"` |
| `apps/frontend/src/components/ProcessingTray.tsx:67` | `aria-label="Close"` |
| `apps/frontend/src/components/Sidebar.tsx:219` | `title="Refresh subscription status"` |
| `apps/frontend/src/components/UploadModal.tsx:339` | `aria-label="Remove file"` |

**Coordinates have not drifted** from the earlier sweep — all nine matched exactly.

The two hits correctly **excluded**, recorded so a future sweep does not re-litigate them:

| File:line | Attribute | Why not a leak |
|---|---|---|
| `apps/frontend/src/components/FixActionPanel.tsx:96` | `placeholder="0.00"` | Numeric format, not prose |
| `apps/frontend/src/screens/AuthScreen.tsx:271` | `placeholder="••••••••"` | U+2022 bullets, no language |

**The vehicle is a third scanner inside the existing guard**, not a new file and not a document: a `ts.isJsxAttribute`
visitor in `apps/frontend/tests/noHardcodedUserFacingText.test.ts` matching `aria-label` and `title` with a
`StringLiteral` initializer, pinned through the **same two-way ratchet** already implemented there
(`unexpectedAgainstPins`, keyed on `file | attribute | text`, never on line number). Two-way means a fix that leaves a
stale pin fails exactly as loudly as a new leak — which is the property that makes the guard incapable of rotting, and
the reason this class belongs there rather than here.

---

## 5. GUARD COVERAGE — what the existing guard reaches, and what it does not

`apps/frontend/tests/noHardcodedUserFacingText.test.ts` (227 lines, TypeScript AST scan, run by `npm test`, which **is**
the required check `Frontend — typecheck & build`).

| Surface | Covered? | Detail |
|---|---|---|
| Call sinks | **Yes** | `SINKS` at `:43` — `showToast`, `setError`, `setErrorMsg`, `setResetNotice` — over `CORE_DIRS` at `:48` (`components/` + `screens/` + `contexts/`) |
| Pin set | **Empty and green** | `KNOWN_PENDING_PR2: string[] = []` (`:72`). The file's own comment states audit #7 PR 2 landed and its pins were deleted in the same commit; the empty array is verified, that history claim is not. |
| Ratchet direction | **Two-way** | New literal fails (`:178`); stale pin also fails (`:191`) |
| **JSX text nodes** | **No — deliberately not built** | `:204-227`, because making it green today needs five whole-file exclusions plus a brand-token allowlist, which is the whitelist-driven shape §5 of the 2026-07-23 recon rejects as a trap |
| **HTML attributes** | **No — never in scope** | Neither half of the guard visits `JsxAttribute`. This is the gap §4 closes. |

So "no existing guard covers this class" is **true for attributes**, but the reason matters: a mature structural guard
already exists and is green. The work is an extension, not a build.

---

## 6. REPOSITORY STATE — NOT PINNED BY THE SHA (re-verify before relying on)

> **Everything in this section is repository configuration and GitHub-side state.** No commit pins it; it can be
> changed through a web UI, or by anyone opening an issue or a pull request, without a single line of code moving.
> The readings below are as of **2026-07-31** and are the one part of this file that can be falsified while
> `main` still points at `25788bd`. §6.1 is the exception — it is a durable fact about the GitHub API, and it is
> the reason this section exists at all.

### 6.1 The durable part — a deprecated endpoint gives a false negative

An earlier session reported "main is not branch-protected" on the strength of
`GET /repos/{owner}/{repo}/branches/main/protection` returning `404 Branch not protected`. **That reading was wrong.**

That endpoint reports **classic branch protection only**. This repository protects `main` with a **repository ruleset**,
which the classic endpoint does not see and reports as 404. Recorded here so no future session repeats the mistake:
**to check protection on this repo, query `/rulesets`, never `/branches/main/protection`.**

### 6.2 Ruleset 14939565 as read on 2026-07-31

Read at `GET /repos/tornidomaroc-web/scan-and-action/rulesets/14939565`:

| Field | Value |
|---|---|
| `id` / `name` | `14939565` / `main` |
| `target` | `branch` |
| `enforcement` | **`active`** |
| `conditions.ref_name.include` | `["refs/heads/main"]` |
| `bypass_actors` | `[]` (empty) |
| `current_user_can_bypass` | `never` |
| `created_at` / `updated_at` | `2026-04-11` / `2026-07-10` |

Rules enforced:

| Rule | Parameters |
|---|---|
| `deletion` | `main` cannot be deleted |
| `non_fast_forward` | force-push to `main` blocked |
| `pull_request` | PR required; `required_approving_review_count: 0`; merge methods `merge`, `squash`, `rebase` |
| `required_status_checks` | `Backend — typecheck & build`, `Frontend — typecheck & build` (both `integration_id: 15368`) |

Both required contexts were **byte-verified**: `… 20 e2 80 94 20 …` = **U+2014 EM DASH**, matching the job names in
`.github/workflows/ci.yml` exactly.

`main` is protected, direct pushes are blocked, and both CI checks are genuinely required with no bypass actor. The
only accurate residual observation is that `required_approving_review_count` is **0** — a PR is mandatory, but a
solo maintainer may self-merge it once checks pass. For a single-maintainer repository that is a deliberate
configuration, not a defect.

### 6.3 Issues and pull requests as read on 2026-07-31

| Reading | Value | Source |
|---|---|---|
| Issues ever created | **0** | `search/issues?q=repo:…+is:issue` → `total_count: 0` |
| Issues enabled | `true` | `GET /repos/…` → `has_issues` |
| Issue templates present | `bug_report.md`, `feature_request.md` | `.github/ISSUE_TEMPLATE/` |
| Pull requests ever created | **130** | `search/issues?q=repo:…+is:pr` → `total_count` |
| Oldest open PR | **#1**, opened 2026-04-04 (§3.5) | `gh pr list --state open` |

The load-bearing conclusion — **GitHub Issues is enabled and templated but has never once been used, across 130
pull requests** — is what justifies recording open work in `docs/` rather than as issues. That conclusion is robust
to small drift; the counts themselves are not, and change the moment anyone opens an issue or a PR.

### 6.4 Other documents as read on 2026-07-31

| Reading | Note |
|---|---|
| `DASHBOARD_REDESIGN_PROGRESS.md:1335` still lists all five RTL sites as open | Two are fixed (§7). Its last commit was 2026-07-18. |
| `LAUNCH_TODO.md` still states "~9 days remain (~Jul 4 2026)" | A deadline 27 days past at the time of writing. Untouched since 2026-06-25. |

Both are file contents, not code, so an edit to either falsifies these rows without any behaviour changing. They are
recorded because they are the evidence for why *this* file is dated and immutable rather than maintained.

---

## 7. REFUTED / ALREADY CLOSED

Things that look open but are not. Recorded so they are not re-raised.

| Claim | Verdict |
|---|---|
| "`main` is not branch-protected" | **REFUTED.** Ruleset 14939565 is `active` on `refs/heads/main` with both checks required and no bypass actors (§6). The 404 came from a deprecated endpoint. |
| RTL truncation at `CaptureSheet.tsx:225` | **CLOSED.** Now `CaptureSheet.tsx:227`, and it carries `dir="auto"`. |
| RTL truncation at `UploadModal.tsx:315` | **CLOSED.** Now `UploadModal.tsx:327`, and it carries `dir="auto"`. |
| Item 1 as "raw `err.message` leaks English" | **CLOSED by PR #128.** `DocumentDetailScreen.tsx:84` routes through `s.somethingWrong`. What remains is copy quality, a strictly smaller claim (§1). |
| `title=` on `SettingsScreen.tsx:68` is a tenth attribute leak | **REFUTED.** It is `title={user?.email}` — an expression carrying user data, not a literal. Correctly outside §4. |
| Item 2 has no guard because none was built | **REFUTED in part.** A structural guard exists and is green; attributes were never in its scope (§5). |

Both stale registers that still carry the two closed RTL entries are recorded in §6.4, with the caveat that their
contents are not pinned by the SHA either.

---

## RECOMMENDATION (single, explicit)

**Extend `apps/frontend/tests/noHardcodedUserFacingText.test.ts` with a `JsxAttribute` scanner in its own PR, pinning
the nine coordinates in §4 through the existing two-way ratchet — and fix the §3.6 off-by-one in the same PR.**

Reasoning, against how this repository actually behaves:

- **It converts the largest recorded item from prose into CI.** Nine sites, exact coordinates, zero ambiguity. The pin
  set is small and enumerable, which is the same property that made the sink guard succeed.
- **It is the only mechanism here that has not rotted.** Docs rot when they promise maintenance; the sink guard cannot,
  because CI re-derives the truth every run and fails on a stale pin as loudly as on a new leak.
- **It starts green.** Pin all nine, then remove pins as each `aria-label` moves to the catalog — the same
  land-it-green discipline §6 of the 2026-07-23 recon prescribed for PR 3.
- **ESLint is not an option** (§3.4): no flat config exists and CI never runs lint, so a lint rule would gate nothing.
  A vitest scan runs inside the required check.

**Not recommended as the next step:** item 3 (Class C) is blocked on a product decision about Accept-Language
detection and cannot be unblocked by engineering; items 1 and 4 need new catalog keys and therefore Arabic
code-point sign-off, which is a human gate; item 5 is infrastructure provisioning, not code. Those are all real, but
none of them can be *finished* by the next PR. The attribute scanner can.
