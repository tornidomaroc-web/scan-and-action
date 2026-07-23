# Photo & Video Permissions rejection — compliance recon

**Date:** 2026-07-23 · **Status:** RECON ONLY. No code changed, no deps installed, no Gradle sync, no build, no prod contact.
**Trigger:** Google Play REJECTION of `com.scanaction.app` versionCode 3 under the **Photo and Video Permissions** policy (changes were NOT published — this blocks release).
**Repo state:** main @ `4d0753c30b0a34ad8e033f88f6b0a2b4004ff9b9`.

---

## 0. The rejection, restated precisely (one correction to the framing)

Google's stated detail: *"Policy Declaration for Photo Picker: Your app only requires one-time or infrequent
access to media files on the device."* Policy: apps targeting Android 13+ (API 33+) may request
`READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` only when a system picker is technically insufficient for core
functionality. Recommended fix: use the Android photo picker / a system picker, remove the broad permissions
from **all** tracks, resubmit.

**Correction to the premise.** The rejection email says the app "requests `READ_MEDIA_IMAGES` and/or
`READ_MEDIA_VIDEO`." In this project that is **half true, and the true half is even easier than Google
assumes**:

- We ship **`READ_MEDIA_IMAGES`** — yes. (§1)
- We do **not** ship `READ_MEDIA_VIDEO` — it appears **nowhere** in the project. (§1)
- More importantly: **we already use the system picker.** The app never held broad media access for any real
  reason — the permission is **vestigial**, declared by hand in our own manifest, and used by **zero** code
  paths. (§2)

So the corrected framing is: this is **not** a "switch to the picker" migration. We are already on the
picker. It is a **one-line permission deletion**. Google's recommended remediation over-scopes the work
because it can't see that our media entry was never library-wide to begin with.

---

## 1. WHERE THE PERMISSION COMES FROM — ours, not a plugin

**It is declared by hand in our own manifest, not merged in by any Capacitor plugin.**

| Fact | Evidence |
|---|---|
| `READ_MEDIA_IMAGES`, **no `maxSdkVersion`** (→ applies on API 33+, the flagged case) | `apps/frontend/android/app/src/main/AndroidManifest.xml:51` |
| `READ_EXTERNAL_STORAGE` capped `maxSdkVersion="32"` (legacy; **not** flagged, does not apply on 13+) | `apps/frontend/android/app/src/main/AndroidManifest.xml:52-54` |
| `CAMERA` (kept — real, runtime-requested; see §2) | `apps/frontend/android/app/src/main/AndroidManifest.xml:46` |
| A hand-written comment already admits the picker/SAF path "are actually permissionless" and rationalises the permission for "older OEM WebViews" | `AndroidManifest.xml:48-50` |

**Merger blame proves it is ours, not a dependency:**

- `android/app/build/outputs/logs/manifest-merger-release-report.txt:146-149`
  → `uses-permission#android.permission.READ_MEDIA_IMAGES` **ADDED from … AndroidManifest.xml:51**.
- Every Capacitor plugin manifest declares **zero** `uses-permission` (verified count = 0 for all four):
  `@capacitor/app`, `@capacitor/camera`, `@capacitor/splash-screen`, `@capacitor/status-bar`
  (`node_modules/@capacitor/*/android/src/main/AndroidManifest.xml`). `@capacitor/camera`'s manifest only
  declares a `<queries>` for `IMAGE_CAPTURE` — no permissions at all
  (`node_modules/@capacitor/camera/android/src/main/AndroidManifest.xml:1-7`).
- `READ_MEDIA_VIDEO` is **absent** from `android/` and `node_modules/@capacitor` entirely (grep, build dirs
  excluded).

**What actually shipped in the rejected vc3 bundle** (release merged manifest —
`android/app/build/intermediates/merged_manifest/release/…/AndroidManifest.xml`, versionCode `3` confirmed in
the packaged manifest): `INTERNET`, `CAMERA`, **`READ_MEDIA_IMAGES`**, `READ_EXTERNAL_STORAGE`(≤32), optional
camera `uses-feature` ×2, and the AndroidX-injected `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
`READ_MEDIA_IMAGES` with no `maxSdkVersion` is exactly the broad API-33+ grant Google flagged.

**Consequence for the fix:** because the permission is **ours**, the fix is a plain **deletion** of the line —
**not** a `tools:node="remove"` override (that idiom is only needed to strip a permission a *dependency*
merges in; nothing does that here). No plugin swap. (§4)

---

## 2. WHAT THE APP ACTUALLY USES — a user-initiated file pick, always

Every path to get a document into the app is a **WebView `<input type="file">`** — the permissionless system
chooser (which on API 33+ is the Android photo picker for images and SAF for PDFs). There is **no**
library-wide media read anywhere.

**Two capture surfaces, four inputs, all `<input type=file>`:**

| Surface | Input | Evidence |
|---|---|---|
| CaptureSheet — "Take Photo" | `<input type=file accept="image/*" capture="environment">` → `ACTION_IMAGE_CAPTURE` | `CaptureSheet.tsx:119-127` |
| CaptureSheet — "Choose File" | `<input type=file accept="image/*,application/pdf">` → system chooser | `CaptureSheet.tsx:128-135` |
| UploadModal — "Scan with Camera" | `<input type=file accept="image/*" capture="environment">` | `UploadModal.tsx:262-269` |
| UploadModal — drop zone / browse | `<input type=file multiple accept=".pdf,.png,.jpg,.jpeg">` | `UploadModal.tsx:283-289` |

Selected `File` objects flow straight into `preprocessImage()` → `uploadDocument()`
(`CaptureSheet.tsx:84-85`, `UploadModal.tsx:66,155`). The bytes come from the chooser's granted `content://`
URI via the WebView — **the app never touches `MediaStore` and never enumerates the library.**

**`@capacitor/camera` (7.0.5) is used for its permission API only — never for capture.** `camera.ts`
requests **only** the `camera` permission (`camera.ts:18` → `requestPermissions({ permissions: ['camera'] })`)
to unblock the `ACTION_IMAGE_CAPTURE` that the `<input capture>` fires; its own header states it uses the
plugin "purely for its permission API — not its `getPhoto()` capture" (`camera.ts:4-9`). Confirmed by grep:
**no** `getPhoto`, **no** `pickImages`/`pickMedia`, **no** `photos` permission request, **no**
`@capacitor/filesystem` (not installed), **no** `MediaStore` access anywhere in `src/`.

**Native path vs web path: identical.** One `<input>` code path serves both; native only adds the CAMERA
runtime gate (`CaptureSheet.tsx:163`). Nothing reads arbitrary media on either.

---

## 3. IS THE PICKER SUFFICIENT? — yes, with zero feature loss

The honest test is "would we lose any real capability by relying on the system picker?" The answer is **no —
because we already rely on it.** Removing `READ_MEDIA_IMAGES` changes nothing a user can do:

- **Take Photo** works on `CAMERA` (kept) + `ACTION_IMAGE_CAPTURE` + the `FileProvider`
  (`AndroidManifest.xml:27-35`) — never used `READ_MEDIA_IMAGES`.
- **Choose File / gallery / PDF** works through the WebView chooser's SAF `content://` grant — never used
  `READ_MEDIA_IMAGES`.

There is **no** feature behind broad media access, so the one scenario where the *declaration route* would be
justified (a genuine capability we'd lose) **does not exist here.** The manifest comment's stated reason —
"older OEM WebViews that still hit the legacy gallery path" (`AndroidManifest.xml:48-50`) — does not hold up:
the WebView's `onShowFileChooser` receives a granted content URI regardless of OS version; the host app does
not read via `MediaStore`, so it never needed the permission on any API level. The permission has been dead
weight since day one.

---

## 4. THE FIX SURFACE — one line, one file, no code

Smallest correct change, assessed against the options asked:

- **(a) Remove/override the merged permission?** — Remove, yes; override, no. It is **ours**
  (`AndroidManifest.xml:51`), so **delete the line**. `tools:node="remove"` is unnecessary (nothing merges it
  in). Optionally also delete the legacy `READ_EXTERNAL_STORAGE`(≤32) at `:52-54` for cleanliness — **not
  required** by the rejection (it doesn't apply on 13+), but it's equally vestigial and leaving it invites a
  future reviewer question. Recommend removing both; at minimum remove `:51`.
- **(b) Plugin picker mode / newer plugin?** — **N/A.** No plugin adds the permission; `@capacitor/camera`
  stays exactly as-is (we need its `camera` permission API). Nothing to upgrade for this.
- **(c) Plugin swap?** — **No.** We're already on the system picker via the WebView. No new picker plugin,
  no `@capacitor/filesystem`, nothing.

**Files that change:** exactly one — `apps/frontend/android/app/src/main/AndroidManifest.xml` (delete `:51`,
optionally `:52-54`). Plus the versionCode bump in §6.
**JS/TS that changes:** **none.** No source references the permission; the pick path is pure WebView.

---

## 5. RISK TO OUR CONSTRAINTS

**Silent-shell / anti-steering guard — NOT touched.** The gate is `Capacitor.isNativePlatform()`
(`src/native/shell.ts:14`), a WebView-layer API entirely orthogonal to a manifest permission. Deleting
`READ_MEDIA_IMAGES` cannot affect platform detection or any steering branch. `nativeAntiSteering.test.tsx`
has **no** coupling to media permissions — its only camera reference is a comment noting "no camera-permission
mock needed" (`:477`). No test changes, no invariant risk.

**Deferred API-36 / Capacitor 8 work — NOT forced early, and independent.** This fix ships cleanly under the
**current Capacitor 7.6.6 / targetSdk 35** stack (`variables.gradle:3-4`). It is a manifest-only permission
deletion — none of the Cap 8 dependency chain (min 24, AGP 8.13, Gradle 8.14.3, Node 22) is implicated. It
touches the same *file* the Cap 8 PR will touch, but a different concern (a permission line vs the
`configChanges`/SDK edits in `docs/ANDROID_TARGET_API_36_RECON_2026-07-22.md` §5c), so no meaningful conflict.
**Do this now, under Cap 7, ahead of the Cap 8 upgrade — do not couple them.**

> **Cross-doc correction worth flagging.** The API-36 recon §5(d) rated the permission block "low risk /
> API 36 forces no change here." That was **correct for the target-API-level policy it was scoped to** — but
> the app was *simultaneously* non-compliant with the **Photo and Video Permissions** policy, a separate axis
> that recon wasn't looking at. Both statements are true; the earlier "low risk" was not wrong, just
> orthogonal. This is the lesson: manifest permissions carry policy risk independent of target-SDK risk.

---

## 6. REBUILD / RESUBMIT — what it takes, and Abo Jad's manual steps

- **versionCode bump 3 → 4.** Literal, manual: `apps/frontend/android/app/build.gradle:23` (`versionCode 3`).
  Not derived/automated.
- **Fresh signed AAB — manual, local, Abo Jad.** CI does **not** build the Android bundle (the frontend job
  ends at `npx cap sync android`; no Gradle assemble — API-36 recon §4). The signed AAB is produced only on
  the signing machine via the release `signingConfig`/`key.properties` (`D:\keys` keystore). Same upload key,
  no re-enrollment. **This whole step is a manual Abo Jad task with no CI coverage.**
- **Play Console — remove the permissions from ALL tracks, incl. testing.** Google explicitly requires the
  broad permission gone from every track. The **closed-testing track currently holds vc3 *with*
  `READ_MEDIA_IMAGES`** — vc4 must be promoted/uploaded there too, not just to production. *(Abo Jad, Play
  Console.)*
- **Photo Picker declaration — withdraw, do not file.** The rejection referenced a "Policy Declaration for
  Photo Picker." Since we are **removing** the permission (not claiming we need it), the correct action in
  **App content → Photo and video permissions** is to update the declaration to *no broad media access* /
  withdraw it — **not** to submit a justification. Filing the declaration would assert a need we don't have.
  *(Abo Jad, Play Console.)*
- **⚠ Open question I can't answer from the repo — the closed-testing clock.** Per project memory the
  closed-testing 14-day clock is running (12 testers opted in, ~9 days left as of 2026-06-25). Pushing vc4
  onto the closed-testing track mid-clock is unavoidable here (Google demands the permission gone from that
  track). **Abo Jad should confirm in Play Console that replacing the closed-testing bundle does not reset
  the 14-day eligibility window** before uploading. I believe a new build does not reset it while testers
  stay opted in, but this is a Play Console policy detail, not a repo fact — verify, don't assume.

---

## RECOMMENDATION (single, explicit)

**Remove the permission and resubmit. Do not file the declaration. Do not appeal.**

- **Why not the declaration form:** it exists for apps that genuinely need broad media access. We don't — §2
  proves every media entry is already a user-initiated system-picker pick. Filing it claims a need we can't
  substantiate and invites a slower, judgment-based review.
- **Why not an appeal:** we would be arguing the app needs `READ_MEDIA_IMAGES`. It demonstrably does not.
  We'd lose, and burn days.
- **Why "switch to picker" is effectively already done:** we never left the picker. The remediation collapses
  to deleting one vestigial line.

**Smallest change that gets us approved:** delete `AndroidManifest.xml:51` (`READ_MEDIA_IMAGES`) — and, for
cleanliness, `:52-54` (`READ_EXTERNAL_STORAGE`≤32). No JS/TS change. No plugin change.

**One PR, not several.** Scope: the manifest deletion + `versionCode 3 → 4`. It is independent of the
Capacitor 8 / API 36 work and must **not** be bundled with it.

**Ships under the current stack:** yes — Capacitor 7.6.6 / targetSdk 35, no toolchain movement. This is a
low-risk, single-file change that does not touch the anti-steering gate.

**Then Abo Jad, manually in Play Console + on the signing machine:** build the signed vc4 AAB → upload to
**production and the closed-testing track** → update/withdraw the Photo & Video Permissions declaration →
resubmit. Verify the closed-testing 14-day clock is not reset before uploading.
