# Recon — Audit Item #3: Crash Visibility (Half A) + PII in Logs (Half B)

**Inspected from:** `main` @ `f79fd15d43583af5696e897930a40d853089a7cc`
**Date:** 2026-07-20 · **Mode:** READ-ONLY. No code edited, no deps installed, no DB/prod contact.
This document is the only file created. Every claim below carries `file:line` evidence.
**Re-examines:** BLOCKING item #3 of `docs/PRODUCTION_READINESS_AUDIT_2026-07-18.md` (§7 + prioritized #3).

---

## TL;DR

- **Half A (no crash monitoring): CONFIRMED, and essentially total.** Zero error-tracking SDK in either
  app; no React ErrorBoundary; no `window.onerror`/`unhandledrejection`; no
  `process.on('uncaughtException'|'unhandledRejection')`. A general API 500 is `console.error` to Railway
  stdout only; a frontend render crash is a fully silent white screen. **One** narrow exception exists: a
  Paddle **webhook** 500 fires a Discord alert (`webhookController.ts:138`). Nothing else does.
- **Half B (PII in logs): CONFIRMED but SMALLER and more surgical than the audit implies.** There is **no
  accidental leak** — no `req.body` dump, no full-`user`-object log anywhere (verified). The exposure is a
  finite set of **deliberate** single-field logs: **email** (~6 sites), **extracted document
  contents** (merchant/total/date — 1 site, every scan), and the **raw natural-language query** (1 site).
  The deletion controller we just touched logs **nothing** (clean). One audit example is an **overstatement**
  (`persistence.ts:72` "receipt anchors" is a fixed 13-word keyword fingerprint, not receipt content).
- **Worse-adjacent problem found:** the billing alert path egresses a user's **email to Discord (a third
  party)**, not just to Railway stdout — `ref` at `webhookController.ts:264` → `:273/:280`. That is a
  cross-boundary data flow the audit's "email in logs" framing misses.

---

## HALF A — Crash / error monitoring

### A1. Is there any error-monitoring / observability integration? — **ABSENT (both apps).**

Repo-wide search for `sentry|datadog|newrelic|opentelemetry|bugsnag|rollbar|honeybadger|logrocket|captureException`
(source, excluding `node_modules`) returns **no source hits**. The only matches are:
- `apps/frontend/package-lock.json:6633` and `apps/backend/package-lock.json:3552` — `@opentelemetry/api`,
  which is a **transitive dependency of vitest** (the nearest lockfile parent key is `node_modules/vitest`).
  It is test tooling, never imported or initialised in app code.
- Direct dependencies confirm the absence: `apps/frontend/package.json:15-28` and
  `apps/backend/package.json:23-45` list **no** monitoring SDK.

No init call exists for any such SDK in either app. **Verdict: absent, not partial.**

### A2. How are unhandled errors handled today?

**Server-side — Express error middleware `errorHandler.ts`** (registered last at `app.ts:53`):
- Mints a correlation UUID (`errorHandler.ts:9`) and logs **once**:
  `console.error("[API Error] [${errorId}] ${req.method} ${req.originalUrl}", err.stack || err)`
  (`errorHandler.ts:11`). Note it logs method + URL + **stack**, *not* the request body.
- Maps known errors to 4xx: Prisma `P2002→409` (`:14`), `P2003→400` (`:19`), `P2025→404` (`:24`),
  `ZodError→400` (`:29`), `MulterError→400` (`:38`).
- Everything else → `status = err.status || 500` (`:42`); in production returns only
  `{ error: 'Internal Server Error', errorId }` (`:46-47`) — generic message, no stack to the client. Dev
  returns stack (`:51-56`).
- **No process-level net:** repo-wide search for `process.on('uncaughtException'|'unhandledRejection')`,
  `uncaughtException`, `unhandledRejection` → **zero source matches**. `index.ts:1-12` just
  `app.listen(...)` + `startStaleSweep()`; nothing guards a stray async rejection outside the Express
  request cycle (e.g. inside the `setImmediate` background extraction — that path is individually
  try/caught at `uploadController.ts:97`, but there is no global backstop).

**Client-side — none.** Search for `ErrorBoundary|componentDidCatch|getDerivedStateFromError|window.onerror|
addEventListener('error'|'unhandledrejection')|onunhandledrejection` across `apps/frontend/src` → **zero
matches**. The entry (`main.tsx:25-33`) renders
`<StrictMode><LanguageProvider><AuthProvider><App/></AuthProvider></LanguageProvider></StrictMode>` with
**no boundary** anywhere in the tree. A render/throw in `App` or below unmounts to React's default → blank
screen, no report.

### A3. If a paid user hit a 500 right now, what signal do we get? — **Concretely:**

| Failure | Signal today | Evidence |
|---|---|---|
| General API 500 (upload, documents, query, account, expense…) | **console.error to Railway stdout only.** No push, no alert, no external. Visible only if a human is tailing logs. | `errorHandler.ts:11` |
| Paddle **webhook** processing 500 | **Discord alert** (message + `error.message`, no payload). The single proactive channel. | `webhookController.ts:133-141` |
| Billing event that can't map to an org ("paid but still FREE") | **Discord alert** (incl. `ref` = userId+email). | `webhookController.ts:271-285` |
| Frontend render crash | **Fully silent** — white screen, no boundary, no reporter. | `main.tsx` (no boundary); A2 |

So: **for the revenue-critical webhook path there is a signal; for essentially every other 500, and for
all frontend crashes, it is silent.** The Discord wiring is billing-only — `sendDiscordAlert` has exactly
one importer, `webhookController.ts:8`, wrapped by `fireDiscordAlert` (`:15-17`); no other module calls it.

---

## HALF B — PII in logs

### B4. Every place PII is written to a log (server-side → Railway stdout)

**Direct email (highest sensitivity):**

| # | file:line | Statement (abridged) | PII |
|---|---|---|---|
| 1 | `authMiddleware.ts:142` | `console.log("[AuthMiddleware] Provisioning default organization for user: ${email}")` | email (first-time provisioning) |
| 2 | `webhookController.ts:118` | `console.log("[Webhook] Received ${eventName} (...) for ${email || userId || 'unidentified user'}")` | email (when present on the event) |
| 3 | `webhookController.ts:272` / `:279` | `console.warn("[Webhook][ALERT] ... no user/org matches ${ref} ...")`, `ref = "userId ${userId}, email ${email}"` (`:264`) | email + userId |
| 4 | `mailer.ts:211` | `console.error("[Mailer] Resend returned ${status} ... for ${to}: ${detail}")` | recipient email (+ provider detail) |
| 5 | `mailer.ts:217` | `console.log("[Mailer] Email accepted by Resend for ${to}. ID: ...")` | recipient email |
| 6 | `mailer.ts:221` | `console.error("[Mailer] Network/exception while sending to ${to}: ${message}")` | recipient email |

**Extracted document contents (financial data — sensitive):**

| # | file:line | Statement | PII |
|---|---|---|---|
| 7 | `geminiAdapter.ts:156-166` | ASCII box logging `MERCHANT`, `TOTAL`+currency, `DATE`, `DOCUMENT` type from `rawJson` | the user's actual receipt/invoice content — **on every successful extraction** |

**Raw user query text (user-generated content — can contain anything):**

| # | file:line | Statement | PII |
|---|---|---|---|
| 8 | `intentParser.ts:11` | `console.log("[IntentParser] Parsing ${lang} question: \"${q}\"")` where `q = userQueryText.toLowerCase().trim()` | whatever the user typed (may include names/amounts/merchants) |

**Pseudonymous identifiers (UUIDs — linkable but not direct PII; noted for completeness, lower risk):**
`userId`/`orgId`/`documentId` appear in many logs, e.g. `uploadController.ts:25`, `welcomeEmail.ts:94,134`,
`authMiddleware.ts:102`, and most of `documentController.ts` / `persistence.ts`. These are opaque UUIDs, not
names/emails; they are re-identifying only with DB access.

**The deletion controller we just touched — CLEAN.** `accountController.ts` has **no `console.*`
statement at all** (verified by reading the full file and by the console grep). No email, no user object,
nothing is logged on the deletion path.

### B5. Where do these logs go in production, and who can read them?

- **All backend logging is raw `console.*`** — no structured logger or log-shipper exists (search for
  `winston|pino|morgan|bunyan|logtail` → zero source hits). So everything goes to **process
  stdout/stderr**.
- **Backend host = Railway** (per the standing project fact + `app.ts:11-13` "Railway terminates TLS…").
  There is **no in-repo deploy config** (`railway.json`/`Procfile`/`nixpacks.toml` absent; only
  `apps/frontend/vercel.json` exists), so the runtime/log config lives in the Railway dashboard, not
  visible here. Practically: stdout → **Railway's log stream**, readable by **anyone with access to the
  Railway project**, retained per the Railway plan. **No third-party log sink is configured** (no
  Sentry/Datadog/Logtail).
- **Second egress channel — Discord (third party):** `DISCORD_ALERT_WEBHOOK_URL` (`discordAlert.ts`)
  receives billing alerts, and the "no org match" alert includes `ref` = **userId + email**
  (`webhookController.ts:273,280`). So a user's email can leave the Railway boundary and land in a
  **Discord channel**, readable by anyone in that channel. (The 500 alert at `:138` sends only
  `error.message` — deliberately no PII, per its own comment `:135-137`.)
- **Frontend `console.*` (10 files, 16 sites) goes to the END USER's own browser console**, not a server
  log. That is a user seeing their own data — **not** a multi-tenant leak — so it is out of scope for the
  GDPR "who-can-read-our-logs" concern, though the absence of any client reporter is the Half-A gap.

### B6. Deliberate structured logging vs accidental leakage

- **All eight PII sites above are DELIBERATE, single-field interpolations** — a chosen `email`, `to`,
  `merchantName`, or `q`. They are not blind object dumps.
- **No accidental wholesale leak exists.** Targeted search for `console.*(… req.body …)`, a logged whole
  `req`/`user`/`dbUser` object, or `JSON.stringify(req…)` → **zero matches**. There is **no** request-body
  logger and **no** `console.error('…', err)` that carries a request payload. This is the single biggest
  divergence from the audit's worry ("any error logging that dumps request bodies or user objects") — that
  pattern is simply not in the code.
- **One subtle, semi-accidental vector:** `errorHandler.ts:11` logs `err.stack || err`. For a Prisma or
  validation error, the *message/stack* can embed the offending **value** — e.g. a `P2002` unique-violation
  on `User.email` would put that email into the stack text. So PII can reach the logs *indirectly* via error
  stacks even though no field is named there. This is the only place worth treating as "leak-by-accident."

---

## Objections, corrections, and scope notes (silent agreement = failure)

1. **Audit overstatement — `persistence.ts:70-74` is NOT financial PII.** The audit calls this "receipt
   anchors … financial PII." In fact `foundAnchors` (`persistence.ts:52`) is
   `['total','subtotal','tax','vat','amount','item','receipt','invoice','cash','card','payment','merchant',
   'store'].filter(a => rawText.includes(a))` — a **fixed 13-word English vocabulary**, so `:72` logs only
   *which generic keywords matched*, never receipt content. Near-zero PII. (Separately, these anchors are
   English-only — an i18n correctness smell for Arabic/French receipts, but out of scope here.) The audit's
   **real** financial-PII site is `geminiAdapter.ts:156-166` (#7 above), which it also cites — that one is
   accurate.

2. **Audit nuance — the Discord alert is "billing path only," which is true, but within that path it DOES
   catch webhook 500s** (`webhookController.ts:138`). So "no crash visibility" is not 100% literal: the
   revenue path has a real alert. The gap is everything *else*.

3. **Half B is smaller than "add a reporter + scrub PII" implies.** With no body/object dumps, scrubbing is
   a finite, enumerable edit: ~6 email sites, 1 document-content box, 1 query-text line, plus a decision on
   `err.stack` handling and the Discord `ref`. It is not a pervasive-logging rewrite.

4. **Half A is larger / more structural than a one-line fix.** "Absent" is literal on **both** ends
   (backend push + frontend boundary + process-level handlers all missing). This is net-new
   instrumentation, not a tweak.

5. **Worse-adjacent finding (flagged, not in the original item):** email → Discord third-party egress
   (`webhookController.ts:273,280`). If GDPR data-flow mapping matters, a third-party processor receiving
   emails is arguably a sharper issue than emails sitting in first-party Railway stdout, and it is invisible
   in the audit's current framing.

6. **Scope honesty:** I could not read the Railway dashboard config (not in repo), so "logs → Railway
   stdout, readable by project members, no third-party sink" is inferred from code + the standing project
   fact, not from an infra console. Log **retention** is a Railway-plan setting I cannot see from here.

---

## Recommendation — how to sequence the two halves

**Fix Half A (crash visibility) first; Half B (PII scrub) immediately after, as one coordinated pass — but
A leads.** Reasoning:

- **You cannot safely scrub what you cannot see fail.** Adding a reporter (Half A) is what will *reveal*
  which log lines actually fire in production and carry PII, so doing A first de-risks B and lets you scrub
  with evidence rather than by grep alone.
- **A closes a bigger hole.** Today a paid user's non-billing 500, or any frontend crash, is *invisible* —
  no one is paged, ever. That is a "we won't know we're on fire" gap on a paying product. B is a
  confidentiality issue in logs only your own team (+ a Discord channel) can already read — real, but lower
  blast radius than flying blind.
- **They share one edit surface, so batch them.** Whatever reporter you add in A becomes the exact choke
  point where B's scrubbing belongs (a `beforeSend`/redaction hook, plus trimming the ~8 enumerated sites).
  Introduce the reporter with redaction wired in from line one, rather than shipping a reporter that
  forwards today's emails/merchant data to a *new* third party (Sentry) — that would otherwise *widen* the
  PII exposure the moment A lands. **This ordering dependency is the strongest reason A precedes B within
  the same change window.**

**Concretely:** (1) frontend ErrorBoundary + a client reporter; (2) backend reporter + a
`process.on('unhandledRejection'|'uncaughtException')` net, hung off the existing `errorHandler` choke
point; (3) with redaction active, trim the enumerated PII sites — demote #7 (`geminiAdapter`) and #8
(`intentParser`) to debug-gated, reduce the email sites to userId where the email adds nothing, and drop
`email` from the Discord `ref`. Leave `persistence.ts:72` alone (non-PII). Net: A is the larger, structural
piece and must land first (or jointly) so B's scrub is applied *at* the new reporter instead of after it
starts shipping PII outward.

**Nothing was changed. This is recon only — no fix proposed as code, no file touched but this doc.**
