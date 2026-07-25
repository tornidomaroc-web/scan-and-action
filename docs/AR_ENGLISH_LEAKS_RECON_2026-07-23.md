# Audit item #7 — English leaks on the Arabic core path — recon

**Date:** 2026-07-23 · **Status:** RECON ONLY. No code changed, no new files except this doc, no deps, no prod contact.
**Repo:** main @ `d6a797f381b43432d6d193b53e6f99f6faf77f73`. i18n is `src/i18n/strings.ts` (en/fr/ar), consumed via `useStrings()` → `s.*`.

---

## 0. Verdict up front (correcting the audit's framing)

The audit calls #7 "English leaks in the Arabic core path (per-scan completion messages, upload buttons)."
That framing is **imprecise in three ways**, and #7 is **bigger than it reads**:

1. **"per-scan completion messages"** — REAL, and it's the **single highest-reach leak in the app**. But it is not in a
   "scan" component — it's `ProcessingContext.tsx:94-98`, fired on **every** document settle. (§2, §4)
2. **"upload buttons"** — MISLEADING. The primary scan buttons (`newScan`, `scanWithCamera`, `uploadData`) are
   **already localized**. What actually leaks is the **UploadModal** (desktop upload flow): its toasts, status copy,
   and action buttons — ~13 hardcoded strings. (§2)
3. The **confirmed** SettingsScreen leak (Abo Jad saw it) is not a missing translation — it's a **duplicate copy** of
   feature text we already localized in #118. That changes the fix from "translate" to "consolidate onto shared keys."
   (§1, §3)

The real shape of #7: a handful of **core-path** leaks (toasts + one modal + the Settings bullets) that every Arabic
user hits in the normal flow, plus a tail of **failure-only** leaks. It is a *structural* defect — user-facing text
written as a string literal at the sink instead of routed through `s.*` — not a translation gap. (§5)

---

## 1. THE CONFIRMED LEAK — SettingsScreen feature bullets (duplicate, not missing)

`src/screens/SettingsScreen.tsx`, the **web** FREE-plan subscription card (the `else` branch, non-native):

| Line | Hardcoded English | Renders as (CSS `uppercase`) | Already-localized key that covers it |
|---|---|---|---|
| `:193` | `Unlimited document scans` | UNLIMITED DOCUMENT SCANS | `paywallFeatureUnlimited` — `strings.ts:175` EN / `:896` AR (`مسح غير محدود للمستندات`) — **exact concept** |
| `:197` | `High-volume batch uploads` | HIGH-VOLUME BATCH UPLOADS | `paywallFeatureBatch` — `:176`/`:897` (`رفع عدّة ملفات دفعة واحدة`) — **same concept, different wording** ("Upload multiple files at once") |
| `:201` | `Faster processing workflow` | FASTER PROCESSING WORKFLOW | `paywallFeatureFaster` — `:177`/`:899` (`معالجة أسرع`) — **exact English match** |

(The audit reported these in all-caps; the source is title-case — they're uppercased by the `uppercase tracking-tight`
class. Cosmetic, but worth noting the audit is describing rendered output, not source.)

**Fix is "reuse existing keys," not "add new ones."** All three concepts already have approved AR/FR values from #118.
The card should render `s.paywallFeatureUnlimited / …Batch / …Faster`. Only caveat: the batch bullet's English wording
differs slightly — reusing the key changes the English string too ("High-volume batch uploads" → "Upload multiple
files at once"). That's an improvement (one source of truth) but Abo Jad should be told the EN copy shifts.

**Note the native branch is already clean:** the `isNativePlatform()` FREE card (`:162-175`) uses `s.freeTier`,
`s.freeLimit`, `s.proAutoUnlock` — all localized. Only the **web** branch (`:177-212`) has the raw bullets. So this
leak is web-only (desktop + mobile web AR users), not native.

---

## 2. FULL ENUMERATION — ranked by whether a real Arabic user reaches it

### CORE PATH — every Arabic user hits these in the normal flow

| # | File:line | English | Screen / state | Reach |
|---|---|---|---|---|
| A | `contexts/ProcessingContext.tsx:94` | `${name} processed successfully.` | Toast on **every** successful scan settle | **Highest** — fires on every scan |
| A | `contexts/ProcessingContext.tsx:96` | `${name} needs review.` | Toast on NEEDS_REVIEW settle | High |
| A | `contexts/ProcessingContext.tsx:98` | `${name} could not be processed.` | Toast on FAILED settle | High |
| A | `contexts/ProcessingContext.tsx:92` | `'Document'` (fallback when `fileName` missing) | Interpolated into A above | Low (name usually present) |
| B | `components/CaptureSheet.tsx:90` | `Uploaded. Processing in background...` | Toast after **mobile** capture upload | High (mobile core) |
| C | `components/UploadModal.tsx:85` | `Verifying account status...` | Toast, **desktop** upload, plan not yet known | Med |
| C | `components/UploadModal.tsx:95` | `Duplicate files ignored` | Toast, desktop upload | Med |
| C | `components/UploadModal.tsx:197` | `Uploaded ${n} document(s). Processing in background...` | Toast, desktop upload success | **High (desktop core)** |
| C | `components/UploadModal.tsx:201` | `Uploaded ${x}/${y} documents. Some failed.` | Toast, partial success | Med |
| C | `components/UploadModal.tsx:208` | `Batch processing interrupted.` | Toast, batch error | Low |
| C | `components/UploadModal.tsx:235,362` | `Partial Success` | Modal status header | Med |
| C | `components/UploadModal.tsx:238` | `Select one or more files for AI extraction.` | Modal subtitle (idle) | **High** |
| C | `components/UploadModal.tsx:239` | `Uploaded. Extraction continues in the background. You can close this.` | Modal subtitle (success) | High |
| C | `components/UploadModal.tsx:241` | `Please review the status of your items below.` | Modal subtitle (error/partial) | Med |
| C | `components/UploadModal.tsx:388` | `Uploaded` | Success card heading | High |
| C | `components/UploadModal.tsx:390-391` | `Extraction runs in the background. Track it from the processing chip.` | Success card body | High |
| C | `components/UploadModal.tsx:398` | `Done` | Button | High |
| C | `components/UploadModal.tsx:404,420` | `Manage Files` | Button | High |
| C | `components/UploadModal.tsx:414` | `Close Modal` | Button | Med |
| C | `components/UploadModal.tsx:433` | `Cancel` | Button | High |
| C | `components/UploadModal.tsx:439` | `Start Extraction (${n})` | **Primary CTA** | **High** |
| D | `screens/SettingsScreen.tsx:193,197,201` | 3 feature bullets | Web FREE billing card | High (§1) |

Groups: **A** = per-scan completion (the audit's item, confirmed). **B/C** = the upload surfaces (the audit's "upload
buttons," corrected: it's the modal, not the tab buttons). **D** = the confirmed Settings leak.

### EDGE STATES — only on failure or a narrow condition

| File:line | English | Trigger | Reach |
|---|---|---|---|
| `screens/DashboardScreen.tsx:135,137,142` | 3 connection/error sentences | Backend stats/activity fetch fails; rendered as `ErrorState message` (`:176`, title is localized `s.connectionError`) | Failure-only |
| `screens/DocumentDetailScreen.tsx:70` | raw `err.message` (e.g. `Failed to load document`, `documentService.ts:12`) → `ErrorState message` (`:100`) | Document load failure | Failure-only |
| `components/Sidebar.tsx:73` | `Checking for your PRO upgrade...` | Desktop sidebar "refresh subscription" button | Rare, desktop |
| `screens/AuthScreen.tsx:43` | `err.message` (Supabase English) `|| s.authGenericError` | Auth error with a server message | Failure-only, login |

### ACCESSIBILITY (not visible text, but AR screen-reader users get English)

`aria-label="Close"` (CaptureSheet `:149,208`; PaywallModal `:144,264`; ProcessingTray `:67`), `aria-label="Primary"`
(BottomTabBar `:57`), `aria-label="Remove file"` (UploadModal `:339`), `title="Refresh subscription status"`
(Sidebar `:219`). Low priority; cheap to fold into whichever PR touches each file.

### DEFERRED (no language switcher / intentionally English)

- `screens/LandingScreen.tsx` — **entirely** English (`:13-227`). Anonymous, pre-auth, **no language switcher** → every
  visitor gets English regardless of eventual `lang`. Flagged by you already. Localizing it means Accept-Language
  auto-detection, a product decision, not a string swap.
- Legal pages — `PrivacyPolicy.tsx`, `RefundPolicy.tsx`, `TermsOfService.tsx`, `DeleteAccountInfo.tsx` — fully English.
  Legal copy is commonly English-of-record; defer and decide deliberately.

### REFUTED — things that look like leaks but are already handled

- **Upload error catch paths** (`CaptureSheet.tsx:105,110`, `UploadModal.tsx:177,183`) route `err.message` through
  `translateUploadError` (`lib/uploadErrors.ts`), which maps known codes to `s.*` and falls back to a **localized**
  `uploadFailedGeneric`. Raw English service throws (`uploadService.ts:23`, `documentService.ts:*`) are **masked** here.
- **Search / ReviewQueue / Activity errors** are localized: `s.searchFailed`/`s.autoRunFailed` (`SearchScreen.tsx:57,80`),
  `s.queueFetchError` (`ReviewQueueScreen.tsx:84`), `s.failedActivity` (`ActivityScreen.tsx:29`).
- The audit's **"upload buttons"** as literally the scan CTAs: `newScan`, `scanWithCamera`, `uploadData`, `scanReceipt`
  are all localized (`strings.ts`). The leak is inside the **UploadModal**, not on those buttons.

---

## 3. DUPLICATE-COPY PATTERN — systemic enough to change the fix

**Yes, it's a pattern, with two clear instances — not a one-off, but not sprawling either:**

1. **Feature copy exists twice.** `SettingsScreen.tsx:193-201` (raw English bullets) duplicates
   `paywallFeatureUnlimited/Batch/Faster` (`strings.ts`, localized in #118). One copy localized, one not. (§1)
2. **Completion status exists twice.** A **localized** `processingDone` ('Processing complete' / 'اكتملت المعالجة')
   is used by the tray chip (`ProcessingTray.tsx:38`), while the **per-document** completion toasts
   (`ProcessingContext.tsx:94-98`) are a **separate, hardcoded** English system. Same concept, two implementations,
   only one localized.

**Implication for the fix:** for instance 1, the correct action is **consolidate onto the shared paywall keys**, not
"translate the bullets" (translating them would create a *third* copy to drift). For instance 2, the per-scan toasts
need their own keys (there's no single existing key for "X processed successfully" — `processingDone` is an aggregate,
not per-file), so those are genuinely **new keys**. So: SettingsScreen = reuse; ProcessingContext = add. Mixed.

---

## 4. TOASTS / ERRORS / EMPTY / LOADING / VALIDATION — the classic sites

- **Toasts:** the biggest cluster (group A/B/C above). Every hardcoded toast in the app is on the upload/scan path:
  `ProcessingContext:94-98`, `CaptureSheet:90`, `UploadModal:85,95,197,201,208`, `Sidebar:73`. Every *localized* toast
  routes through `s.*` (`ReviewQueueScreen:107,113`, `DocumentDetailScreen:55,59`, `AuthScreen:40`). The split is clean:
  the newer review/auth toasts were localized; the older upload/processing toasts were not.
- **Errors:** localized except `DashboardScreen:135-142`, `DocumentDetailScreen:70` (raw `err.message`), `AuthScreen:43`
  (fallback ok, but a server `message` passes through). (§2 Edge)
- **Empty states:** localized — `s.emptyBody`, `s.noMatchingDataDesc`, `s.intelligencePulseDesc`, `s.finishBatchDesc`
  (`strings.ts:352,147,224,225`). No leak found.
- **Loading states:** `s.uploading`, `s.fixProcessing`, `s.statusProcessing` localized. The hardcoded `'Verifying account
  status...'` (`UploadModal:85`) is the exception.
- **Validation:** `FixActionPanel.tsx` uses `s.fixErrorAmount`/`s.fixErrorJustification` (`:36,39`). Clean, except its
  catch renders `err.message` (`:48` → `:124`) — same edge pattern as DocumentDetail.

---

## 5. WHY THE #118 GUARD DIDN'T CATCH THESE — and can it be widened?

**What #118's guard is** (`tests/paywallLocalization.test.tsx:214-262`): it mounts `PaywallModal` under `lang=ar` and
asserts (a) no value from a **curated `FORBIDDEN_EN` list of EN-catalog strings** appears in the DOM, and (b) the AR
catalog values **do** appear. It's precise and low-false-positive **because it compares against the catalog** — it never
asks "is this Latin?", it asks "did a *known English catalog value* render under ar?". That's why "PRO", "CSV",
"Scan & Action", "MAD 90.00" (all Latin) don't trip it.

**Why it can't see #7:** the leaks in §2 are **string literals that were never in the catalog at all**. There is no
`FORBIDDEN_EN` entry for "Batch processing interrupted." because it isn't a catalog key. A catalog-diff guard is
structurally blind to net-new hardcoded English — which is the entire bug class here.

**Can it be widened? Two honest options, one trap:**

- **TRAP — a generic "no Latin/English under lang=ar" render guard, app-wide.** Infeasible. The core screens legitimately
  render Latin the guard can't distinguish from a leak: **user data** (filenames like `Document`, extracted merchant
  names like "Starbucks Coffee", table values), **brand/technical tokens** (`PRO`, `CSV`, `Scan & Action`, `MAD`, emails,
  URLs), and Paddle's own currency strings. It would need to whitelist half the app — worse than none, by your own
  criterion.
- **FEASIBLE but partial — extend the #118 render pattern per screen.** Mount each localized screen under `ar`, assert
  its screen-specific EN-catalog values don't render. Low false-positive, catches *mis-wired/bypassed* keys — but still
  **cannot** catch hardcoded literals with no catalog equivalent. Useful as regression insurance *after* the strings are
  in the catalog; useless for finding the current leaks.
- **BEST — a STRUCTURAL guard, not a render guard.** An ESLint `no-restricted-syntax` rule (or a small source-scanning
  test) that forbids **string-literal arguments to the known user-facing sinks** — `showToast(...)`, `setError(...)`,
  `setErrorMsg(...)` — and hardcoded JSX **text nodes** inside a curated `core-path` component set (the screens +
  CaptureSheet/UploadModal/ProcessingContext/Sidebar). It targets the **sink and the shape** ("a literal reached a
  user-facing sink"), not the language, so user data and brand tokens don't false-positive. This is the only approach
  that would make *this class* fail CI. It needs a small allowlist (e.g. `throw new Error('useAuth must be…')` developer
  strings, `aria-label` decisions) — bounded and honest, not "half the app."

**Assessment:** the app-wide *render* guard is not worth building. The **structural sink guard is** — it's the thing that
converts "found by Abo Jad's eye" into "fails CI," and its false-positive surface is small and enumerable.

---

## 6. SCOPE BOUNDARY — where to draw the first PR

**PR 1 — core-path visible leaks (ship first, highest reach):** groups A + B + C + D from §2.
- `ProcessingContext.tsx:92-98` (per-scan toasts — new keys, with `{name}` placeholder + a localized 'Document' fallback)
- `CaptureSheet.tsx:90` (new key, or reuse an "uploaded, processing" key shared with UploadModal)
- `UploadModal.tsx` (toasts + status subtitles + buttons — ~13 strings; some reuse existing keys like `s.uploading`)
- `SettingsScreen.tsx:193-201` (**reuse** `paywallFeature*` — §1)
- Fold in the `aria-label`s in these same files while they're open.
This is one coherent PR: "localize the scan/upload completion surface." Every string is core-path and visible.

**PR 2 — failure-only edge leaks (ship after):** `DashboardScreen:135-142`, `DocumentDetailScreen:70`,
`FixActionPanel:48`, `Sidebar:73`, `AuthScreen:43`. Lower reach; needs new error keys; can be reviewed without blocking PR 1.

**PR 3 (optional but recommended) — the structural sink guard** (§5). Build it **after** PR 1/2 land, so it starts green
rather than reporting 30 pre-existing violations. Without it, this class recurs on the next feature.

**Deferred (separate decision, not this audit item):** `LandingScreen` + legal pages. Landing has **no switcher**, so
localizing it is really "add Accept-Language detection for anonymous visitors" — a product call. Note explicitly so it
isn't mistaken for an oversight.

**What needs Abo Jad's eye:**
- **AR copy sign-off (code points)** for every new key in PR 1/2 — same discipline as #118 (his finals, not machine
  translation). This is the actual gate on shipping.
- **On-device visual check**, Arabic: complete one scan and read the completion toast; open the desktop upload modal and
  the mobile capture sheet; view the web Settings FREE card. Confirm RTL + no clipped/È mojibake.

---

## RECOMMENDATION (single, explicit)

**Two fix PRs + one guard PR, in that order.**

1. **PR 1 — the scan/upload completion surface** (§2 groups A–D). This is #7's real substance and every Arabic user hits
   it. Mix of **reuse** (SettingsScreen → existing `paywallFeature*` keys) and **new keys** (the per-scan toasts,
   UploadModal). Blocks on Abo Jad's AR code-point sign-off, exactly like #118.
2. **PR 2 — failure-only edge leaks** (Dashboard/DocumentDetail/Fix/Sidebar/Auth). Independent, lower reach, ship after.
3. **PR 3 — a structural CI guard** that forbids string-literal args to `showToast`/`setError`/`setErrorMsg` and
   hardcoded JSX text in the core component set. **Worth building** (low, enumerable false-positive surface); the
   app-wide *render* "no-English" guard is **not** worth building (user data + brand tokens force a whitelist bigger than
   the app). Land it last so it starts green.

**Defer** LandingScreen + legal pages as a separate, deliberate localization decision (Landing has no switcher — that's
auto-detection work, not #7).

**Correcting the audit:** #7 is **bigger than "two things"** (it's the whole scan/upload completion surface, ~25
strings), the "upload buttons" pointer is **wrong** (the tab CTAs are localized; the *modal* isn't), and the confirmed
Settings leak is a **duplicate-copy** defect (reuse, don't translate) — the fix is consolidation plus new keys for the
toasts, gated on Abo Jad's Arabic sign-off.
