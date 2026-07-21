# Remediation Plan — Audit Item #3, Half B: PII in logs + the Discord email egress

**Planned from:** `main` @ `03f33e82b654d293497ba8367678e7aed6f1f0d9`
**Date:** 2026-07-21 · **Mode:** READ-ONLY planning. No code, no deps, no DB/prod contact. The only file
created is this plan.
**Builds on:** `docs/OBSERVABILITY_PII_RECON_2026-07-20.md` (recon, planned from `f79fd15`) and
`docs/SENTRY_INTEGRATION_PLAN_2026-07-20.md` (Half A, now merged as #109 + #110).
**Every site below was re-verified against current source at `03f33e8`.** Line numbers that moved are
called out; sites the recon missed are marked **NEW**.

---

## TL;DR

- **The recon's 8 sites still exist, but its line numbers are stale in one place and its enumeration was
  incomplete in five.** `errorHandler.ts` moved `:11 → :12` (Half A inserted the Sentry import). I found
  **5 additional PII sites the recon missed**, one of which (`entityResolution.ts:44`) logs a **person's
  name** off a business card, and one of which (`webhookController.ts:300-304`) puts the user's **email in
  the SUCCESS path** — so email is logged on *every* successful billing event, not only on failures.
- **A shared log-redaction helper is the wrong primary tool, and we already have the only piece worth
  reusing.** Half A shipped `apps/backend/src/redaction.ts` with a pure, unit-tested `scrubString()`. It is
  the right fix for exactly **2** sites (error stacks). For the other 15 it is useless — no regex knows that
  "Carrefour", "John Smith" or `Facture_Jan.pdf` is PII. Those need structural removal, not scrubbing.
  Wrapping all 117 `console.*` sites in a `safeLog()` would buy false confidence — the same regex-chasing
  failure mode the Sentry plan rejected in §3a.
- **Concern 2 is confirmed and is sharper than "drop the email".** `ref` (`webhookController.ts:264`) is
  interpolated into Discord at `:273-277` and `:280-284`. But those two alerts carry **no Paddle
  identifier at all** — unlike the refund alert (`:234-242`) which carries four. So deleting the email
  makes the alert *less* actionable and invites a revert. The fix is a **swap**, not a deletion.
- **`discordAlert.ts:15-16` documents the leak as intended behaviour** — its own contract tells callers to
  pass "the user/email ref string". The comment has to change or the next caller re-adds it.
- **Code fixes are forward-looking only.** Emails already in Railway's log buffer and already posted to
  Discord are not removed by any PR here. See §5.

---

## 1. CONCERN 1 — PII in first-party logs (Railway stdout)

All backend logging is raw `console.*`. There is **no logger, no transport, no redaction layer** — verified
again at `03f33e8`: zero source hits for `winston|pino|morgan|bunyan|logtail`. 117 `console.*` statements
exist in `apps/backend/src` (excluding tests); **17** of them carry PII or can.

Classification key: **(a)** remove entirely · **(b)** reduce to a non-PII identifier · **(c)** keep, redacted.

### 1a. Direct email (6 sites, 4 of them on hot paths)

| # | file:line @ `03f33e8` | What lands in the log | Class | Note |
|---|---|---|---|---|
| 1 | `middleware/authMiddleware.ts:142` | `email` — full address, on first-time org provisioning | **(b)** → `userId` | `userId` is in scope at `:133` and is the actual join key. The email adds nothing the UUID doesn't. |
| 2 | `controllers/webhookController.ts:118` | `email` (falls back to `custom_data.userId`) | **(b)** → `userId` + Paddle `event_id` | See objection 3 — the email is here *because* it is the fallback identity. Paddle's `customer_id` replaces it without loss. |
| 3 | `controllers/webhookController.ts:264` | `ref = "userId <uuid>, email <address>"` — the **shared** string | **(b)** redefine `ref` | One edit at `:264` fixes four consumers (`:272`, `:279`, `:303`, and both Discord sites). This is the single highest-leverage line in Half B. |
| 4 | `controllers/webhookController.ts:272` | `ref` in `[Webhook][ALERT]` (upgrade not applied) | **(b)** via #3 | |
| 5 | `controllers/webhookController.ts:279` | `ref` in `[Webhook][ALERT]` (downgrade not applied) | **(b)** via #3 | |
| 6 | **NEW** `controllers/webhookController.ts:300-304` | `ref` in the **SUCCESS** log — `[Webhook] ${eventName} -> Org … (${ref})` | **(b)** via #3 | **Recon miss.** It only flagged the two failure paths. This line fires on every *successful* billing event, so it is the **highest-volume email site in the codebase**, not an edge case. |
| 7 | `services/email/mailer.ts:210-212` | recipient `to` + raw provider `detail` body | **(c)** mask | A delivery failure genuinely needs the recipient's shape. No Resend id exists yet at this point. Mask to `a***@domain.tld`. |
| 8 | `services/email/mailer.ts:217` | recipient `to` + Resend message id | **(b)** drop `to`, keep `data.id` | Resend's dashboard holds the full record keyed by that id. The address is pure duplication. |
| 9 | `services/email/mailer.ts:221` | recipient `to` + exception message | **(c)** mask | Same reasoning as #7. |

### 1b. Document contents — the user's actual financial/personal data (5 sites)

| # | file:line @ `03f33e8` | What lands in the log | Class | Note |
|---|---|---|---|---|
| 10 | `services/extraction/geminiAdapter.ts:156-166` | ASCII box: `MERCHANT`, `TOTAL`+currency, `DATE`, `DOCUMENT` type | **(a)** delete | Recon cited `:156-166`; the statement is `console.log` at `:156` closing at `:166`. Fires on **every successful extraction**. Zero production value — it is dev ergonomics ("PROFESSIONAL ASCII LOGGING", `:155`). Replace with a one-line non-PII summary (documentId + confidence + which fields were found), which is what you actually debug from. |
| 11 | **NEW** `services/normalization/entityResolution.ts:44` | `searchName` — the extracted entity name | **(b)** → entity id + `entityType` | **Recon miss, and the sharpest one.** `types/schemas.ts:16` types `entityType` as `z.enum(['VENDOR','CLIENT','PERSON','OTHER'])` — so this logs **merchant names AND people's names**, the latter straight off a scanned business card (`geminiAdapter.ts:62` confirms business cards are a supported input). A named natural person in stdout is a stronger PII claim than an email. |
| 12 | **NEW** `controllers/uploadController.ts:64` | `file.originalname` — user-chosen filename | **(b)** → mimetype + size | Filenames routinely carry exactly what we are trying not to log: `Facture_Carrefour_Jan.pdf`, `cv_john_smith.pdf`. |
| 13 | **NEW** `services/ingestion/ingestionService.ts:35` | `originalFileName` again | **(b)** → drop; `documentId` is already in the line | Same class as #12. |
| 14 | **NEW** `services/extraction/geminiAdapter.ts:77` (and `:82`) | `textOutput` — raw model response for the multi-doc check | **(a)** delete | In practice `YES`/`NO`, but it is *unbounded model output* echoed verbatim, and both lines are self-labelled `DEBUG`. Low severity, near-zero cost to remove. |

### 1c. Raw user query text (1 site)

| # | file:line @ `03f33e8` | What lands in the log | Class | Note |
|---|---|---|---|---|
| 15 | `services/query/intentParser.ts:11` | `q` — the user's full natural-language question | **(a)** delete the text; keep length + language + resolved intent | Free text: can contain merchants, amounts, names. **Adjacent finding:** `rawQueryText` is *also persisted to the database* (`services/query/queryExecutor.ts:165-175`, `QueryLog.rawQueryText`). That is a deliberate product feature, not a logging bug — but it means deleting the log line does **not** stop us storing the query. Retention of `QueryLog` is a separate decision and is **out of scope here**; flagged so nobody believes #15 closes it. |

### 1d. Indirect leakage — values embedded in error text (2 sites)

| # | file:line @ `03f33e8` | What lands in the log | Class | Note |
|---|---|---|---|---|
| 16 | `middleware/errorHandler.ts:12` | `err.stack \|\| err` | **(c)** redact | **Line moved: recon said `:11`, it is now `:12`** (Half A inserted `import * as Sentry from '@sentry/node'` at `:3`). Cannot be removed — stacks are the primary debugging artifact. A Prisma `P2002` on `User.email` embeds the address in the message. |
| 17 | **NEW** `services/query/queryExecutor.ts:160` | `err.message` from a failed query execution | **(c)** redact | Same class as #16: the intent-derived filter value (e.g. a merchant name the user typed) can surface in a Prisma error message. Recon missed it. |

### 1e. Confirmed NOT PII — no action (re-verified, recon corrections hold)

- `services/ingestion/persistence.ts:72` — **the recon's correction stands.** `foundAnchors` is built at
  `persistence.ts:52` from a fixed 13-word English vocabulary; `:72` logs only which of those generic words
  matched. Never receipt content. **Leave it alone.** (The audit's original "receipt anchors = financial
  PII" claim remains an overstatement.)
- `services/entitlement/resolveBillingOrg.ts:66,88` — `userId`/`organizationId` only. The email parameter
  is used for the DB lookup and is **never** interpolated into either log line. Clean.
- `services/email/welcomeEmail.ts:94,110,133,140` — `userId` only. The email is passed onward to the
  mailer, so it is covered by #7-#9, not a separate site.
- `controllers/webhookController.ts:228` and `:234-242` — Paddle-issued ids (`adjustment_id`, `customer_id`,
  `transaction_id`). Pseudonymous vendor handles, not PII.
- `services/entitlement/applyEntitlementChange.ts:101`, `services/staleSweepService.ts:31,41` — ids and
  counts. Clean.
- `controllers/accountController.ts` — still **zero** `console.*` statements. The deletion path logs nothing.
- **Frontend `console.*` (16 sites across 11 files)** goes to the end user's **own browser console** — a
  user seeing their own data, not a multi-tenant leak. Out of scope. Note Half A already stopped these
  becoming Sentry breadcrumbs (`apps/frontend/src/sentry.ts`, console breadcrumbs disabled).

### 1f. Shared helper vs per-site edits — the decision

**No new helper. Reuse `redaction.ts` at exactly two sites; everything else is a structural per-site edit.**

The reasoning is the same one that drove Half A's design, and it cuts *against* a blanket log wrapper:

1. **The helper already exists.** Half A shipped `apps/backend/src/redaction.ts` exporting a pure,
   unit-tested `scrubString()` (emails, JWTs, Bearer tokens) — see `apps/backend/src/redaction.test.ts`.
   Building a second redaction primitive for logs would be duplication.
2. **It is the correct fix for #16 and #17 only.** Those are the two sites where we *cannot predict* what
   the string contains, which is precisely when a regex backstop is the right tool. Routing
   `errorHandler.ts:12` through `scrubString` also gives a genuinely valuable property: **stdout and Sentry
   would then share one scrubber**, so an error stack is redacted identically whether it lands in Railway
   or in Sentry. That is a real architectural win, not just a patch.
3. **It is useless for the other 15.** `scrubString` matches emails and tokens. It cannot know that
   `Carrefour` is a merchant, that `John Smith` is a business-card contact, or that
   `Facture_Carrefour_Jan.pdf` is a filename worth suppressing. Sites #10-#15 are only fixed by *not
   interpolating the value*.
4. **A blanket `safeLog()` over all 117 sites would be actively harmful.** It is a large, risky refactor
   that would let a reviewer believe logging is "handled" while every merchant name, person name and
   filename still flows through untouched. That is exactly the false-confidence trap the Sentry plan named
   in §3a ("structural allow-listing, not pattern-chasing").

**Verdict:** 15 structural edits + 2 `scrubString` call sites + 0 new modules.

---

## 2. CONCERN 2 — The Discord email egress (higher severity)

### 2a. Confirmed current lines and exact payload

| Step | file:line @ `03f33e8` | Detail |
|---|---|---|
| Built | `controllers/webhookController.ts:264` | ``const ref = `userId ${userId \|\| 'none'}, email ${email \|\| 'none'}`;`` |
| Sent (1) | `controllers/webhookController.ts:273-277` | `fireDiscordAlert('PRO upgrade NOT applied — customer paid but is still on FREE (no user/org match).', { event, ref, event_id })` |
| Sent (2) | `controllers/webhookController.ts:280-284` | `fireDiscordAlert('Downgrade NOT applied — no user/org match for a billing change.', { event, ref, event_id })` |
| Formatted | `services/discordAlert.ts:32-45` | Context entries are flattened to `key=value` pairs and appended to the message `content` |
| Transmitted | `services/discordAlert.ts:72-77` | `fetch(DISCORD_ALERT_WEBHOOK_URL, { method:'POST', body: JSON.stringify({ content }) })` |

**What actually arrives in the Discord channel:** a message containing the literal substring
`ref=userId <supabase-uuid>, email <the customer's real address>`.

Both sites are gated on `!resolved` (`:268`) — i.e. only when a billing event fails to map to an org. Low
frequency, but this is the "customer paid and it broke" path, so it fires exactly when a **real paying
customer** is involved.

**The other two Discord alerts are clean** — re-verified: `:138-140` sends `error.message` only (its comment
at `:135-137` explicitly says no payload), and `:234-242` sends Paddle ids only. The recon was right.

### 2b. Assessment — is the email necessary?

**No. It is redundant, and it is redundant with a *better* source.**

- The alert exists to answer "which customer paid and didn't get PRO, so I can fix it by hand." That needs a
  **lookup handle**, not an identity.
- The alert already carries `event_id`. Paddle's dashboard resolves an event id to the full customer record
  — email, transaction, subscription. So the email in Discord duplicates data that already sits in the
  system of record, in a **less controlled place**.
- **But a bare deletion degrades the alert, and that matters.** These two alerts carry *no Paddle
  identifier* — no `customer_id`, no `transaction_id` — unlike the refund alert at `:234-242` which carries
  four. Strip the email and the on-call path becomes "search Paddle by event id" with nothing else to go on.
  Someone will eventually put the email back. **The fix must be a swap, not a deletion:** drop `email`,
  add `customer_id` and `transaction_id` (both available on `event.data`, exactly as `:234-242` already
  reads them). The alert ends up **more** actionable than today, with no PII.

### 2c. Why this is higher severity than stdout

| | Railway stdout | Discord |
|---|---|---|
| Party | first-party host | **third-party processor** (Discord Inc., US) |
| Access | Railway project members | anyone in the channel, incl. future invitees |
| Retention | bounded by the Railway plan's window | **indefinite** — messages persist until manually deleted |
| Data-flow mapping | inside our own boundary | a transfer to a processor we have **no DPA with** |
| Reversibility | ages out on its own | requires manually deleting messages |

Under a GDPR data-flow map, an email address crossing into an unmanaged chat tool with unbounded retention
is a materially different finding from the same address sitting in a first-party log that ages out. **Treat
Concern 2 as the priority of Half B**, which is a change from the recon's framing (it flagged this as
"worse-adjacent" but still sequenced it last, inside a general scrub).

### 2d. The contract comment sanctions the leak

`services/discordAlert.ts:15-16` currently instructs callers:

> *"Callers pass only non-secret business identifiers (event name, **the user/email ref string**, org id,
> adjustment/transaction ids) as context."*

The module's own documented contract **blesses passing an email**. Fixing the two call sites without fixing
this comment leaves a loaded gun for the next caller. The comment must change in the same PR, to something
that names emails as forbidden rather than as an example.

### 2e. Test impact — verified safe

Grepped the backend suite: **no test asserts that an email appears in a log line or in a Discord context.**
`tests/webhookController.test.ts` asserts the `[Webhook][ALERT]` prefix (`:397`, `:410`) and identifiers like
`adj_1` (`:415`), and `:384` matches only `/FREE|PRO/` on the message. So dropping the email breaks nothing.
The execution PR should **add** a negative-control test pinning that no `@` ever reaches `sendDiscordAlert`.

---

## 3. Objections, corrections, and things you should push back on

1. **Your framing of Concern 1 as "~8 console.* sites" is an undercount — it is 17.** The recon enumerated 8;
   I found 5 more (#6, #11, #12, #13, #14, #17 — six entries, of which #14 is a pair). Two of them matter:
   `entityResolution.ts:44` logs **a person's name**, and `webhookController.ts:300-304` logs the email on
   the **success** path. Any plan sized against "8 sites" is sized against the wrong number.
2. **Your file:line for `errorHandler.ts` is stale.** It is `:12`, not `:11` — Half A's Sentry import shifted
   it. This is the one line number in your brief that no longer matches source.
3. **I reject "reduce to userId" as a blanket answer for the email sites.** For #1 it is right. For #2 it is
   *wrong on its own*: that log's email exists precisely because `custom_data.userId` is **absent** — the
   email is the fallback identity (`webhookController.ts:266` passes both to `resolveBillingOrg`). Replacing
   it with a `userId` that is `null` in exactly the cases you need it produces a useless log. The correct
   substitute there is Paddle's `customer_id`, not our `userId`.
4. **I reject "(c) keep but redacted" for the mailer's success line (#8).** Redaction is the weaker fix when a
   perfect non-PII handle already exists in the same statement: `data.id`, the Resend message id. Use the id
   and drop the address entirely — (b), not (c).
5. **The highest-volume PII site is not on your list at all.** `geminiAdapter.ts:156-166` fires on every
   successful scan, and `webhookController.ts:300-304` on every successful billing event. Volume matters for
   remediation order: those two accumulate PII fastest, so they buy the most per line changed.
6. **Fixing the code does not clean the existing data — see §5.** Any claim that Half B "removes PII from our
   logs" is false on merge day; it only stops *new* PII.
7. **`persistence.ts:72` still must not be touched.** Third time this has been checked; the anchors are a
   fixed keyword list at `persistence.ts:52`. Changing it would be busywork justified by a bad audit line.
8. **Scope honesty, unchanged from the recon:** I cannot read the Railway dashboard, so log retention and who
   holds project access are inferred, not verified. Same for who is in the Discord channel.

---

## 4. Recommendation — PR slicing

**Three PRs. The Discord egress is its own PR, and it goes FIRST.**

### PR B1 — Remove the email from the billing `ref` (Discord + the ALERT logs it feeds)
`webhookController.ts:264` (redefine `ref`), `:273-277` and `:280-284` (add `customer_id` +
`transaction_id`), `discordAlert.ts:15-16` (fix the contract comment), plus a negative-control test that no
`@` reaches `sendDiscordAlert`.

**Why its own PR:** it answers a different question than the rest of Half B. B1 is a **third-party
data-flow** change — the reviewer question is "does a customer's email leave our boundary?" Everything else
is **log hygiene** — "is our own stdout too chatty?" Bundling them means the one change with a compliance
argument gets reviewed as line 40 of a ten-file cleanup.

**Why first:** highest severity (§2c — third party, unbounded retention, no DPA); smallest diff (two files);
independently revertable; and it is the only item whose exposure *keeps growing* in a place we cannot age
out.

**Deliberate overlap, not scope creep:** `ref` is shared with three stdout lines (`:272`, `:279`, `:303`), so
redefining it at `:264` fixes those too. Splitting one variable's definition across two PRs to keep a tidy
boundary would be worse than the overlap. State it in the PR description.

### PR B2 — Stop logging document contents and query text
`geminiAdapter.ts:156-166` and `:77`/`:82`, `entityResolution.ts:44`, `intentParser.ts:11`,
`uploadController.ts:64`, `ingestionService.ts:35`.

**Why second:** these are the **highest-volume** sites — every scan, every query, every upload writes PII
today. Once B1 closes the boundary crossing, this is where the fastest accumulation is. One coherent class
("stop putting document contents in stdout"), all pure removals/reductions, and it needs **no** redaction
primitive — so it carries no risk of interacting with Half A's Sentry code.

### PR B3 — Email sites + indirect stack redaction
`authMiddleware.ts:142`, `webhookController.ts:118`, `mailer.ts:210-212`/`:217`/`:221`, plus wiring
`redaction.ts:scrubString` into `errorHandler.ts:12` and `queryExecutor.ts:160`.

**Why last:** lowest volume, and it is the **only** PR that touches the shared `redaction.ts` module Half A
shipped. `errorHandler.ts:12` is the subtlest change in Half B — it sits on the path every 500 takes, and a
mistake there degrades debugging for every future incident. It deserves to land on a quiet branch with
nothing stacked on top of it, and to be reviewed on its own merits rather than as the tail of a big scrub.

**Ordering rationale in one line:** severity (B1) → volume (B2) → subtlety (B3).

**Alternative considered and rejected:** one "Half B" PR. Rejected because it merges a compliance-relevant
data-flow change into a hygiene refactor, and because a single PR touching ~10 files across controllers,
services and middleware is hard to revert cleanly if one site's removal breaks a support workflow.

---

## 5. What these PRs do NOT fix (must be said out loud)

- **Historical data is untouched.** Emails, merchant names and query text already written to Railway stdout
  remain until that log window ages out. Emails already posted to Discord remain **indefinitely** — those
  messages need manual deletion, or the channel needs purging. Neither is a code change, and B1 merging does
  not make the past exposure go away.
- **`QueryLog.rawQueryText` keeps storing raw queries** in the database (`queryExecutor.ts:165-175`). Site
  #15 removes the *log* line, not the *row*. Retention/anonymisation of `QueryLog` is a separate decision.
- **Railway access and Discord channel membership are unverified from here** — both are dashboard settings.
  Whoever can read the Railway project can read every historical log line; whoever is in the channel can read
  every historical alert.
- **The frontend's 16 `console.*` sites are unchanged** — deliberately, they print to the user's own console.

---

**Nothing was changed. This is a plan only — no code written, no dependency installed, no file touched but
this document.**
