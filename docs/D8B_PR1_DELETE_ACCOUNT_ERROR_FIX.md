# D8b PR-1 — DeleteAccountModal raw-server-message fix (bug-fix only)

**Explored from:** `main` @ `11baadd37c243ae4aa5a08d5e4a9fb93453d6269`
(working tree clean apart from the untracked `docs/D8B_MODAL_MIGRATION_MAP.md` from the prior pass)
**Mode:** read-only. No code, no DB, no migrations touched.
**Scope:** bug-fix only. No tokens, no restyle, no `App.tsx`, no anti-steering changes.

---

## 0. Correction to the previous report — read this first

`docs/D8B_MODAL_MIGRATION_MAP.md` §7.2 recommended:

> *"…plus flipping `accountService.ts:19` to `data.error || data.message`."*

**That fix, on its own, is insufficient — and I was wrong to present it as the fix.** It assumes `data.error` is always a machine code. It is not.

`errorHandler.ts` puts **English prose into `data.error`**, with no `message` field at all:

- `errorHandler.ts:48` → `{ error: 'Internal Server Error', errorId }` (production, any 500)
- `errorHandler.ts:16` → `{ error: 'Conflict: A record with that unique value already exists.' }`
- `errorHandler.ts:21` → `{ error: 'Bad Request: A referenced record does not exist.' }`
- `errorHandler.ts:26` → `{ error: 'Not Found: The requested record does not exist.' }`
- `errorHandler.ts:31` → `{ error: 'Validation Error', details, errorId }`

And `authMiddleware.ts` does the same:

- `authMiddleware.ts:114` → `{ error: 'Missing or malformed access token' }`
- `authMiddleware.ts:130` → `{ error: 'Unauthorized: Invalid or expired token' }`

So a precedence flip alone still leaks raw English on every 500, every Prisma fault, and every expired-token 401. **The load-bearing half of the fix is the whitelist-with-translated-fallback**, not the precedence flip. The flip is still needed — but for a different reason than I gave (see §4.2). This is exactly why `translateUploadError` is safe: it is a *whitelist*, so prose it does not recognise falls through to translated generic copy (`uploadErrors.ts:44–46`).

---

## 1. Every error shape the delete path can produce

The route is `DELETE /api/account` → `accountRoutes.ts:12`, which chains `accountDeletionLimiter` → `AccountController.deleteAccount`, under the global `authMiddleware` (`accountRoutes.ts:10`).

**Six distinct failure shapes can reach `DeleteAccountModal.tsx:45`.** Only two of them are the ones the framing anticipated.

| # | Trigger | Status | `error` | `message` | Source |
|---|---|---|---|---|---|
| 1 | Confirmation mismatch | 400 | `CONFIRMATION_REQUIRED` | `'Type your account email exactly to confirm deletion.'` | `accountController.ts:38–41` |
| 2 | Multi-member org | 409 | `SHARED_WORKSPACE` | `'You belong to a workspace with other members. Remove the other members or contact support before deleting your account.'` | `accountController.ts:69–73` |
| 3 | >5 attempts/hour | 429 | `RATE_LIMITED` | `'Too many account-deletion attempts. Please wait a while and try again.'` | `rateLimits.ts:63–70`, shape from `limitResponse` at `rateLimits.ts:8–11` |
| 4 | Missing/malformed token | 401 | `'Missing or malformed access token'` | *(absent)* | `authMiddleware.ts:114` |
| 5 | Expired/invalid token | 401 | `'Unauthorized: Invalid or expired token'` | *(absent)* | `authMiddleware.ts:130` |
| 6 | Any thrown error → `next(err)` | 500 (or Prisma-mapped 409/400/404) | English prose (see §0) | *(absent)* | `accountController.ts:112` → `errorHandler.ts` |

**Plus a seventh, non-HTTP shape:** the `fetch` at `accountService.ts:11` is **not wrapped in try/catch**. On a network failure it rejects with a `TypeError` whose `.message` is `'Failed to fetch'` (browser-generated, locale-independent English). That propagates straight through `DeleteAccountModal.tsx:44` to `:45` and renders. **This is a real leak the framing missed** — and on a mobile device, a dropped connection mid-delete is far more likely than a shared-workspace 409.

### 1.1 Reachability notes (do not over-invest in code 1)

**`CONFIRMATION_REQUIRED` is nearly unreachable from the UI.** `DeleteAccountModal.tsx:32` computes `canDelete` from a case-insensitive email match, and `:122` disables the button unless `canDelete`. So the client cannot normally submit a mismatched confirmation; the 400 is server-side defence-in-depth. It can still fire on a race (the session email changed server-side) or a direct API call. **Map it for completeness, but it is not a UX priority.**

**`SHARED_WORKSPACE` is itself rare today.** `accountController.ts:21–22` states the product "only ever creates solo orgs (one OWNER, no invite flow)". So the 409 is a fail-safe for a condition the product cannot currently create.

**Therefore the *most likely* raw-English leak a real user hits is not the 409 at all — it is #6 (a 500) or the network failure.** That reframes the bug: it is not "a rare 409 shows English", it is **"every unexpected failure of account deletion shows English prose to every non-English user."** The fix is more valuable than the framing suggested, and its centre of gravity is the *fallback*, not the 409 copy.

---

## 2. The client path today

```
accountController / authMiddleware / errorHandler / rateLimits
        │  JSON body: { error, message? }
        ▼
accountService.ts:17-20
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || 'Failed to delete account');
        }                    ▲
        │                    └── PREFERS the prose `message` — the origin of the bug
        ▼  (or: fetch itself rejects → TypeError('Failed to fetch'), never caught)
DeleteAccountModal.tsx:44-46
        catch (err: any) {
          setError(err?.message || s.deleteAccountError);   // :45  stores raw English
          setIsDeleting(false);
        }
        ▼
DeleteAccountModal.tsx:113-117
        {error && <p role="alert" ...>{error}</p>}          // renders it verbatim
```

**State stored:** `error: string | null` (`DeleteAccountModal.tsx:21`), holding **fully-formed display text** — not a code. That is the second half of the defect: there is no separation between "what went wrong" and "what we say about it".

**Note the inversion.** `uploadService.ts:23` throws `data?.error || data?.message` (**code first**). `accountService.ts:19` throws `data.message || data.error` (**prose first**). The two services disagree, and `uploadErrors.ts:13–25` documents *in a screaming block comment* which one is correct:

> `accountService` is the one component still violating the project's own stated doctrine.

---

## 3. How `uploadErrors.ts` solves the analogous problem

`lib/uploadErrors.ts` — 47 lines. Its shape, precisely:

- **Input:** `translateUploadError(code: string | null | undefined, s: Strings)` (`:43`). Takes a *raw code*, tolerates `null`/`undefined`/garbage.
- **Mapping:** a **whitelist** `CODE_TO_KEY: Record<string,string>` (`:28–34`) — `LIMIT_REACHED → freePlanLimitReached`, `DAILY_LIMIT_REACHED → dailyLimitReached`. Nothing else is recognised.
- **Normalisation:** `code.trim().toUpperCase()` (`:44`) before lookup.
- **Output:** the translated string, or — for **anything unrecognised** — a **translated generic**, `s.uploadFailedGeneric` (`:46`). It **never returns its input**.
- **Where translation happens:** at the **render site only**. `UploadModal.tsx:155` stores the *raw* code in state; `:335` translates it inside the JSX. Same in `CaptureSheet.tsx:92` (raw) → `:103`/`:108` (translated at the toast call).
- **The stated doctrine** (`uploadErrors.ts:13–25`): *"DO NOT render the backend's `message` field. Ever."* Because the server's prose is (a) untranslated and (b) on the upload path, upsell copy that would be a Play-policy breach inside the native shell.

**The property that makes it robust** — and the one that matters here — is that it is a **whitelist with a translated fallback**. Hand it a full English sentence and it returns generic translated copy (proved by `uploadErrorI18n.test.tsx:110–114`). That is precisely the defence needed against error shapes #4, #5, #6 and the network TypeError, none of which are enums.

---

## 4. Shared helper vs inline — RECOMMENDATION

### 4.1 Recommendation: **a shared helper, `lib/accountErrors.ts`, mirroring `uploadErrors.ts`.**

The "only three codes, just inline it" argument **counts the wrong thing.** Code count is not what decides this. Three reasons:

1. **The helper is not there to hold three mappings — it is there to hold the *discipline*.** The thing that actually fixes the bug is "whitelist known codes, translate; return translated generic for everything else, never the input." Inlined as an `if/else` in the modal, that discipline is invisible and one careless edit from regressing. As a named pure function with the doctrine in a header comment, it is self-documenting and greppable. `uploadErrors.ts:13–25` exists for exactly this reason and has already paid for itself (PR #95).

2. **Testability — this is the decisive one.** `uploadErrorI18n.test.tsx:110–114` can assert *"never returns the backend message, even when handed it verbatim"* **only because the mapping is a pure function**. That negative control is the single most valuable test in the whole fix (§6). Inline handling forces every one of those assertions through a full DOM mount with mocked `useAuth`, `useBackDismiss` and `accountService` — slower, noisier, and it cannot test the `null`/`undefined`/whitespace edge cases at all.

3. **Symmetry.** One error-translation module per service, same shape, same name pattern. A reviewer who understands `uploadErrors` understands `accountErrors` for free. Two divergent idioms for the same problem in the same codebase is how the current inversion (`data.error` vs `data.message`) happened in the first place.

**Cost:** ~20 lines. **Against:** ~15 lines of inline `if/else` that is harder to test and re-derives a doctrine the project has already written down. Take the helper.

### 4.2 The precedence flip is still required — but for a *different* reason than I originally gave

With the whitelist in place, the flip at `accountService.ts:19` is **not** what makes the fix safe (the whitelist is). It is what makes the fix **not lose information**:

- If `data.message` stays first, `SHARED_WORKSPACE` throws the *prose*, the whitelist doesn't recognise it, and the user gets the **generic** *"Could not delete your account. Please try again."* — which is **less useful than today's English sentence**. The user would no longer learn that they must remove workspace members first. That is a UX regression.
- Flipping to `data.error` first means the *code* reaches the helper, which maps it to the specific translated copy.

**Recommended form:**

```ts
// accountService.ts:19
throw new Error(data.error || 'DELETE_FAILED');
```

**Drop `data.message` from the chain entirely.** The whitelist would neutralise it anyway, but removing the prose source outright is defence-in-depth and makes the intent legible: *the client never touches the server's prose.* `data.error` is present on every error body produced by all four backend sources (§1), so nothing is lost; `'DELETE_FAILED'` covers a malformed/empty body.

### 4.3 Keep the raw code in state, translate at the render site

`DeleteAccountModal.tsx:21` should store the **raw code**, and `:113–117` should translate:

```tsx
{error && <p role="alert" ...>{translateAccountError(error, s)}</p>}
```

Two reasons — and I want to be honest that only the first is strong:

- **Consistency with the established discipline** (`UploadModal.tsx:155` raw → `:335` translated). One idiom, applied everywhere.
- **Language-reactivity:** stored display *text* would not update if the user switched language with the error on screen; a stored *code* re-translates on re-render. This is a marginal scenario (switching language mid-delete-modal), and I would not argue for the change on this ground alone — but it costs nothing and it comes free with the consistent idiom.

Unlike `UploadModal`, there is **no gating logic keyed off the code here** — `DeleteAccountModal` only displays it — so this is a style/consistency call, not a correctness one. Stating that plainly so nobody thinks it is load-bearing.

---

## 5. i18n keys

**Parity is enforced at runtime**, contrary to what the bare object literal suggests: `strings` (`strings.ts:1`) has **no type annotation and no `satisfies`**, so TypeScript will *not* catch a missing `fr`/`ar` key — but `renderScreens.test.tsx:168–170` asserts `Object.keys(strings.fr)` and `Object.keys(strings.ar)` both equal `Object.keys(strings.en)`. **A key added to `en` alone fails CI.** Good; no action needed, but know which layer is protecting you — it is a test, not the compiler.

### 5.1 Already exists — reuse as the fallback

| Key | en | fr | ar |
|---|---|---|---|
| `deleteAccountError` | `strings.ts:183` — *'Could not delete your account. Please try again.'* | `:505` | `:827` |

This is **exactly the right generic fallback** — it already reads as a generic retry message, mirroring `uploadFailedGeneric` (`:171`/`:493`/`:815`). **No new generic key is needed.**

### 5.2 Must be added — 3 new keys × 3 locales = 9 entries

| Key | Maps from | Suggested en copy |
|---|---|---|
| `deleteAccountSharedWorkspace` | `SHARED_WORKSPACE` (§1 #2) | *'Your workspace has other members. Remove them, or contact support, before deleting your account.'* |
| `deleteAccountRateLimited` | `RATE_LIMITED` (§1 #3) | *'Too many attempts. Please wait a while and try again.'* |
| `deleteAccountConfirmRequired` | `CONFIRMATION_REQUIRED` (§1 #1) | *'Type your account email exactly to confirm.'* |

Insert adjacent to the existing `deleteAccount*` block (`en` after `:183`, `fr` after `:505`, `ar` after `:827`) to keep the three locale blocks aligned.

**Codes #4, #5, #6 and the network TypeError get NO key** — they are deliberately unmapped and fall through to `deleteAccountError`. That is the design, not an omission: a 500 or an expired token has nothing useful and non-alarming to say to an end user, and `errorHandler.ts:44–49` already returns a correlation `errorId` for support to trace.

> **Do not trust green CI for the Arabic copy.** `renderScreens.test.tsx:168–170` proves the *keys exist*, not that the Arabic *reads correctly* or renders RTL. The new strings must be eyeballed in the Arabic UI.

---

## 6. Test coverage

### 6.1 What exists today: **nothing**

Grepping `apps/frontend/tests` and `apps/backend/src` for `DeleteAccountModal`, `accountService`, and `deleteAccount` returns **only the two backend source files themselves** — `accountController.ts` and `accountRoutes.ts`. **There is no test, frontend or backend, that exercises the account-deletion path at all.**

Three suites render `SettingsScreen` (`nativeAntiSteering.test.tsx`, `renderScreens.test.tsx`, `settingsPreferences.test.tsx`), which mounts `DeleteAccountModal` at `SettingsScreen.tsx:268` — but it is mounted **closed**, and `DeleteAccountModal.tsx:26` returns `null` when `!isOpen`. **Zero effective coverage.**

So this PR writes the *first* tests for this path. That is a feature, not a burden: it means there is no existing test to fight with, and no equivalent of the `uploadGating.test.tsx:116–125` false-green trap documented in the migration map.

### 6.2 What to add — `apps/frontend/tests/accountErrorI18n.test.tsx`

Mirror `uploadErrorI18n.test.tsx` beat for beat.

**A. Unit — `translateAccountError` (the pure function)**

1. Maps each known code to its translated copy **in all three locales** — pattern from `uploadErrorI18n.test.tsx:93–99`.
2. Unknown code, `''`, `null`, `undefined`, whitespace → returns `s.deleteAccountError`, **never the input** — pattern from `:101–106`.

3. **THE NEGATIVE CONTROL — the most important test in this PR.** Pattern from `uploadErrorI18n.test.tsx:110–114` and `nativeAntiSteering.test.tsx:403–424`. Hand the helper each raw English server string **verbatim** and assert it returns translated generic copy and does not contain the English:

   - `'You belong to a workspace with other members. Remove the other members or contact support before deleting your account.'` (`accountController.ts:72`)
   - `'Type your account email exactly to confirm deletion.'` (`accountController.ts:40`)
   - `'Too many account-deletion attempts. Please wait a while and try again.'` (`rateLimits.ts:69`)
   - `'Internal Server Error'` (`errorHandler.ts:48`)
   - `'Unauthorized: Invalid or expired token'` (`authMiddleware.ts:130`)
   - `'Failed to fetch'` (browser network failure, §1)

   This test is what proves the leak is closed **by construction** — it passes even if someone later flips the precedence back at `accountService.ts:19`, exactly as `nativeAntiSteering.test.tsx:403` was written to survive a precedence flip on the upload path.

**B. DOM — `DeleteAccountModal` renders translated copy, never English**

Mount with `accountService.deleteAccount` mocked to reject. Mocks required (all precedented in `nativeAntiSteering.test.tsx`): `useAuth` → a user with an `email` (`:39–46`, needed so `canDelete` at `DeleteAccountModal.tsx:32` can be satisfied), `useBackDismiss` (`:54`), and `../src/services/accountService`.

Driving it: type the user's email into `#delete-confirm` (`DeleteAccountModal.tsx:99`) to satisfy `canDelete`, then click the confirm button (`:120`).

4. **FR**: reject with `SHARED_WORKSPACE` → asserts `strings.fr.deleteAccountSharedWorkspace` is in the DOM, and `'SHARED_WORKSPACE'` is **not**, and `'You belong to a workspace'` is **not**.
5. **AR**: same, with `strings.ar.deleteAccountSharedWorkspace`.
6. **DOM negative control**: reject with the raw English *sentence* (simulating a regression at `accountService.ts:19`) → asserts `strings.ar.deleteAccountError` renders and `'You belong to a workspace'` never reaches `document.body.textContent`.
7. **Network failure**: reject with `new TypeError('Failed to fetch')` → asserts translated generic renders, `'Failed to fetch'` absent.

**C. i18n parity for the 3 new keys** — the `documentDetailRestyle.test.tsx:124–133` shape (per-locale, `typeof === 'string'` and non-empty). Partly redundant with `renderScreens.test.tsx:168–170`, but it is the established precedent for new keys and it catches an empty-string key, which the parity test does not.

---

## 7. Risks & out-of-scope flags

| # | Item | Call |
|---|---|---|
| R1 | Flipping `accountService.ts:19` **without** the whitelist still leaks prose on 500/401/network (§0) | Both halves must land together. The helper is the load-bearing one |
| R2 | No existing test covers this path, so there is no safety net for the refactor | The new suite (§6.2) *is* the net; write it first |
| R3 | `strings.ts` has no compile-time parity; only `renderScreens.test.tsx:168–170` guards it | Add all 9 entries in one edit |
| R4 | Arabic copy correctness | Green CI proves key existence only. Eyeball the Arabic UI |
| R5 | **Out of scope, flagged not fixed:** `deleteAccountSubscriptionWarning` (`DeleteAccountModal.tsx:90`, `strings.ts:178`) names "the App Store or Google Play, and web subscriptions via the billing portal" and renders **inside the native shell**. It is required cancellation disclosure, contains no price and no purchase CTA, and `nativeAntiSteering.test.tsx` does not cover `DeleteAccountModal` at all | **Do not touch it in this PR.** Worth a deliberate second look during the D8b restyle PR — noting only that it is currently unguarded by any anti-steering test |

**Anti-steering:** this PR touches no guard. `DeleteAccountModal` has no `plan` prop, no paywall, no upload, and no `isNativePlatform()` branch — confirmed by reading all 141 lines. `translateAccountError`'s whitelist-with-generic-fallback is, if anything, *strictly protective*: it makes it structurally impossible for a future backend `message` containing upsell copy to reach the native DOM on this path — the same protection `uploadErrors.ts:16–25` gives the upload path.

---

## 8. FINAL RECOMMENDED APPROACH

> **Add `lib/accountErrors.ts` exporting `translateAccountError(code, s)` — a whitelist of the three real codes with `s.deleteAccountError` as the translated fallback. Change `accountService.ts:19` to throw `data.error || 'DELETE_FAILED'` (dropping `data.message` from the chain entirely). Store the raw code in `DeleteAccountModal`'s `error` state and translate at the render site (`:113–117`). Add 3 new i18n keys × 3 locales. Ship it with `accountErrorI18n.test.tsx`, whose centrepiece is a negative control asserting that every raw English server string — handed to the helper verbatim — comes back as translated generic copy.**

**Why this and not the alternatives.**

*Why not just flip the precedence* (my own earlier suggestion): because `data.error` is **not** always a code. `errorHandler.ts:48` and `authMiddleware.ts:130` put English prose there, with no `message` field to prefer instead. A flip alone fixes the 409 and leaks on every 500, every expired token, and every dropped connection — which, per §1.1, are **the failures a real user is actually most likely to hit**, since the product cannot currently even create the multi-member org that produces the 409. The flip fixes the rarest case and misses the common ones.

*Why not inline the mapping in the modal*: three codes is a tempting argument, but it optimises the wrong variable. The helper's value is the *whitelist-with-translated-fallback discipline* — which is what actually neutralises the six unmapped shapes — and, decisively, the fact that a pure function can be handed the backend's raw English **verbatim** in a unit test and asserted never to return it. That negative control (`uploadErrorI18n.test.tsx:110`) is the strongest guarantee in the existing codebase that this class of bug stays fixed, and it is only writable against a pure function.

*Why the fallback needs no new key*: `deleteAccountError` (`strings.ts:183`/`:505`/`:827`) already exists in all three locales and already reads as a generic retry message. Reuse it.

**The one-line summary of the bug, restated correctly:** it is not "a rare 409 shows English to Arabic users." It is **"the account-delete path has no translation layer at all, so *every* failure mode — 500, expired token, rate limit, dropped connection — renders raw English, and the 409 is merely the case someone happened to notice."** The fix should be sized to that, and the recommended approach is.

---

## APPENDIX — corrections appended 2026-07-16 (as-shipped, PR #96)

*The body above is preserved as written, explored from `main` @ `11baadd3`. Corrections are recorded here rather than edited into the original.*

### C1. §5's parity-test citation is off by one line

The plan cites `renderScreens.test.tsx:168–170`. The assertion actually spans **`:167–:171`**:

```
:167  it('all three locales expose the same string keys (no missing translations)', ...
:168    const enKeys = Object.keys(strings.en).sort();
:169    expect(Object.keys(strings.fr).sort()).toEqual(enKeys);
:170    expect(Object.keys(strings.ar).sort()).toEqual(enKeys);
:171  });
```

**The substance is exactly right** — parity is enforced by a test, not the compiler, and a key added to `en` alone fails CI. Only the anchor was imprecise.

### C2. As-shipped deviations from §8

Two details the plan did not specify, decided during implementation:

1. **The network code is `NETWORK_ERROR`, and the try/catch wraps ONLY the `fetch` call** — not the method body. Wrapping the body would swallow the `!res.ok` throw beneath it and collapse **every** HTTP error (including `SHARED_WORKSPACE`) into `NETWORK_ERROR`, destroying the mapping this PR exists to build. The boundary is load-bearing; the comment at `accountService.ts` records why.
2. **`DeleteAccountModal`'s catch stores `err?.message || 'DELETE_FAILED'`** rather than the plan's implied `s.deleteAccountError`, keeping state a raw code end-to-end per §4.3.

### C3. Verification performed beyond the plan

- **Mutation-tested, not merely green.** Reverting the render site to `{error}` fails **7 of the DOM tests**, proving they drive the component rather than passing vacuously.
- **Arabic verified by Unicode code point** (§5's warning taken literally): all three new AR strings are Arabic-block `U+0600–06FF` only, **zero Latin letters**, no bidi/zero-width controls. Code points do **not** prove the copy reads naturally or lays out correctly RTL — that still needs a human eyeball in the Arabic UI.

### C4. §1's shape table — all seven confirmed against source

Re-verified at `7a2cfe3f`: `accountController.ts:38–41` (`CONFIRMATION_REQUIRED`), `:69–73` (`SHARED_WORKSPACE`), `rateLimits.ts:8–11` + `:63–70` (`RATE_LIMITED`), `authMiddleware.ts:114`/`:130` (prose), `errorHandler.ts:16`/`:48` (prose), plus the unguarded `fetch`. No claim in §1 was disproven.
