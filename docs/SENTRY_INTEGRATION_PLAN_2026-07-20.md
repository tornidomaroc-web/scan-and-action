# Integration Plan — Sentry (free Developer tier), Half A of Audit Item #3

**Planned from:** `main` @ `f79fd15d43583af5696e897930a40d853089a7cc`
**Date:** 2026-07-20 · **Mode:** READ-ONLY planning. No code, no deps, no package.json edits, no DB/prod
contact. The only file created is this plan.
**Builds on:** `docs/OBSERVABILITY_PII_RECON_2026-07-20.md`. **Execution is a later, separate step** once
DSNs are supplied. Decision fixed: Sentry Developer (free) tier; the user creates the projects + DSNs.

---

## TL;DR — the shape, and the one decision that matters

- **Backend:** a new `apps/backend/src/instrument.ts` calls `Sentry.init(...)` and is imported at the **very
  top of `index.ts`**, immediately after `import 'dotenv/config'` (line 1) and **before** `import app`
  (line 2). Capture of request errors happens by calling `Sentry.captureException` **inside**
  `errorHandler.ts` right before `console.error`/`res.json` (capture-before-respond), tagged with the
  existing `errorId`. `process.on('uncaughtException'|'unhandledRejection')` **do not need to be
  hand-written** — the Sentry Node SDK installs both by default.
- **Frontend:** a new `apps/frontend/src/sentry.ts` calls `Sentry.init(...)`, imported as the **first line
  of `main.tsx`**. `<App/>` (main.tsx:29) is wrapped in a Sentry **ErrorBoundary** with a real fallback UI
  (today a render crash = white screen).
- **THE DECISIVE PART — redaction is structural, not regex.** A naive `beforeSend` email-regex is
  **insufficient**: the worst recon sites (merchant name, total, raw query text) are **not email-shaped**,
  and console lines only reach Sentry as **breadcrumbs**. So the choke point is: **(a) disable
  console-capture breadcrumbs** so those free-text PII lines never become Sentry data; **(b) `beforeSend`
  strips request bodies, `Authorization`/`Cookie` headers, and scrubs the exception message/stack**; **(c)
  `sendDefaultPii: false` and never `setUser({email})`**; **(d) the scrubber is fail-closed** (throws →
  drop the event, never send un-redacted). This scrubber ships **in the same commit** as `Sentry.init` —
  never after.
- **A PII site you under-scoped — the bearer token.** Sentry's request enrichment can attach the
  `Authorization: Bearer <supabase JWT>` header. That is **account-takeover-grade** and sharper than any
  email. Header stripping is mandatory in `beforeSend`, item (b).

---

## 1. Backend (Railway, `apps/backend`)

### 1a. Where `Sentry.init` goes

The Node SDK (v8, OpenTelemetry-based auto-instrumentation) must initialise **before the instrumented
libraries are imported** — here, `express`/`http`, which `app.ts` pulls in. Current entry:

```
index.ts:1  import 'dotenv/config';   // env must load first — Sentry.init reads SENTRY_DSN
index.ts:2  import app from './app';   // <-- app.ts imports express here
```

Plan — new file `apps/backend/src/instrument.ts` (init + redactor wired together), imported between them:

```
index.ts:1  import 'dotenv/config';
index.ts:+  import './instrument';     // NEW — Sentry.init runs before express is imported
index.ts:2  import app from './app';
```

Rationale: `dotenv/config` must precede it (DSN/env), and it must precede `./app` (instrumentation). If
`SENTRY_DSN` is unset, `Sentry.init` is a **no-op** (SDK disables itself) — safe for local/CI/tests.

### 1b. How `errorHandler.ts` integrates (capture-before-respond)

Keep the existing middleware; add a capture call **before** the log + response, correlated by the existing
`errorId` (`errorHandler.ts:9`). Conceptually (not code to apply now):

```
errorHandler (err, req, res, next):
  errorId = crypto.randomUUID()                 // existing, :9
  Sentry.captureException(err, { tags: { errorId } })   // NEW — before responding
  console.error(... errorId ... err.stack ...)  // existing, :11
  ... existing 4xx mapping / 500 response ...
```

Why manual capture in the handler rather than only `Sentry.setupExpressErrorHandler(app)`:
1. It **ties the Sentry event to our correlation UUID** (`errorId`) as a searchable tag — a user reports
   "errorId abc", we find the exact event.
2. It is **independent of Sentry's Express-5 error-middleware compatibility** (see Risks) — a plain
   `captureException` call has no framework coupling.
3. Explicit control over *what* is captured and when. Request context (method/URL) is still auto-attached
   because `instrument.ts` initialised before `express` was imported.

Note the current handler only reaches 500s for unknown errors; known Prisma/Zod/Multer paths return 4xx
(`errorHandler.ts:14-40`). Those are expected and should **not** page us — capture unconditionally but rely
on Sentry's issue grouping, or (better) gate capture to `status >= 500` to avoid noise. Recommend: capture
only when the resolved status is 500 (put the `captureException` just before the 500 branch at
`errorHandler.ts:46`), so validation/conflict 4xx don't create issues.

### 1c. `process.on('uncaughtException'|'unhandledRejection')` — do we add them?

**No hand-written handlers.** The Sentry Node SDK enables `onUncaughtExceptionIntegration` and
`onUnhandledRejectionIntegration` **by default** on `Sentry.init`, so both are captured automatically once
1a lands — closing the recon's "no process-level net" gap without custom code. Keep the SDK default that
still lets the process exit on a truly fatal uncaught exception (Railway then restarts it) rather than
zombie-running. Optional: a one-line `process.on('unhandledRejection', ...)` that *also* console.errors
locally — nice-to-have, not required; if added it must not swallow the Sentry capture.

---

## 2. Frontend (Vercel, `apps/frontend`)

### 2a. Where `Sentry.init` goes

New file `apps/frontend/src/sentry.ts` (init + redactor together), imported as the **first import in
`main.tsx`**, before React/providers so the SDK instruments early:

```
main.tsx:1  import './sentry';         // NEW — first line
main.tsx:... existing imports ...
main.tsx:25 createRoot(...).render(<StrictMode>…</StrictMode>)
```

### 2b. ErrorBoundary around `<App/>`

Today `main.tsx:25-33` renders `StrictMode > LanguageProvider > AuthProvider > App` with **no boundary** —
a render throw unmounts to a white screen (recon A2). Plan: wrap **`<App/>`** (main.tsx:29) in
`Sentry.ErrorBoundary` from `@sentry/react`, **inside** `LanguageProvider` (so the fallback can use i18n
strings) and inside `AuthProvider`:

```
<LanguageProvider>
  <AuthProvider>
    <Sentry.ErrorBoundary fallback={<AppCrashFallback/>} >   // NEW
      <App/>
    </Sentry.ErrorBoundary>
  </AuthProvider>
</LanguageProvider>
```

`AppCrashFallback` = a minimal, static, localized "something went wrong — reload" panel (not a white
screen). The boundary auto-`captureException`s. Note: an ErrorBoundary catches **render** errors, not event
handler / async errors — those are covered by the global handlers the browser SDK installs
(`globalHandlersIntegration`: `onerror` + `onunhandledrejection`), which fills the other recon A2 client
gap automatically.

---

## 3. REDACTION — the choke point (must ship with init, from line one)

### 3a. Why `beforeSend` email-regex alone is wrong (objection)

- **Console lines are not events.** `authMiddleware.ts:142`, `mailer.ts:211/217/221`, `intentParser.ts:11`,
  `geminiAdapter.ts:156-166`, `webhookController.ts:118/272/279` are `console.*`. They reach Sentry **only**
  as **breadcrumbs** (the SDK's console integration records them), attached to the next captured event.
  `beforeSend` mutating `event.exception` does nothing to a breadcrumb.
- **The worst PII is not email-shaped.** `geminiAdapter.ts:156-166` logs a **merchant name / total / date**
  box; `intentParser.ts:11` logs **free-text query**. An email regex misses all of these. Trying to regex
  arbitrary financial free-text is a losing game.

**Therefore the design is structural allow-listing, not pattern-chasing.**

### 3b. The four-part scrubber (identical intent on both ends; a small pure module per app)

Wired **inside** `instrument.ts` / `sentry.ts`, in the same commit as `Sentry.init`:

1. **Kill console breadcrumbs.** In `Sentry.init`, configure integrations to **remove the console
   integration** (Node: drop `consoleIntegration`; Browser: `breadcrumbsIntegration({ console: false })`).
   Net effect: none of the PII-bearing `console.*` lines in the recon ever leave the process as Sentry
   data. This single lever neutralises the majority of the enumerated sites
   (authMiddleware.ts:142; mailer.ts:211/217/221; intentParser.ts:11; geminiAdapter.ts:156-166;
   webhookController.ts:118) at the source, without touching those files.

2. **`beforeSend(event, hint)` — structural strip of the surviving vectors:**
   - **Request body:** delete `event.request.data` (set to `'[stripped]'`). Debugging uses route + errorId,
     not the payload. This is *stronger* than today (recon: we don't log bodies, but Sentry's request
     enrichment would otherwise attach them).
   - **Auth token / cookies (the under-scoped one):** delete `event.request.headers.Authorization` /
     `authorization` and `Cookie`, and any `event.request.cookies`. Prevents the Supabase bearer JWT from
     egressing.
   - **Exception message + stack (covers `errorHandler.ts:11`'s `err.stack` embedding):** run an
     email/JWT/long-digit regex backstop over `event.exception.values[].value` and each stack frame's
     `vars`, replacing matches with `[redacted-*]`. This is the one place a regex is the right tool,
     because a Prisma `P2002` on `User.email` embeds the value into the exception text.
   - **Query string:** strip/normalise `event.request.query_string` and any query params on
     `event.request.url`.
   - **Breadcrumbs (defense-in-depth):** with console breadcrumbs already off, also drop `data` on any
     remaining `http`/`fetch`/`xhr` breadcrumbs (URLs/bodies).

3. **No PII identity + no default PII:** `sendDefaultPii: false` (v8 default — assert it, never flip true),
   and **never call `Sentry.setUser({ email })`**. If we want a user handle at all, set only the
   **userId (UUID)** — pseudonymous, and even that is optional.

4. **Fail-closed:** wrap the whole `beforeSend` body in `try/catch`; on **any** error, `return null` (drop
   the event). A scrubber bug must **never** result in an un-redacted event being sent.

### 3c. Coverage matrix — every recon PII site → how it's handled

| Recon site | PII | How covered |
|---|---|---|
| `authMiddleware.ts:142` | email | console breadcrumbs OFF (3b-1) |
| `webhookController.ts:118` | email | console breadcrumbs OFF |
| `webhookController.ts:272/279` (`ref`, :264) | email+userId | console breadcrumbs OFF; note this also egresses to **Discord** — out of Sentry's scope, flagged below |
| `mailer.ts:211/217/221` | recipient email | console breadcrumbs OFF |
| `geminiAdapter.ts:156-166` | merchant/total/date | console breadcrumbs OFF (regex could never catch merchant name) |
| `intentParser.ts:11` | raw query text | console breadcrumbs OFF |
| `errorHandler.ts:11` `err.stack` | email etc. embedded by Prisma/Zod | `beforeSend` exception-value+stack regex scrub (3b-2) |
| **(added) `Authorization` header** | Supabase bearer JWT | `beforeSend` header strip (3b-2) — **you under-scoped this** |
| **(added) `request.data`** | any posted body | `beforeSend` body strip (3b-2) |
| `persistence.ts:72` | **NOT PII** — fixed 13-word keyword fingerprint | no action (recon correction stands) |

---

## 4. DSN wiring

- **Two Sentry projects → two DSNs.** Backend project platform **Node**, frontend project platform
  **React/Browser**. They must be separate (different SDKs, different event shapes, different source maps,
  separate quota accounting on the free tier).
- **DSNs are publishable, not secret.** A DSN only permits *sending* events; the frontend DSN necessarily
  ships in the client bundle — that is by design and fine. So neither needs secret handling, though keeping
  them in platform env (not committed) keeps them swappable.
- **Backend (Railway) env vars:** `SENTRY_DSN` (required to enable), plus optional
  `SENTRY_ENVIRONMENT` (`production`), `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` (default `0` on free
  tier — errors only, no perf, to protect quota). Read in `instrument.ts`. **Unset ⇒ SDK no-ops.**
- **Frontend (Vercel) build env var:** `VITE_SENTRY_DSN` (the `VITE_` prefix is required for Vite to expose
  it to the client build — matches the existing `VITE_*` convention). Set it in the Vercel project env.
  The committed `apps/frontend/.env.production` also feeds the Capacitor Android build; adding
  `VITE_SENTRY_DSN` there would extend crash reporting to native too — **treat native as out of scope for
  v1** (native source-map upload is extra work) and simply leave it unset on the native build if undesired.
  Unset ⇒ browser SDK no-ops.
- **No prod DB contact:** correct and worth stating — Sentry init reads only `process.env` and sends HTTPS
  to Sentry's ingest endpoint. Nothing in this integration opens a Postgres connection or runs a migration.

---

## 5. Test strategy — offline, no prod

All tests use the **existing vitest** harness in each app (`backend`/`frontend` both already have
`test: vitest run`). No network, no prod, DSN unset in CI (SDK no-ops → CI stays green).

1. **Redaction unit tests (the primary proof — the "beforeSend removes email before send" test).** Export
   the scrubber as a **pure function** `scrubEvent(event)` (what `beforeSend` calls). Feed fixtures and
   assert on the **return value** — nothing is sent:
   - an `event.exception` whose value contains an email (simulated Prisma P2002) → assert no email substring
     remains;
   - `event.request.headers.Authorization = 'Bearer eyJ…'` → assert the header is gone;
   - `event.request.data = { … }` → assert stripped;
   - a breadcrumb carrying merchant/query free-text → assert dropped/emptied;
   - a scrubber that throws internally → assert `scrubEvent` yields `null` (fail-closed).
2. **Console-breadcrumb-off assertion.** Unit-assert the `Sentry.init` options object we build **omits the
   console integration** (Node) / sets `breadcrumbsIntegration({console:false})` (browser) — a config
   snapshot test, so a future refactor can't silently re-enable console capture.
3. **Capture-works, offline.** Initialise the SDK with a **stub transport**
   (`Sentry.init({ dsn: 'https://public@o0.ingest.sentry.io/0', transport: fakeTransport, beforeSend })`),
   call `Sentry.captureException(new Error('email me@x.com'))`, flush, and assert: (a) the fake transport
   received exactly one envelope (wiring works) **and** (b) the delivered event has the email scrubbed
   (proves `beforeSend` ran on the real path, not just in isolation). Still zero real network.
4. **Frontend ErrorBoundary test.** Render a component that throws inside `Sentry.ErrorBoundary`; assert the
   fallback UI shows (no white screen) and `captureException` was called (spy) — jsdom, offline.
5. **One-time manual smoke (dev, not prod).** After DSNs exist, locally trigger a test capture
   (`Sentry.captureMessage` or a temporary throw route) against the **real** DSN from a dev machine and
   confirm the event appears in the Sentry dashboard **already scrubbed**. This is the only step that hits
   Sentry's servers; it uses dev env, never the prod deployment, and any temporary debug route is removed
   before merge.

---

## Objections / corrections / sharper points (silent agreement = failure)

1. **Regex-only `beforeSend` would have failed the brief.** The mandate says "cover every PII site"; an
   email scrubber covers *none* of merchant/total/query. The real lever is **turning off console
   breadcrumbs** + **structural field stripping**. This is the single most important design call here.
2. **You under-scoped the bearer token.** `Authorization: Bearer <supabase JWT>` is the highest-severity
   thing Sentry could capture (session hijack), and it isn't in your list. Header stripping is mandatory.
3. **`request.data` body capture** is a *new* exposure Sentry introduces that doesn't exist today (recon
   found no body logging). It must be stripped so adding Sentry doesn't *widen* the surface — exactly the
   "reporter could forward PII to a new third party" risk from the recon's sequencing note.
4. **Discord `ref` email egress is out of Sentry's reach.** `webhookController.ts:273/280` sends email to
   Discord regardless of Sentry. Fixing that is a **separate** change (drop `email` from `ref`); note it so
   it isn't assumed covered by "we added redaction."
5. **`persistence.ts:72` stays untouched** — fixed keyword fingerprint, not PII (recon correction holds).
6. **Express 5 compatibility risk (verify at execution).** `@sentry/node` v8 gained Express 5 support in a
   later 8.x minor; the manual-`captureException`-in-errorHandler approach (1b) is deliberately chosen so we
   do **not** depend on `setupExpressErrorHandler`'s framework coupling. Still, pin and verify the
   `@sentry/node` version supports Express `^5.2.1` request auto-instrumentation before relying on
   auto request context.
7. **Free-tier quota discipline.** Set `tracesSampleRate: 0` (errors only) and rely on issue grouping;
   otherwise a 500 storm burns the free monthly event budget and later errors are dropped. Consider a
   modest client-side `sampleRate` if volume is a concern.
8. **No shared lib exists** (separate npm projects, no root workspace). Duplicate the ~40-line pure scrubber
   in each app rather than standing up a shared package for it — keeps each PR self-contained and each
   scrubber independently testable. (Revisit only if a third consumer appears.)
9. **Deps not added here (as instructed).** Execution will need `@sentry/node` (backend) and
   `@sentry/react` (frontend) added to the respective `package.json` — not done in this planning step.

---

## Recommendation — PR slicing

**Two PRs, backend first, each self-contained. Do NOT split "add Sentry" from "add redaction."**

- **The cardinal constraint is line-one redaction.** Therefore, within each app, `Sentry.init` + the
  scrubber + its unit tests land in **one commit / one PR**. Splitting init into an earlier PR than
  redaction would ship a window where un-redacted events egress — forbidden.

- **PR 1 — Backend Sentry + redaction (do first).** `instrument.ts` (init, console breadcrumbs off,
  `beforeSend` scrubber, fail-closed), `index.ts` import wiring, `errorHandler.ts` capture-before-respond
  gated to 500s, the scrubber unit tests + stub-transport test. First because: (a) server 500s are the
  bigger blind spot (recon A3 — silent today); (b) backend redaction is the **harder, higher-risk** half
  (err.stack, request bodies, bearer tokens) and deserves to be proven before the easy half; (c) it needs
  only `SENTRY_DSN` on Railway — no client rebuild.

- **PR 2 — Frontend Sentry + ErrorBoundary + redaction (do second).** `sentry.ts` (init, console
  breadcrumbs off, `beforeSend`, fail-closed), `main.tsx` first-import wiring, `Sentry.ErrorBoundary` +
  `AppCrashFallback` around `<App/>`, ErrorBoundary + scrubber tests. Second because the frontend DSN is
  publishable and lower-risk, and the boundary fix (white-screen → fallback) is independent of backend.

- **No PR 0 needed.** Env vars are set in the Railway/Vercel dashboards out-of-band before each PR deploys;
  with DSN unset the SDK no-ops, so each PR is safe to merge before its DSN exists.

- **Explicitly out of these two PRs (separate follow-ups):** dropping `email` from the Discord `ref`
  (objection 4); trimming/debug-gating the noisy `console.*` sites at source (Half B's own scrub — Sentry
  redaction protects *Sentry*, but the emails/merchant data still sit in Railway stdout until Half B trims
  them); native/Capacitor crash reporting + source maps.

**Nothing was changed. This is a plan only — no code written, no dependency installed, no file touched but
this document.**
