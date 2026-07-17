# The `isMultiDoc` dead-branch cleanup — decision & map

**Explored from:** `main` @ `247962cd0c144f002a9a3aeb9f8f382878a4ba82` (working tree clean)
**Mode:** read-only mapping + product-decision pass. No code, DB, or migration touched.
**Date:** 2026-07-17

Every `file:line` re-derived from current source at `247962c` (#98 and #101 have landed since the older
docs; their line numbers are stale). This is a **behavioural** change — its own commit, not part of a
restyle — so the decision below is the point of the document, not the diff size.

---

## TL;DR recommendation

**DELETE the client-side `isMultiDoc` comparison. Do NOT make the server emit it.** Three independent
reasons, any one sufficient:

1. Reviving it means **reintroducing a synchronous Gemini vision call** into every upload's request path
   — reversing the explicit architectural decision of commit `82e2697`.
2. The current behaviour (**multi-doc → `NEEDS_REVIEW` → review flow**) is coherent and non-destructive;
   there is **no broken UX** the dead branch was covering. It is vestigial from the pre-`82e2697`
   synchronous era.
3. The dead branch's message is **semantically wrong** for what it claims to handle, so "un-deleting" it
   would ship an incorrect message — it is a *larger*, product-shaped change than deletion, not a smaller
   one.

Removal is **behaviour-preserving for every user** (native and web); the only real change is deleting one
false-green test. Details, and the honest counter-case, below.

---

## 1. Exact sites (re-derived)

### `isMultiDoc` — declared and used in two files

| Site | Line | Text |
|---|---|---|
| CaptureSheet decl | `CaptureSheet.tsx:94` | `const isMultiDoc = errorCode === 'Please upload a single document per image';` |
| CaptureSheet use | `CaptureSheet.tsx:96` | `if ((isLimit \|\| isMultiDoc) && plan !== 'PRO') {` |
| UploadModal decl | `UploadModal.tsx:158` | `const isMultiDoc = errorCode === 'Please upload a single document per image';` |
| UploadModal use | `UploadModal.tsx:159` | `if ((isLimit \|\| isMultiDoc) && plan !== 'PRO') {` |

### `s.freePlanSingleDoc` — FOUR references, two live, two dead

| Site | Line | Reachability |
|---|---|---|
| **UploadModal multi-FILE batch guard** | `UploadModal.tsx:64` | **LIVE** — fires on 2+ files, FREE, native |
| UploadModal error-path ternary | `UploadModal.tsx:162` | **DEAD** — only the `isMultiDoc` else-arm |
| CaptureSheet error-path ternary | `CaptureSheet.tsx:100` | **DEAD** — the *only* use in this file |
| i18n key (en/fr/ar) | `strings.ts:164` / `:494` / `:819` | **KEY IS LIVE** via `UploadModal.tsx:64` |

The prose string `'Please upload a single document per image'` appears in exactly **three source
locations, all client-side**: `CaptureSheet.tsx:94`, `UploadModal.tsx:158`, `uploadGating.test.tsx:117`.
**Zero backend occurrences** (the only backend hit is a *comment* at `ingestionService.ts:37`, "Async
check", not the string).

---

## 2. Architecture — the server CANNOT emit the string (still holds on `247962c`)

Confirmed line-by-line on current main:

- `uploadController.ts:85` — `res.status(202).json({ documentId: stubDoc.id, status: 'PROCESSING' })`.
  The response is sent here, **before** any multi-document check.
- `uploadController.ts:93` — `setImmediate(() => ingestionService.processUploadAsync(...))`. Background
  work fires **after** the response.
- `ingestionService.ts:38` — `const isSingleDoc = await this.validateSingleDocument(...)`.
- `ingestionService.ts:39–45` — on multi-doc: `markAsNeedsReview(documentId)` (`:41`) then `return`
  (`:44`). **It does not throw to the client.** The awaited HTTP call already succeeded with 202.

The synchronous error `error` values the client can actually receive are only: `ACCOUNT_RESTRICTED`
(`:20`), `LIMIT_REACHED` (`:36`), `DAILY_LIMIT_REACHED` (`:53`), `'No image file uploaded'` (`:61`). The
prose string is **not among them and cannot be** — so `errorCode === 'Please upload a single document per
image'` can never be true. The branch is dead.

**Killing commit confirmed:** `82e2697` — *"Moved single-document validation from synchronous upload to
async background processing"* (2026-03-28, TottoJado). Before it, the check was synchronous and could
reject inline; after it, the check is background and flags `NEEDS_REVIEW`.

### The cost fact that decides "should the server emit it?" (NEW — not in prior docs)

`validateSingleDocument` is **not a cheap heuristic**. `ingestionService.ts:17–19`:

```ts
public async validateSingleDocument(buffer: Buffer, mimeType: string): Promise<boolean> {
  return this.geminiAdapter.isSingleDocument(buffer, mimeType);   // a Gemini VISION call
}
```

It delegates to a **Gemini AI vision call**. That is precisely why `82e2697` moved it off the synchronous
path: you cannot run a multi-second LLM call before returning the upload response without making **every
upload** slow. **"Make the server emit it synchronously" = put a Gemini call back in the request path.**
That is a real latency regression on every upload, to serve a rare case — and it un-does a deliberate
architectural decision. This single fact is the strongest argument against revival.

---

## 3. Trap 1 (re-verified) — the i18n key is LIVE; deleting it breaks a tested native-compliance path

`s.freePlanSingleDoc` has **two unrelated jobs**, and only one is dead:

- **`UploadModal.tsx:60–68` — LIVE.** The multi-**FILE** batch guard: `if (totalPotentialCount > 1)` →
  `plan === 'FREE'` → `isNativePlatform()` → `showToast(s.freePlanSingleDoc, 'info')` (`:64`), then
  `return` (`:68`, rejects the batch). Reached whenever a FREE user selects 2+ files. **Covered and
  asserted** by `nativeAntiSteering.test.tsx:344–354` ("GUARD 1"), which adds two files (`:346`) and
  asserts the neutral status shows (`:349`), the paywall never opens (`:351`), and nothing uploads
  (`:353`).
- **`UploadModal.tsx:162` and `CaptureSheet.tsx:100` — DEAD.** The `: s.freePlanSingleDoc` else-arm of
  the `isMultiDoc` ternary. In CaptureSheet this is the **only** reference, so it disappears cleanly with
  the branch. In UploadModal the reference at `:162` disappears **but the key must survive for `:64`.**

**Precise rule:**
- **Removable:** the `isMultiDoc` declarations (`:94`, `:158`), the `|| isMultiDoc` in both guards
  (collapsing to `isLimit`), and the now-constant ternaries at `:100`/`:162` (collapse to
  `s.freePlanLimitReached`).
- **NOT removable:** the i18n key `freePlanSingleDoc` in `strings.ts` (all three locales) — it stays live
  at `UploadModal.tsx:64`. **Deleting the key would break GUARD 1 and a real native-compliance path.**

This is exactly the "the string is unused, delete the key" trap. It is not unused.

---

## 4. Trap 2 (re-verified) — a green test pins a production-impossible path

`uploadGating.test.tsx:116–125`, *"GATE 2: the multi-document validation error also paywalls non-PRO
users"*:

```ts
(uploadDocument as any).mockRejectedValue(new Error('Please upload a single document per image')); // :117
mountModal('FREE'); addFilesToInput([photo('a.jpg')]);            // one file
// … click Start Extraction …
await vi.waitFor(() => expect(document.body.textContent).toContain(PAYWALL_MARKER));  // :124
```

This file does **not** mock `native/shell` (`:167`), so `isNativePlatform()` is its real value (false in
jsdom) → it exercises the **web** paywall path. The test **fabricates a rejection the real server cannot
produce** (`uploadDocument` resolves 202; it never rejects with this string — §2), then asserts the
paywall opens via the dead `isMultiDoc` → web → `setShowPaywall(true)` arm. **It is green today and tests
a path production cannot reach.**

On removal: the condition collapses to `isLimit`; the mocked prose rejection makes `isLimit === false`, so
the block is skipped, the paywall never opens, and **`:124` goes red** — looking exactly like "multi-doc
uploads no longer paywall non-PRO users," a paywall regression. It is not; it is the test losing the dead
code it was pinning.

**Replacement: DELETE this test** (in the same commit, citing `82e2697`). There is nothing for a
*client gating* test to assert about the real multi-doc path, because that path has **no client-side
behaviour** — it is a background server state transition (202 → `NEEDS_REVIEW`). See §8 for the one
worthwhile *backend* test that would pin the real behaviour.

`GATE 1` (`:86–94`, real multi-**file** paywall) and `GATE 2: LIMIT_REACHED` (`:105–114`) and `PRO users`
(`:127+`) are all untouched and stay green.

---

## 5. THE CRUX — what a FREE user actually experiences today (end-to-end)

A FREE user photographs a page containing **two receipts** and uploads the single image:

1. **Client** calls `uploadDocument`. (CaptureSheet: one file only; UploadModal: a 1-file batch, so the
   `:60` multi-file guard does **not** fire.)
2. **Server** passes the FREE scan-count check (`uploadController.ts:33`, under 10), creates a
   `PROCESSING` stub (`:69`), and returns **202** with the `documentId` (`:85`).
3. **Client** sees `result.documentId` → `trackUpload(documentId, filename)` (`CaptureSheet.tsx:85` /
   `UploadModal.tsx:148`) → toast **"Uploaded. Processing in background…"** (`CaptureSheet.tsx:87`) →
   the sheet closes. **No error. No "single document" message. The dead branch never runs** (nothing
   rejected).
4. **Server background** (`setImmediate`, `:93`): `validateSingleDocument` (Gemini) returns false →
   `markAsNeedsReview(documentId)` (`ingestionService.ts:41`) → the document's status becomes
   **`NEEDS_REVIEW`**.
5. **Client** surfaces that status through the normal flow — `ProcessingContext`/`ProcessingTray` track
   the doc, and `NEEDS_REVIEW` is a first-class, rendered status (`DashboardScreen.tsx`,
   `ProcessingTray.tsx`, `SharedComponents.tsx`, the review path). The user sees their upload **succeed**
   and then land in **needs-review**.

**Is there a UX gap the dead branch covered? No.** The dead branch is the *old* (pre-`82e2697`) behaviour
— hard-reject the upload inline with a toast (and, on web, a paywall). The *current* behaviour replaced
that with non-destructive `NEEDS_REVIEW` flagging: the upload is not lost, and the doc is actionable in
the review flow. The branch is **vestigial**, not a safety net with a hole.

**The one honest wrinkle:** the current behaviour gives no *explicit* "we detected multiple documents"
explanation — the user just sees `NEEDS_REVIEW`. If the product decides that deserves an explicit,
immediate message, that is a **legitimate new feature** — but see §9: it is *not* a revival of this
branch, and it needs a correct message this branch never had.

---

## 6. The steering guard does NOT depend on this branch — native compliance is unchanged

`CaptureSheet.tsx:96` guard: `if ((isLimit || isMultiDoc) && plan !== 'PRO')`. Removing `isMultiDoc`
yields `if (isLimit && plan !== 'PRO')`. The inner `isNativePlatform()` split (`:97`) and the native
neutral-toast / web-paywall branches are **untouched**.

For a **native** user: nothing changes. `isMultiDoc` was already unreachable (§2), so the native branch
only ever fired on `isLimit` (`LIMIT_REACHED`). After removal it still fires only on `isLimit`.
`setShowPaywall(true)` remains unreachable on native. For a **web** user: also nothing changes — the dead
web arm (`setShowPaywall(true)` via `isMultiDoc`) was never reached either.

**The cleanup is behaviourally inert for all users.** Its entire risk surface is the two traps (the live
i18n key in §3, the false-green test in §4), not any user-facing behaviour. That is the precise sense in
which this is a "behavioural change": it is a *code/test* change with **zero** runtime behaviour delta —
which is exactly why it must not be buried in a restyle, where the test deletion would look like a
regression.

---

## 7. Test coverage — every test touching `isMultiDoc` / `freePlanSingleDoc`

| Test | Drives | Arm | Disposition |
|---|---|---|---|
| `nativeAntiSteering.test.tsx:344–354` (GUARD 1) | 2 files, FREE, native | **LIVE `:64`** multi-file guard | **KEEP** — tripwire for the key |
| `nativeAntiSteering.test.tsx:356+` (GUARD 2) | 1 file, `LIMIT_REACHED` | `isLimit` | KEEP (unaffected) |
| `nativeAntiSteering.test.tsx:432–491` (CaptureSheet) | `LIMIT_REACHED` | `isLimit` | KEEP (unaffected) |
| `uploadGating.test.tsx:86–94` (GATE 1) | 2 files, FREE, web | multi-**file** paywall | KEEP (unaffected) |
| `uploadGating.test.tsx:105–114` (GATE 2 limit) | 1 file, `LIMIT_REACHED`, web | `isLimit` | KEEP (unaffected) |
| **`uploadGating.test.tsx:116–125` (GATE 2 multi-doc)** | fabricated prose rejection | **DEAD `isMultiDoc`** | **DELETE** (§4) |

**Confirmed: no test drives the `isMultiDoc` arm as a real path.** The only test referencing the prose
string (`uploadGating.test.tsx:117`) drives the dead branch via a mock the server cannot produce. Every
anti-steering test that matters drives the `isLimit` (`LIMIT_REACHED`) arm or the LIVE multi-file guard.

---

## 8. What would replace the deleted test

**Client side: nothing is needed.** The real multi-doc path has no client gating behaviour to assert.

**Backend side (recommended, optional strengthening):** the real behaviour — `validateSingleDocument()
=== false → markAsNeedsReview()` — is **currently not directly unit-tested** (grep for
`isSingleDocument` / `validateSingleDocument` / `markAsNeedsReview` across `apps/backend/**/*.test.ts`
returns nothing; the only `NEEDS_REVIEW` references in backend tests are in `dashboardStats.test.ts` and
`staleSweep.test.ts`, which assert on *aggregates*, not this transition). So the false-green client test
was pretending to cover a path that has **no** real coverage anywhere.

A small backend test — mock `geminiAdapter.isSingleDocument → false`, run `processUploadAsync`, assert
`markAsNeedsReview` is called and the doc lands `NEEDS_REVIEW` (and, critically, that **no throw reaches
the caller**) — would pin the actual behaviour. **Recommended, but it is a backend test and can land in
the same commit or a follow-up; it is not a blocker for the client deletion.** Flagging rather than
scope-creeping.

---

## 9. The counter-case, taken seriously, and why it still lands on DELETE

The task rightly warns: do not default to deletion because it is the smaller diff. Steelmanning "make the
server emit it":

> *"Silent `NEEDS_REVIEW` is poor UX. A user who uploads two receipts should be told immediately, 'please
> upload one document at a time,' not left to discover a needs-review flag later."*

That is a reasonable product position. But it does **not** argue for reviving this branch, for three
reasons:

1. **The message is wrong.** `s.freePlanSingleDoc` = *"Free plan supports one document at a time."* The
   server's multi-doc check (`ingestionService.ts:38–45`) is **plan-agnostic** — a PRO user's multi-doc
   upload is *also* flagged `NEEDS_REVIEW` (no plan gate there). Yet the client branch gates on
   `plan !== 'PRO'` and uses a **"Free plan"** string. So the dead branch, if revived, would (a) show a
   *free-plan* message for a limit that is not plan-based, and (b) stay silent for PRO users who hit the
   exact same server behaviour. It also conflates "one **file** per batch" (a real FREE limit, `:60`)
   with "one **document** per image" (a content-detection issue, all plans) under one string. **Reviving
   it ships incorrect messaging.**
2. **It requires a synchronous Gemini call.** To emit the condition *before* the 202, the Gemini vision
   check (§2) moves back into the request path — a latency regression on every upload, reversing
   `82e2697`. The alternative — an *async* notification after the 202 — is a **net-new mechanism** (push
   or poll surfacing a background-detected state), not a string comparison.
3. **So "make the server emit it" is the larger change, not the smaller.** It needs a **new** server
   signal/enum, a **new** correct message, and either a latency regression or a new async-notify path.
   That is a genuine feature, and it should be designed as one — *after* the dead, mis-messaged branch is
   removed, not by resurrecting it.

**Therefore:** delete now. If the product wants explicit multi-doc feedback, open it as a **separate
feature** ("surface `NEEDS_REVIEW` reason to the user") with a correct, plan-agnostic message and a
deliberate sync-vs-async decision. Do not couple that unmade product decision to this cleanup by leaving
dead, wrong code in place as a placeholder — dead code that *looks* live is how the false-green test got
written in the first place.

---

## 10. RECOMMENDATION — what lands

> **DELETE the client-side `isMultiDoc` comparison in both modals. KEEP the `freePlanSingleDoc` i18n key
> (it is live at `UploadModal.tsx:64`). DELETE the false-green `uploadGating.test.tsx:116–125`, citing
> `82e2697`. Do NOT touch the anti-steering guard's structure, the live multi-file guard, or the server.
> If explicit multi-doc UX is wanted, it is a separate, correctly-messaged feature — not a revival.**

### Removed

- `CaptureSheet.tsx:94` — the `isMultiDoc` declaration.
- `CaptureSheet.tsx:96` — `(isLimit || isMultiDoc)` collapses to `isLimit`.
- `CaptureSheet.tsx:100` — `isLimit ? s.freePlanLimitReached : s.freePlanSingleDoc` collapses to
  `s.freePlanLimitReached` (inside the block `isLimit` is now always true). `s.freePlanSingleDoc` leaves
  CaptureSheet entirely (it was the only use).
- `UploadModal.tsx:158` — the `isMultiDoc` declaration.
- `UploadModal.tsx:159` — `(isLimit || isMultiDoc)` collapses to `isLimit`.
- `UploadModal.tsx:162` — the ternary collapses to `s.freePlanLimitReached`.
- `uploadGating.test.tsx:116–125` — the false-green GATE 2 multi-doc test.

### Kept (explicitly)

- **`strings.ts:164` / `:494` / `:819`** — the `freePlanSingleDoc` key, live at `UploadModal.tsx:64`.
- **`UploadModal.tsx:60–68`** — the multi-**file** batch guard, and its coverage
  `nativeAntiSteering.test.tsx:344–354` (must stay green — the tripwire).
- The anti-steering guard structure: `isNativePlatform()` stays the outer decision; the native branch
  still shows a neutral toast and never opens the paywall; `setShowPaywall(true)` stays unreachable on
  native. **Android stays silent.**
- The server: no change. Multi-doc uploads continue to succeed (202) and flag `NEEDS_REVIEW`.

### Tests after the change

- **Dies:** `uploadGating.test.tsx:116–125` (deleted, with reasoning).
- **Replaces it:** nothing client-side is required; optionally a **backend** test pinning
  `isSingleDocument === false → markAsNeedsReview` + no-throw (§8).
- **Must stay green:** `nativeAntiSteering.test.tsx:344–354` (GUARD 1), all other anti-steering and
  gating tests, and the full suite (1782 today).

### A native user's experience after the change

**Identical to today.** The removed arm was unreachable, so no native (or web) user ever saw it.
Multi-doc uploads still return 202, still flag `NEEDS_REVIEW`, still appear in the review flow. The
cleanup removes dead code and a false-green test; it changes **no runtime behaviour**.

---

**Explored from `main` @ `247962cd0c144f002a9a3aeb9f8f382878a4ba82`.** No code, DB, or migration touched.
Every `file:line` re-derived from current source; the backend architecture and the Gemini-call cost
verified in `ingestionService.ts` / `uploadController.ts`; `82e2697` confirmed as the killing commit.
