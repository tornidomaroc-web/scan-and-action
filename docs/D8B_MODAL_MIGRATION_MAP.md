# D8b Modal Migration Map — UploadModal, CaptureSheet, DeleteAccountModal

**Explored from:** `main` @ `11baadd37c243ae4aa5a08d5e4a9fb93453d6269` (working tree clean)
**Mode:** read-only mapping pass. No code, DB, or migration was touched.
**Date:** 2026-07-14

---

## 0. Scope corrections (read this first)

Four things in the original scoping are wrong or incomplete. Corrected with evidence:

| Claim as scoped | Reality | Evidence |
|---|---|---|
| UploadModal truncation `~:310` | It is **`:315`** | `UploadModal.tsx:315` |
| CaptureSheet truncation `~:221` | It is **`:225`** | `CaptureSheet.tsx:225` |
| Guard "CaptureSheet:94" | `:94` is the *dead* `isMultiDoc` line. The **guard** is `:96–:105`; the native branch is `:97` | `CaptureSheet.tsx:94`, `:96`, `:97` |
| Dead branch "matches text the server never emits" | **True, and stronger than stated** — the server *architecturally cannot* emit it (see §6) | `ingestionService.ts:37–45` |

And one item is mis-scoped in the other direction — **there is a fourth defect in DeleteAccountModal that is not a styling issue at all** (raw English server prose rendered to Arabic/French users). See §7.2. It is the single highest-value fix in this whole batch and it would be easy to miss inside a restyle PR.

**The delete-account modal's real filename** is `apps/frontend/src/components/DeleteAccountModal.tsx`. It is mounted from exactly one place, `SettingsScreen.tsx:268`. Do not confuse it with `screens/DeleteAccountInfo.tsx`, which is a **separate public route** (`App.tsx:89`, `/delete-account`) — the Play-Store-required data-deletion information page. It is out of scope.

---

## 1. Current structure

### 1.1 `UploadModal.tsx` — 442 lines

Local state (all `useState`, declared `:22–:29`):

| State | Line |
|---|---|
| `files: File[]` | `:22` |
| `isDragging` | `:23` |
| `uploading` | `:24` |
| `progress` | `:25` |
| `status: 'idle' \| 'success' \| 'error' \| 'partial'` | `:26` |
| `results: {success, total}` | `:27` |
| `fileErrors: Record<string,string>` | `:28` |
| `showPaywall` | `:29` |
| `cameraInputRef` (`useRef`) | `:30` |

Tree: `createPortal` (`:209`) → overlay `:211` → panel `:215` → header `:218` (title `:220`, subtitle `:225`, close `:231`) → body `:239` (camera CTA `:243`, dropzone `:261`, file list `:294–:341`, progress/result block `:343–:430`) → **nested** `<PaywallModal>` at `:435`, rendered *inside* UploadModal's own portal.

### 1.2 `CaptureSheet.tsx` — 260 lines

`forwardRef` + `useImperativeHandle` (`:38`) exposing `open()`. State `:30–:34`: `chooserOpen`, `file`, `previewUrl`, `uploading`, `showPaywall`; refs `cameraInputRef` `:28`, `fileInputRef` `:29`.

Tree: two hidden `<input>`s (`:117`, `:126`) → **two independent portals**: the source chooser (`:135–:188`) and the confirm sheet (`:190–:253`) → `<PaywallModal>` `:255`.

Uses `useBackDismiss` twice (`:44`, `:45`) — the Android hardware-back contract. **Preserve both.**

### 1.3 `DeleteAccountModal.tsx` — 141 lines

State `:19–:21`: `confirmText`, `isDeleting`, `error`. `useBackDismiss` at `:24`.

Tree: `createPortal` `:50` → overlay `:52` → panel `:56` → red header `:62` → body `:82` (warning `:83`, subscription notice `:88`, type-to-confirm input `:98`, error `:113`, actions `:119`).

Type-to-confirm logic at `:32` (case-insensitive email match). `dir="ltr"` on the input (`:104`) is **correct and deliberate** — an email is LTR regardless of UI language. Keep it.

---

## 2. Raw color literals vs `--sa` tokens

**All three modals use ZERO `--sa` token utilities.** Verified by grep for the full token vocabulary (`bg-surface`, `text-ink`, `border-line`, `bg-accent`, `rounded-card`, `rounded-btn`, `shadow-card`, `text-title-lg`, `text-section`, `text-label`, `bg-danger`, `bg-success`…): **0 matches in each file.**

### 2.1 The finding that matters most: these modals are the wrong hue

`tailwind.config.cjs:15` states the token colors are *additive* and deliberately **do not shadow** Tailwind's built-in palette — and `designTokens.test.ts:52–58` **locks that in**, asserting `blue`/`slate`/`gray`/`amber`/`emerald`/`red` are all `undefined` in the theme extension.

Therefore `bg-blue-600` in these modals renders **literal Tailwind blue (#2563EB)** — while the app's actual accent is **indigo `--sa-accent: #635BFF`** (`tokens.css:22`, locked by `designTokens.test.ts:27`).

The primary CTAs in all three modals — `UploadModal.tsx:245` (Scan with Camera), `CaptureSheet.tsx:169` (Take Photo) and `:244` (Extract) — are **visibly a different colour from every restyled screen in the app**. This is not a cleanliness issue; it is a live visual bug. It is the strongest single justification for D8b.

### 2.2 Literal counts (every occurrence has a `file:line`; full enumeration below)

| File | Distinct raw-palette literal sites |
|---|---|
| `UploadModal.tsx` | **~120** across 44 lines |
| `CaptureSheet.tsx` | **~50** across 22 lines |
| `DeleteAccountModal.tsx` | **~40** across 17 lines |

**UploadModal** — lines carrying raw literals:
`211` (`bg-gray-900/80`, `bg-black/60`), `215` (`bg-white`, `bg-slate-900`, `border-slate-800`), `218`, `220`, `225`, `233`, `245` (`bg-blue-600/700`, `shadow-blue-500/25`, `border-blue-500/50`), `264`, `265`, `280`, `281`, `283`, `284`, `286`, `299`, `300`, `305`, `306`, `309`, `311`, `316`, `318`, `326`, `334`, `344`, `345`, `348` (`text-emerald-600`), `350` (`text-amber-600`), `352` (`text-red-600`), `354` (`text-blue-600`), `357`, `361`, `363`, `372`, `373`, `374`, `376`, `377`, `384`, `390`, `400`, `406`, `416`, `419`.

**CaptureSheet** — `137`, `139`, `144`, `148`, `169`, `179`, `192`, `194`, `199`, `200`, `207`, `217`, `220`, `221`, `222`, `225`, `226`, `237`, `244`.

**DeleteAccountModal** — `52`, `56`, `62` (`bg-red-600`), `64`, `65`, `67`, `75`, `83`, `88` (`bg-amber-50`, `border-amber-400`), `89`, `95`, `109`, `114`, `123` (`bg-red-600/700`, `shadow-red-500/20`), `130`.

### 2.3 Token mapping available today

`tailwind.config.cjs:18–91` already exposes everything needed: `accent{,-hover,-text,-tint,-tint-2,-border}`, `surface{,-raised,-alt,-muted}`, `line{,-strong}`, `divider`, `ink{,-secondary,-tertiary,-muted,-faint}`, `success/warning/danger{,-text,-tint}`, `rounded-{nav,btn,card,pill}`, `shadow-{card,raised,lg}`. The destructive red header (`DeleteAccountModal.tsx:62`) maps to `danger`; the amber subscription notice (`:88`) to `warning`; the emerald success block (`UploadModal.tsx:372–390`) to `success`.

### 2.4 Legacy classes still present

`UploadModal.tsx` uses `btn-secondary`/`btn-primary` at `:384`, `:390`, `:400`, `:406`, `:419`, `:425`. These are on the **forbidden LEGACY list** of the established restyle standard (`documentDetailRestyle.test.tsx:471`).

---

## 3. Coarse / hardcoded typography

The type scale exists (`tailwind.config.cjs:84–91`): `text-kpi` (32px), `text-title-lg` (24px), `text-section` (15px), `text-label` (12px). Five screens already use it (`ActivityScreen.tsx:70`, `DashboardScreen.tsx:242`, `DocumentDetailScreen.tsx:157`, `ReviewQueueScreen.tsx:127`, `SearchScreen.tsx:106`/`:109`). **None of the three modals use any of it.**

### 3.1 `font-black` — forbidden by the existing standard

`documentDetailRestyle.test.tsx:484–488` asserts restyled source contains **no `font-black`** and **no `rounded-[32px]`/`rounded-[40px]`**.

- `UploadModal.tsx` — **9 × `font-black`**: `:245`, `:357`, `:376`, `:384`, `:390`, `:400`, `:406`, `:419`, `:425`
- `CaptureSheet.tsx` — **7 ×**: `:144`, `:169`, `:179`, `:199`, `:225`, `:237`, `:244`
- `DeleteAccountModal.tsx` — **3 ×**: `:67`, `:95`, `:123`
- `DeleteAccountModal.tsx:56` carries **`rounded-t-[32px] sm:rounded-[32px]`** — literally the forbidden mega-card radius.

### 3.2 Ad-hoc sizes that should become type classes

- Titles: `text-2xl` (`UploadModal.tsx:220`, `DeleteAccountModal.tsx:67`), `text-xl` (`UploadModal.tsx:376`), `text-lg` (`UploadModal.tsx:283`, `CaptureSheet.tsx:144`, `:199`) → `text-title-lg` / `text-section`.
- Arbitrary micro-sizes: **`text-[10px]`** (`UploadModal.tsx:318`, `CaptureSheet.tsx:226`) and **`text-[11px]`** (`UploadModal.tsx:334`) → `text-label`.
- `uppercase tracking-wider` shouting on every CaptureSheet button (`:169`, `:179`, `:237`, `:244`) and the `uppercase italic` title at `DeleteAccountModal.tsx:67` are out of step with the restyled screens' calm voice.

---

## 4. Class-B RTL truncation sites

**Why CI cannot catch these:** `rtlTruncation.test.ts:25–31` says so explicitly — the guard covers **Class A only** (a `<bdi>` isolate swallowing `dir="auto"` on a truncating box, regex at `:51`). It states: *"It CANNOT catch Class B — a truncating box holding user text with NO dir at all."* Green CI here proves nothing. Confirmed by hand:

**Every `truncate` occurrence in all three modals (exhaustive):**

| Site | Content | `dir`? | Verdict |
|---|---|---|---|
| `UploadModal.tsx:315` | `{f.name}` — user filename | **none** | **Class-B defect** |
| `CaptureSheet.tsx:225` | `{file.name}` — user filename | **none** | **Class-B defect** |

Both recorded sites **confirmed** (at the corrected line numbers). **There are no others** — those are the only two `truncate` classes in the three files. `DeleteAccountModal.tsx` has **no `truncate` at all**, so it has zero Class-B exposure; its only `dir` is the correct `dir="ltr"` at `:104`.

**Impact:** in the Arabic UI the page direction is RTL, so a truncating box with no `dir` inherits RTL and clips a **Latin** filename from its *leading* (identifying) end — the mirror image of the bug PR #91 fixed for Arabic filenames.

**The correct idiom is already established** — `dir="auto"` **on** the truncating element, no isolate child:
`ResultTable.tsx:124`, `ActivityScreen.tsx:114`, `DashboardScreen.tsx:477`, `DocumentDetailScreen.tsx:157`, `ReviewQueueScreen.tsx:192`.

**Fix:** add `dir="auto"` to `UploadModal.tsx:315` and `CaptureSheet.tsx:225`. Do **not** wrap in `<bdi>` — that would create the Class-A bug and *would* fail CI (`rtlTruncation.test.ts:60`).

---

## 5. Silent-steering guards — ALL THREE CONFIRMED PRESENT AND COVERED

`nativeAntiSteering.test.tsx:277–288` names exactly these three ("UploadModal L61 + L157, CaptureSheet L94").

| Guard | Source | Native branch | Test |
|---|---|---|---|
| **G1** multi-file batch, FREE | `UploadModal.tsx:60–75` (`:61` = `plan === 'FREE'`) | `:62–:64` → `showToast(s.freePlanSingleDoc)`, **no paywall** | `nativeAntiSteering.test.tsx:339` |
| **G2** upload rejected, non-PRO | `UploadModal.tsx:157–172` (`:157` = `isLimit`) | `:160–:162` → neutral toast, **no paywall** | `:351` and `:372` |
| **G3** upload rejected, non-PRO | `CaptureSheet.tsx:93–109` (guard at `:96`) | `:97–:100` → neutral toast, **no paywall** | `:464` |

All three verified present. The tests assert the strong contract via `expectSilentNative()` (`:293–302`): the neutral message shows, **the paywall never opens at all** (`:297`), no price (`:298`), no CTA (`:299`), and the Paddle SDK is never touched (`:300–301`).

**One nuance the scoping did not capture, and it matters for §6:** all three tests drive the **`isLimit` (`LIMIT_REACHED`) arm only**. **No test exercises the `isMultiDoc` arm** of G2/G3. So the dead branch is not merely unreachable in production — it is also **unprotected by the anti-steering suite**, which is another reason to delete it rather than restyle around it.

> **Constraint:** do not weaken, reorder, or "simplify" any of these branches. The `isNativePlatform()` check must remain the *outer* decision on the native side, and `setShowPaywall(true)` must remain unreachable on native.

---

## 6. The dead `isMultiDoc` branch — confirmed dead, with a live-path trap

### 6.1 Proof it is dead (three independent lines of evidence)

1. **The string exists nowhere in the backend.** `'Please upload a single document per image'` appears in exactly three places repo-wide (source only, excluding build artifacts): `CaptureSheet.tsx:94`, `UploadModal.tsx:158`, and `uploadGating.test.tsx:117`. **Zero backend occurrences.**

2. **`err.message` can only ever be an enum.** `uploadService.ts:23` throws `data?.error || data?.message || …` — `data.error` takes precedence, and the upload endpoint's `error` values are only ever `ACCOUNT_RESTRICTED` (`uploadController.ts:20`), `LIMIT_REACHED` (`:36`), `DAILY_LIMIT_REACHED` (`:54`), or `'No image file uploaded'` (`:61`). The prose string is not among them.

3. **Architecturally impossible.** The multi-document check now runs **after** the HTTP response is already sent. `uploadController.ts:85` returns **202** immediately, then `:93` fires `processUploadAsync` in `setImmediate`. Inside it, `ingestionService.ts:37–45` performs the single-document validation and, on failure, **marks the document `NEEDS_REVIEW` and returns — it does not throw to the client.** The upload call the modal awaited has already succeeded. Commit **`82e2697` "Moved single-document validation from synchronous upload to async background processing"** is exactly when this branch died.

### 6.2 The trap — naive cleanup breaks a live path

`s.freePlanSingleDoc` has **two different reachabilities**, and they differ per file:

- **`UploadModal.tsx:64` — LIVE.** This is the *multi-file batch* guard (G1), reached whenever a FREE user selects 2+ files. It is covered by `nativeAntiSteering.test.tsx:339`. **Deleting `s.freePlanSingleDoc` or the string key breaks a real, tested, native-compliance path.**
- **`UploadModal.tsx:162` — DEAD.** The `: s.freePlanSingleDoc` arm of the ternary fires only when `isMultiDoc` is true.
- **`CaptureSheet.tsx:100` — DEAD, and it is the *only* use in that file.** CaptureSheet handles one file at a time and has no multi-file guard, so `s.freePlanSingleDoc` is reachable there **exclusively** through the dead branch.

**Consequence, stated precisely:**
- In **CaptureSheet**, removing `isMultiDoc` collapses `(isLimit || isMultiDoc)` (`:96`) to `isLimit`, and the `s.freePlanSingleDoc` reference at `:100` disappears cleanly with it.
- In **UploadModal**, removing `isMultiDoc` collapses the same condition at `:159`, but **`s.freePlanSingleDoc` must survive at `:64`.** The i18n key must be kept in `strings.ts`.

A cleanup driven by "this string is unused, delete the key" — the obvious move after removing the dead branch from both files — **silently breaks the multi-file native guard.**

### 6.3 The second trap: a green test pins the dead code

`uploadGating.test.tsx:116–125`, *"GATE 2: the multi-document validation error also paywalls non-PRO users"*, mocks `uploadDocument` to reject with the dead prose string (`:117`) and asserts the paywall opens (`:124`).

**This test passes today and tests a path that production cannot produce.** It is a false-green pinning dead code. When the branch is removed, this test **will fail**, and the failure will look like a regression in paywall behaviour. The risk is that whoever sees it red "fixes" it by restoring the branch — or worse, loosens the guard.

**It must be deleted in the same commit as the branch**, with the reasoning recorded. This is precisely why the cleanup should not be buried inside a restyle diff.

---

## 7. i18n gaps

Every translation key the three modals *do* reference resolves in **all three locales** (verified: `upload`, `uploadSuccess`, `uploadError`, `uploading`, `scanWithCamera`, `dropFiles`, `browse`, `supportedFormats`, `freePlanSingleDoc`, `freePlanLimitReached`, `dailyLimitReached`, `uploadFailedGeneric`, `addDocument`, `takePhoto`, `chooseFile`, `retake`, `extract`, `cameraPermissionDenied`, and all 7 `deleteAccount*` keys — each appears exactly 3× in `strings.ts`, i.e. en/fr/ar).

**So the gap is not missing keys. It is strings that were never routed through the layer at all.**

### 7.1 `UploadModal` — 19 untranslated user-visible strings

| Line | String |
|---|---|
| `:72` | `'Verifying account status...'` (toast) |
| `:82` | `'Duplicate files ignored'` (toast) |
| `:185` | `` `Uploaded ${totalCount} document${…}. Processing in background...` `` — also **hand-rolled English pluralization**, which cannot work in Arabic (6 plural forms) |
| `:189` | `` `Uploaded ${successCount}/${totalCount} documents. Some failed.` `` |
| `:196` | `'Batch processing interrupted.'` |
| `:223` | `'Partial Success'` (title) |
| `:226` | `'Select one or more files for AI extraction.'` |
| `:227` | `'Uploaded. Extraction continues in the background. You can close this.'` |
| `:228` | `'Please review the status of your items below.'` |
| `:327` | `aria-label="Remove file"` |
| `:350` | `'Partial Success (n/m)'` |
| `:376` | `'Uploaded'` |
| `:378` | `'Extraction runs in the background. Track it from the processing chip.'` |
| `:387` | `'Done'` |
| `:392`, `:408` | `'Manage Files'` |
| `:403` | `'Close Modal'` |
| `:421` | `'Cancel'` |
| `:427` | `` `Start Extraction (${files.length})` `` |

Note `nativeAntiSteering.test.tsx:356` and `uploadGating.test.tsx:110` locate the submit button by the literal string `'Start Extraction (1)'`. Translating `:427` **will break those tests** — they must be updated to query by `data-testid` or by `strings.en.*`. Expect it; don't panic and revert.

### 7.2 `DeleteAccountModal` — the real defect: raw server English reaches Arabic users

`DeleteAccountModal.tsx:45` does `setError(err?.message || s.deleteAccountError)` and renders it verbatim at `:113–:117`.

Where does `err.message` come from? `accountService.ts:19`:

```ts
throw new Error(data.message || data.error || 'Failed to delete account');
```

It **prefers `data.message`** — the *inverse* precedence of `uploadService.ts:23` (`data?.error || data?.message`). And the backend's `message` fields are English prose:

- `accountController.ts:39–40` → `'Type your account email exactly to confirm deletion.'`
- `accountController.ts:70–72` → `'You belong to a workspace with other members. Remove the other members or contact support before deleting your account.'`

**So a French or Arabic user who hits the shared-workspace 409 sees a raw English sentence.** This is exactly the pattern `uploadErrors.ts:13–25` forbids in a screaming block comment — *"DO NOT render the backend's `message` field. Ever."* — and `DeleteAccountModal` is the one component still doing it.

**Honest severity assessment:** this is **not** an anti-steering breach *today*. Neither message contains a price, a CTA, or upsell copy, and `nativeAntiSteering.test.tsx` would not catch it if it did. It is an **i18n correctness bug with a latent policy shape** — the very shape `uploadErrors.ts:16–25` and `nativeAntiSteering.test.tsx:389–424` were written to defend against on the *upload* path. The upload path is protected; the account path is not.

**Fix:** a `translateAccountError(code, s)` helper mirroring `translateUploadError`, keyed on the `data.error` enums (`CONFIRMATION_REQUIRED`, `SHARED_WORKSPACE`), plus flipping `accountService.ts:19` to `data.error || data.message`. This is a behavioural fix and deserves its own commit.

### 7.3 `CaptureSheet` — 3 gaps

`:87` `'Uploaded. Processing in background...'` (toast); `aria-label="Close"` at `:147` and `:206`.

---

## 8. Shared primitives

### 8.1 Already correctly reused — do not regress

- **`translateUploadError`** (`lib/uploadErrors.ts:43`) — already used by `UploadModal.tsx:165`, `:171`, `:335` and `CaptureSheet.tsx:103`, `:108`. This is the PR #95 fix. Keep it; keep the raw code in state and translate only at the render site.
- **`useBackDismiss`** — `CaptureSheet.tsx:44`, `:45`; `DeleteAccountModal.tsx:24`.
- **`isNativePlatform`** (`native/shell.ts`) — the single anti-steering gate.

### 8.2 Listed in the scoping but genuinely **not applicable** — I am pushing back

- **`EmptyState`** (`components/EmptyState.tsx:13`) — takes `message`/`description`/`icon` for an *empty list*. None of these three modals renders a list that can be empty. UploadModal's idle dropzone (`:261–:290`) is an *input affordance*, not an empty state; forcing `EmptyState` into it would be a worse component, not a better one. **Skip.**
- **`getStatus`** (`lib/searchResultCard.ts:88`) and **`formatDateValue`** (`lib/formatCellValue.ts:32`) — these operate on *document rows* (status enums, fact dates). These modals render **no document status and no dates**. **Skip both.** Reaching for them here would be cargo-culting the D5/D7 restyles.

### 8.3 Primitives that are genuinely missing and *should* be created

1. **A shared modal/sheet shell.** The duplication is now literal. `DeleteAccountModal.tsx:52` and `PaywallModal.tsx:52` / `:141` carry **byte-identical** overlay class strings:
   ```
   fixed inset-0 z-[11000] flex justify-center items-end sm:items-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300
   ```
   Four components hand-roll `createPortal` + overlay + `stopPropagation` + a z-index picked by hand: `UploadModal.tsx:209`/`z-[10000]`, `CaptureSheet.tsx:137`+`:192`/`z-[10000]`, `DeleteAccountModal.tsx:50`/`z-[11000]`, `PaywallModal.tsx`/`z-[11000]`, `ProWelcome.tsx:20`/`z-[12000]`. The z-index ladder is undocumented folklore. **Extract `ModalShell` (centered) and `SheetShell` (bottom-sheet) with a named z-index scale.** This is the single highest-leverage structural output of D8b.

2. **A file-size/type formatter.** `UploadModal.tsx:319` and `CaptureSheet.tsx:227` contain the **identical** expression:
   ```tsx
   {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type.split('/')[1]?.toUpperCase() || 'FILE'}
   ```
   The `'MB'` and `'FILE'` literals are untranslated, and the number is not locale-grouped — `lib/formatNumber.ts:13` exports `formatCount(value, language)` for exactly that, and `activityRestyle.test.tsx:65` already establishes that raw ungrouped numbers are a defect. **Extract `formatFileMeta(file, s, lang)`.**

3. **`translateAccountError`** — see §7.2.

### 8.4 The standard D8b must meet

The restyle contract is already codified in `documentDetailRestyle.test.tsx:457–489` (per-file source scan) and `activityRestyle.test.tsx:117`, `:146–183` (token scan + DOM-level RTL Class-B guard). D8b should add the same shape for the three modals: no `RAW_PALETTE` (`:465–470`), no `LEGACY` (`:471`), no `font-black`/`rounded-[32px]` (`:484–488`), plus a **DOM-level** Arabic-render assertion that the filename box carries `dir="auto"` — because, per §4, source-level CI cannot catch Class B.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Deleting the dead branch also deletes `s.freePlanSingleDoc`, silently breaking the **live** multi-file native guard (`UploadModal.tsx:64`) | Keep the key. `nativeAntiSteering.test.tsx:339` is the tripwire — it must stay green |
| R2 | `uploadGating.test.tsx:116–125` goes red when the dead branch is removed and is misread as a regression | Delete that test **in the same commit**, with the `82e2697` reasoning in the message |
| R3 | Translating `'Start Extraction'` breaks the button queries in `nativeAntiSteering.test.tsx:356` and `uploadGating.test.tsx:110` | Switch those queries to `data-testid` **before** touching the copy |
| R4 | A restyle that replaces `PaywallModal` with an inline upgrade CTA turns G1–G3 into the *only* anti-steering defence — `nativeAntiSteering.test.tsx:280–283` warns of exactly this | **Do not** inline any upgrade CTA into these modals in D8b |
| R5 | Green CI is mistaken for RTL correctness | Verify Arabic in a real browser. `rtlTruncation.test.ts:25–31` disclaims Class-B coverage in writing |

---

## 10. FINAL RECOMMENDATION — implementation order

> ### **DeleteAccountModal → CaptureSheet → UploadModal**, with the `isMultiDoc` cleanup as a **separate commit landing between CaptureSheet and UploadModal.**

**Why DeleteAccountModal first.** The D-series has restyled five *screens* and **zero modals**. The modal design vocabulary — overlay, sheet vs. centered panel, header, footer button pair, the z-index ladder — **does not exist yet**. It has to be invented somewhere, and the correct place to invent it is the surface with the *least* to lose. DeleteAccountModal is 141 lines, holds **three** state variables, has **no `plan` prop, no upload, no paywall, and zero anti-steering guards**, and has **zero Class-B truncation exposure** (§4). It is also the most flagrantly off-standard (`rounded-[32px]` at `:56` is the literal forbidden radius; `uppercase italic` at `:67`), so the visual payoff is immediate and obvious. Its blast radius if botched is "a user cannot delete their account" — contained, and with no Play-policy exposure. It additionally carries the **§7.2 raw-English-prose fix**, which is the highest-value defect in this batch and which deserves to land where it will actually be *read* in review rather than buried under 120 colour-literal changes.

**Why CaptureSheet second.** It validates the new vocabulary against the *bottom-sheet* variant (two portals, `:135` and `:190`) and against the **native back-button contract** (`:44`, `:45`) — both of which UploadModal does not exercise. It introduces exactly **one** anti-steering guard (G3) and **one** Class-B site (`:225`), so the compliance-sensitive surface is small enough to review properly. Critically, its `isMultiDoc` removal is the **clean** one: `s.freePlanSingleDoc` is reachable there *only* through the dead branch (§6.2), so the collapse `(isLimit || isMultiDoc)` → `isLimit` is total and local, with no live path to preserve. It is the ideal place to prove the cleanup pattern before applying it where it is dangerous.

**Why the cleanup is its own commit, in the middle.** It is a **behavioural** change, not a restyle. It deletes a live-looking branch in two files and **deletes a currently-green test** (`uploadGating.test.tsx:116–125`). Bundled into a 120-literal restyle diff, that test deletion is invisible to a reviewer and reads like someone dropping an inconvenient failure. Standalone, with commit `82e2697` and `ingestionService.ts:37–45` cited, it is self-evidently correct. Landing it **before** the UploadModal restyle also means the restyle never has to reason about the dead branch at all — it inherits a `startUpload` whose error path is already a clean `isLimit`-only guard.

**Why UploadModal last.** It is the worst of every axis simultaneously: **442 lines**, **8 state variables**, **~120 raw literals**, **9 `font-black`**, **6 legacy `btn-*`**, **19 untranslated strings**, **two** anti-steering guards, **the** `freePlanSingleDoc` live-vs-dead trap (§6.2), and the two test queries that break the moment its copy is translated (R3). Every one of those is easier to get right *after* the modal vocabulary is settled (DeleteAccountModal), the sheet/native-guard variant is proven (CaptureSheet), and the dead branch is already gone (the cleanup commit). Doing it first would mean inventing the design system inside the component with the highest chance of a silent Play-policy regression.

**The one counter-argument, and why I reject it.** "Do the hardest first, while context is freshest" is the usual instinct, and here it is wrong. The binding constraint on this work is **not** effort — it is the risk of a silent anti-steering regression, and that risk is concentrated entirely in UploadModal. Front-loading it maximises exposure at exactly the moment the team has the least settled idea of what a restyled modal should look like, and guarantees that the compliance-critical guards get rewritten twice (once now, once when the vocabulary inevitably shifts). The proposed order spends the two low-risk modals *buying certainty* about the vocabulary, and only then touches the surface where a mistake is expensive.

**Do not, in any of the three PRs:** touch `App.tsx`; weaken G1/G2/G3; inline an upgrade CTA or a price into any modal; or treat green CI as evidence of Arabic correctness — open the Arabic UI in a real browser and look at the filename boxes at `UploadModal.tsx:315` and `CaptureSheet.tsx:225`.

---

## APPENDIX — corrections appended 2026-07-16 (after PR #96 merged)

*The body above is preserved as written on 2026-07-14, explored from `main` @ `11baadd3`. It is a historical record; where later work disproved or superseded a claim, the correction is recorded here rather than edited into the original. Verified against `main` @ `7a2cfe3f`.*

### C1. §7.2's proposed fix was insufficient — superseded before it shipped

§7.2 recommends:

> *"…plus flipping `accountService.ts:19` to `data.error || data.message`."*

**That was wrong, and PR #96 did not do it.** The flip assumes `data.error` is always a machine code. It is not — the backend puts **English prose in `data.error`, with no `message` field at all**:

- `errorHandler.ts:48` → `{ error: 'Internal Server Error', errorId }` (production, any 500)
- `errorHandler.ts:16` → `{ error: 'Conflict: A record with that unique value already exists.' }`
- `authMiddleware.ts:114` → `{ error: 'Missing or malformed access token' }`
- `authMiddleware.ts:130` → `{ error: 'Unauthorized: Invalid or expired token' }`

So a precedence flip alone still leaks raw English on every 500, every Prisma fault and every expired-token 401. The load-bearing half is the **whitelist with a translated fallback**, not the flip. What shipped drops `data.message` from the chain **entirely** (`data.error || 'DELETE_FAILED'`). Full reasoning: `docs/D8B_PR1_DELETE_ACCOUNT_ERROR_FIX.md` §0 and §4.2.

§7.2 also under-counted the failure shapes: it names two (`CONFIRMATION_REQUIRED`, `SHARED_WORKSPACE`) where there are **seven**, including `RATE_LIMITED` and a non-HTTP `TypeError('Failed to fetch')` from the unguarded `fetch`.

### C2. §8.3 item 3 is DONE

`translateAccountError` shipped in **PR #96** as `lib/accountErrors.ts`. §8.3 items 1 (`ModalShell`/`SheetShell`) and 2 (`formatFileMeta`) remain open.

### C3. DeleteAccountModal line references in §1.3, §2.2, §3.1 and §7.2 are now STALE

PR #96 added ~5 lines to `DeleteAccountModal.tsx` (141 → 146). **Everything below the error state shifted by +5.** The findings hold; only the anchors moved:

| §-reference | Was (@ `11baadd3`) | Now (@ `7a2cfe3f`) |
|---|---|---|
| state block | `:19–:21` | `:20`, `:21`, `:24` |
| `useBackDismiss` | `:24` | `:27` |
| `canDelete` | `:32` | `:35` |
| `createPortal` | `:50` | `:55` |
| overlay | `:52` | `:57` |
| panel + `rounded-[32px]` | `:56` | `:61` |
| red header `bg-red-600` | `:62` | `:67` |
| `uppercase italic` h2 | `:67` | `:72` |
| amber notice `bg-amber-50` | `:88` | `:93` |
| label `font-black` | `:95` | `:100` |
| `dir="ltr"` input | `:104` | `:109` |
| error `role="alert"` | `:113` | `:119` |
| confirm button | `:120` | `:126` |

**The error block at `:119` is no longer a defect site** — it now renders `translateAccountError(error, s)`, and `error` holds a raw code. The remaining DeleteAccountModal findings (raw palette, `font-black`, `rounded-[32px]`, `uppercase italic`) are untouched by #96 and stand.

**`UploadModal.tsx` and `CaptureSheet.tsx` line references are UNAFFECTED** — #96 did not touch either file. §0's truncation corrections (`UploadModal.tsx:315`, `CaptureSheet.tsx:225`) are re-verified and still exact.

### C4. Minor — §2.1's reserved-palette list

`designTokens.test.ts:52–58` asserts `blue`, `slate`, `gray`, `amber`, `emerald`, **`rose`**, `red` are all `undefined`. §2.1 omits `rose`. The finding is unchanged and correct.

### C5. §6.1's `ingestionService.ts` path

The file is at **`apps/backend/src/services/ingestion/ingestionService.ts`** (not `services/`). The cited line range `:37–45` is **exact**, and commit `82e2697` ("Moved single-document validation from synchronous upload to async background processing", 2026-03-28) is confirmed.
