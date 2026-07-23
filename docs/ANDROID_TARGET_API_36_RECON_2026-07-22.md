# Android target API 36 — compliance recon

**Date:** 2026-07-22 · **Status:** RECON ONLY. No code changed, no deps installed, no Gradle sync, no build.
**Scope:** Google Play target-API-level requirement vs the Scan & Action Capacitor Android project.

---

## 0. The requirement, restated precisely (one correction)

From **2026-08-31**: new apps **and app updates** must target **API 36** (Android 16). Existing apps that
are *not* updated must target API 35 to remain available. An extension to **2026-11-01** can be requested
in Play Console.

**Correction to the framing.** The consequence of missing Aug 31 is *not* that the app is removed. We are
already on API 35 (§1), so **the app stays live and installable indefinitely**. What we lose on Aug 31 is
the ability to **ship any update at all**. The deadline is a *shipping freeze*, not a takedown.

That reframe matters for sequencing (§6), because it converts "emergency" into "capacity planning": the
question is not *will we be pulled*, it is *how many more updates do we want to ship, and before or after
the upgrade*.

---

## 1. CURRENT STATE

### SDK levels — single source of truth

All three levels are set in **one** file and consumed by reference everywhere else.

| Value | Current | File:line |
|---|---|---|
| `minSdkVersion` | **23** | `apps/frontend/android/variables.gradle:2` |
| `compileSdkVersion` | **35** | `apps/frontend/android/variables.gradle:3` |
| `targetSdkVersion` | **35** | `apps/frontend/android/variables.gradle:4` |

Consumed, not redeclared, by the app module:

- `apps/frontend/android/app/build.gradle:18` — `compileSdk rootProject.ext.compileSdkVersion`
- `apps/frontend/android/app/build.gradle:21` — `minSdkVersion rootProject.ext.minSdkVersion`
- `apps/frontend/android/app/build.gradle:22` — `targetSdkVersion rootProject.ext.targetSdkVersion`

### Toolchain

| Component | Current | File:line |
|---|---|---|
| Android Gradle Plugin | **8.7.2** | `apps/frontend/android/build.gradle:10` |
| AGP (Capacitor's own buildscript) | **8.7.2** | `node_modules/@capacitor/android/capacitor/build.gradle:25` |
| Gradle wrapper | **8.11.1** | `apps/frontend/android/gradle/wrapper/gradle-wrapper.properties` (`distributionUrl`) |
| Java (Capacitor lib compileOptions) | **21** | `node_modules/@capacitor/android/capacitor/build.gradle:67-68` |
| Java on this machine (`java -version`) | **17.0.18** (Temurin) | — see §4 caveat |
| Node (local) | **v20.19.1** | — |
| Node (CI) | **20** | `.github/workflows/ci.yml` (`node-version: 20`, both jobs) |
| `versionCode` / `versionName` | **3** / **"1.0"** | `apps/frontend/android/app/build.gradle:23-24` |

### Capacitor version

- Declared: `@capacitor/android`, `@capacitor/cli`, `@capacitor/core` all `^7.6.6` — `apps/frontend/package.json`
- Installed: **7.6.6** for all three (verified from `node_modules/*/package.json`)
- Plugins: `@capacitor/app ^7.1.2`, `@capacitor/camera ^7.0.5`, `@capacitor/splash-screen ^7.0.5`, `@capacitor/status-bar ^7.0.6`

### What Capacitor 7 supports — and a nuance worth knowing

`node_modules/@capacitor/android/capacitor/build.gradle` does **not** hardcode 35. It *inherits*:

```gradle
45:  compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 35
48:  targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 35
```

So editing `variables.gradle` to 36 **would** propagate into the Capacitor library module. There is no
mechanical guard stopping it. **This is a trap, not an opportunity** — see §2.

---

## 2. GAP — and the honest dependency chain

**Numerically:** one API level (35 → 36).
**Actually:** a Capacitor major upgrade plus a four-part toolchain upgrade.

Capacitor's official position is explicit:

> "Capacitor Android does not support custom target SDK versions." … changing it yourself carries
> "a very strong likelihood that your application will experience issues not otherwise present."

The published matrix binds them one-to-one:

| Capacitor | Target SDK |
|---|---|
| **7.x** | **35** ← we are here |
| **8.x** | **36** ← required |

**Answer to "is API 36 reachable on Capacitor 7?"** — Gradle-mechanically yes (the inherit above means it
would configure and probably build). Officially and practically **no**. Editing `variables.gradle` to 36 on
Capacitor 7 produces an unsupported configuration that Ionic will not support and that silently diverges
from what the Capacitor bridge was tested against. **API 36 requires Capacitor 8.**

### What Capacitor 8 actually demands vs. what we have

| Requirement | Capacitor 8 needs | We have | Delta |
|---|---|---|---|
| `minSdkVersion` | **24** | 23 | **⚠ user-facing — drops Android 6.0 devices** |
| `compileSdkVersion` | 36 | 35 | bump |
| `targetSdkVersion` | 36 | 35 | bump |
| Android Gradle Plugin | **8.13.0** | 8.7.2 | 6 minor versions |
| Gradle wrapper | **8.14.3** | 8.11.1 | bump |
| Android Studio | **Otter 2025.2.1+** | (local IDE — unverified) | check |
| Node.js | **22+** | **20** local *and* **20 in CI** | **⚠ breaks CI** |
| Kotlin | 2.2.20 (if used) | no Kotlin in app module | n/a |

**Two items here are bigger than a version bump:**

1. **`minSdk 23 → 24` drops real users.** API 23 is Android 6.0 Marshmallow; API 24 is Android 7.0. Any
   installed base on 6.0 loses updates permanently. **Check the Play Console device/API distribution before
   committing** — this is a product decision, not a build detail, and nothing in the repo can answer it.
2. **Node 22 breaks CI.** `.github/workflows/ci.yml` pins `node-version: 20` in both jobs. The frontend job
   ends in `npx cap sync android` (`ci.yml:48`), which runs the Capacitor CLI. Capacitor 8 requires Node 22+.
   This one *will* be caught by CI — which is good, and unusual for this change set (see §4).

**Verdict on size: this is bigger than you framed it.** It is not a one-line `variables.gradle` edit. It is
Capacitor 7→8 + AGP + Gradle + Node + a minSdk decision, landing on the native shell.

---

## 3. RISK TO THE ANTI-STEERING INVARIANT — the part that matters most

### Does the SDK bump itself touch the gate? No.

The single gate is `Capacitor.isNativePlatform()` — `apps/frontend/src/native/shell.ts:14`:

```ts
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();
```

This is a **JavaScript/WebView-layer** API resolved by Capacitor core, not an Android SDK API. Raising
`targetSdkVersion` does not change it. The Capacitor 8 migration notes list **no** breaking change to
`isNativePlatform()`.

### But here is the problem, and it is worse than the SDK bump

**Every test that touches the gate mocks it. Not one exercises the real thing.**

- `apps/frontend/tests/nativeAntiSteering.test.tsx:33`
  `vi.mock('../src/native/shell', () => ({ isNativePlatform: () => true }))`
- `apps/frontend/tests/paywallCheckoutGuard.test.tsx:29`
  `vi.mock('../src/native/shell', () => ({ isNativePlatform: () => false }))`
- `apps/frontend/tests/uploadModalBackDismiss.test.tsx:46`
  `Capacitor: { isNativePlatform: () => h.native.value }` — also a stub

The anti-steering suite is excellent at what it does: it locks the **branches taken given the gate**
(~20 assertions across PaywallModal, SettingsScreen, the `/` LandingRoute redirect, UploadModal ×2,
CaptureSheet, DeleteAccountModal ×7). Its own header calls the `/` redirect assertions "the strictest in
the file" because the marketing landing renders a literal `$9/mo`.

**What it cannot detect is a regression in the gate itself.** If Capacitor 8 changed platform detection —
different `androidScheme` resolution, a bridge-init timing change, a WebView origin change — then
`isNativePlatform()` returns `false` inside the real Android shell, **every one of those assertions still
passes green**, and the app ships a pricing page to Play users. That is the Play-removal scenario, and the
suite is structurally blind to it.

This blindness is *latent* today (Capacitor 7 is stable and shipped). **A Capacitor major upgrade is
precisely the event that could activate it.** The one change that could break the gate is the one change
the test suite cannot see.

**This is the single most important finding in this recon.** It is not caused by the SDK bump — it predates
it — but the SDK bump is what makes it dangerous.

### Second, independent native signal — also needs re-verification

`apps/frontend/capacitor.config.ts` sets `android.appendUserAgent: 'ScanActionAndroid'`, which the **backend**
sniffs to detect app context. That is a second detection path with its own regression surface. Capacitor 8
should preserve it, but it is unverified.

### Full re-verification list (on-device / emulator — not unit tests)

| Surface | File:line | Why |
|---|---|---|
| The gate itself | `src/native/shell.ts:14` | **Untested against real Capacitor.** Must be verified in the built APK/AAB. |
| `/` redirect (load-bearing) | `src/App.tsx:36` (`LandingRoute`) | Only defense against the landing page's `$9/mo`; no second layer behind it |
| Paywall native branch | `src/components/PaywallModal.tsx:49` | Neutral "coming soon"; must never reach `getPaddle()` |
| Settings billing card | `src/screens/SettingsScreen.tsx:158` | Entitlement-only view on native |
| Upload limit guards | `src/components/UploadModal.tsx:75`, `:172` | Neutral status, paywall must not open |
| Capture limit guard | `src/components/CaptureSheet.tsx:99` | Same |
| Processing poll gate | `src/contexts/ProcessingContext.tsx:168` | Native-only timer |
| Camera permission gate | `src/native/camera.ts:14` | Native-only request |
| Backend UA detection | `capacitor.config.ts` (`appendUserAgent`) | Second detection path |

---

## 4. BUILD / SIGNING IMPACT

### Signing — no impact from the SDK bump

`apps/frontend/android/app/build.gradle:9-14, 32-44, 52-54`: the release `signingConfig` is created only
when `android/key.properties` exists (present locally, gitignored; it holds the `D:\keys` keystore path and
passwords). Nothing in a target-SDK or Capacitor bump touches the signing config, the keystore, or the
upload key. **Play will accept the update on the same upload key.** No re-enrollment, no key rotation.

### versionCode — manual, and easy to forget

`app/build.gradle:23` is a literal `versionCode 3`. Not derived, not automated. Any new upload needs it
incremented to `4`. Worth stating because the Capacitor upgrade PR will touch nearby lines in the same file.

### CI does not build the Android app — the real gap

`.github/workflows/ci.yml:44-48` is explicit:

```yaml
# Lightweight Capacitor check: copies the web build into the Android
# project and regenerates native plugin config. Catches a broken
# capacitor.config / missing webDir / plugin mismatch. Deliberately NO
# Gradle assemble here (no JDK/Android SDK) to keep CI fast.
- run: npx cap sync android
```

**Consequence:** an AGP 8.13 / Gradle 8.14.3 / compileSdk 36 upgrade is **invisible to CI**. Both required
checks ("Backend — typecheck & build", "Frontend — typecheck & build") can go green on a change that breaks
the release bundle. The breakage would surface only on the signing machine, by hand.

Partial mitigation already in place: the Node 22 requirement *will* trip `cap sync` in CI. So CI catches the
JS-side half and none of the Gradle half.

**Local JDK caveat:** `java -version` on this machine reports **17.0.18**, but Capacitor 7.6.6 already
compiles with `sourceCompatibility/targetCompatibility = VERSION_21`
(`node_modules/@capacitor/android/capacitor/build.gradle:67-68`). This almost certainly means Gradle is
running on Android Studio's bundled JBR 21 rather than the PATH JDK. **Unverified — do not assume.** Confirm
the Gradle JVM before the upgrade, because Capacitor 8 + AGP 8.13 will be stricter.

### The 31 brand assets — no regeneration needed

Your count is exact. Verified inventory under `apps/frontend/android/app/src/main/res/`:

- **20 launcher PNGs** — 5 densities (`mipmap-{m,h,xh,xxh,xxx}dpi`) × 4 files (`ic_launcher`,
  `ic_launcher_round`, `ic_launcher_background`, `ic_launcher_foreground`)
- **11 splash PNGs** — `drawable/splash.png` + `drawable-{land,port}-{m,h,xh,xxh,xxx}dpi/splash.png`
- **= 31 raster brand assets**, plus 2 adaptive-icon XMLs (`mipmap-anydpi-v26/ic_launcher.xml`,
  `ic_launcher_round.xml`) — 33 files, 38 total in `res/`.

**These are density-keyed, not API-level-keyed. Nothing about targeting API 36 invalidates them.** No
regeneration required.

Two adjacent notes (neither triggered by API 36):
- `mipmap-anydpi-v26/ic_launcher.xml` declares `<background>` + `<foreground>` with **no `<monochrome>`**, so
  Android 13+ themed icons fall back. Pre-existing, unchanged by this work.
- The splash uses the legacy `androidSplashResourceName: 'splash'` path (`capacitor.config.ts`) with
  `Theme.SplashScreen` (`res/values/styles.xml`) and `core-splashscreen 1.0.1`. **Re-test the splash under
  Capacitor 8's new System Bars plugin** — cosmetic risk only, but it is the first thing users see.

---

## 5. BEHAVIOR CHANGES most likely to affect THIS app

Filtered to what the app demonstrably does. Ordered by real risk.

### (a) Predictive back — HIGHEST behavioral risk here

At targetSdk 36 predictive back extends to three-button navigation and legacy `onBackPressed()` no longer
fires. This app has a **custom back-precedence chain**:

`src/native/NativeBackButton.tsx:29` registers `App.addListener('backButton', …)` with four-level
precedence (`:30` overlay close → `:33` home minimize → `:37` tab→dashboard → `:41` history back), backed by
`src/native/overlayStack.ts` and `src/native/useBackDismiss.ts`.

Every modal depends on it — including `PaywallModal.tsx:39` (`useBackDismiss(isOpen, onClose)`). The one
test covering it (`tests/uploadModalBackDismiss.test.tsx:46`) **stubs Capacitor**, so it cannot validate
real predictive-back behavior. **Must be re-verified on device, in both gesture and 3-button nav modes.**

### (b) Edge-to-edge opt-out removed — low risk, already on the right path

At targetSdk 36 the system no longer honours the edge-to-edge opt-out flag. This app has lived with enforced
edge-to-edge since targetSdk 35 — documented at `src/native/shell.ts:9-13` — and already pads with CSS
`env(safe-area-inset-*)` in 9 places: `Layout.tsx:81`, `BottomTabBar.tsx:58`, `CaptureSheet.tsx:141,196`,
`DeleteAccountModal.tsx:95`, `PaywallModal.tsx:77,172`, `ProcessingTray.tsx:59`.

Confirmed absent: `adjustMarginsForEdgeToEdge` is **not used anywhere** in this repo (grep, excluding
`node_modules`). Capacitor 8 removes that flag in favour of a new System Bars core plugin and moves to CSS
env vars — **which is already our architecture.** This one is close to a no-op; re-test visually only.

### (c) Large-screen resizability + a concrete missing manifest attribute

At targetSdk 36, on displays with smallest-width ≥ 600dp, orientation/aspect-ratio restrictions no longer
apply and the app fills the window. `AndroidManifest.xml` declares **no** `android:screenOrientation` and no
`resizeableActivity`, so there is no lock to lose.

**But:** Capacitor 8 requires adding **`density`** to `configChanges` to stop the WebView reloading on
resize. Current value (`AndroidManifest.xml:13`) is:

```
orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation
```

— **`density` is missing.** A WebView reload mid-scan would drop in-flight upload/processing state
(`ProcessingContext`). Concrete and actionable.

### (d) Permissions / storage — low risk

`AndroidManifest.xml` declares `INTERNET`, `CAMERA`, `READ_MEDIA_IMAGES`, and `READ_EXTERNAL_STORAGE` with
`android:maxSdkVersion="32"`, plus optional camera `uses-feature`. The comments note the Photo Picker / SAF
path is already permissionless. API 36 forces no change here. Camera runtime request lives at
`src/native/camera.ts:14`; re-test the deny path.

### (e) Foreground services — not applicable

**No `<service>` and no `FOREGROUND_SERVICE*` permission is declared.** The Android 14/15 FGS-type
restrictions — usually the biggest migration cost — **do not apply to this app at all.** Processing polling
is in-WebView (`ProcessingContext.tsx:168`), not a service.

### (f) 16 KB page size — verify, low risk

Play requires 16 KB page-size support for targetSdk 35+ on 64-bit devices. This app ships **no first-party
native `.so`**; it is a WebView shell and Capacitor/Cordova are JVM. Exposure is only via transitive AARs,
which Capacitor 8 handles. Verify the built AAB once; no action expected.

---

## 6. RECOMMENDATION — sequencing

### Several PRs, not one. And the Capacitor upgrade is not *before* the SDK bump — it *is* the SDK bump.

Per Capacitor's matrix you do not raise `targetSdkVersion` and then upgrade Capacitor. Capacitor 8 *sets*
36. They are one atomic change.

**PR 1 — toolchain prep (small, safe, independent, do first).**
Bump CI to `node-version: 22`. Confirm the Gradle JVM is 21. No Capacitor change. Merges and de-risks the
environment while everything else is still on Capacitor 7.

**PR 2 — Capacitor 7→8 + SDK 36 (atomic, cannot be split).**
`variables.gradle` min 24 / compile 36 / target 36 · AGP 8.13.0 · Gradle wrapper 8.14.3 · add `density` to
`configChanges` · plugin majors · `versionCode` → 4. This PR **cannot be validated by CI** (§4) — it needs a
local Gradle build and a device install as part of review.

**PR 3 — close the test blindspot + on-device re-verification.**
A test that exercises the **real** `isNativePlatform()` rather than the mock, plus the §3 walkthrough on a
device. I would make this a **precondition of the Play upload, not a follow-up.**

### Timing: request the extension now, ship the audit first, upgrade in the calm

**Do this now, today:** request the **Nov 1 extension** in Play Console. It is free optionality with no
downside and no commitment. Not requesting it is the only genuinely irreversible mistake available here.

**Then: finish the audit blockers and ship them under API 35 before Aug 31.** Rationale:

1. We remain live either way (§0) — the deadline freezes shipping, it does not pull the app.
2. Anything we want in users' hands must ship before Aug 31 *or* wait behind the whole Capacitor 8 upgrade.
   Shipping the audit fixes first is strictly cheaper.
3. The Capacitor 8 upgrade is the **highest-regression-risk change to the native shell since launch**, and
   it lands on the exact code path that carries Play-removal risk (§3) — with a test suite that cannot see
   the failure and a CI that cannot build the artifact.

**Do not run the audit and the Capacitor 8 upgrade in the same window.** With the extension, the upgrade
gets Sept–Oct as a dedicated chunk with real device testing. Without it, it gets squeezed against the audit
in the next 40 days. That compression is the actual risk to this project — not the API level.

**One open question I cannot answer from the repo:** the Play Console install base on Android 6.0 (API 23),
which `minSdk 24` would strand. Check before PR 2.

---

## Sources

- [Updating to Capacitor 8.0 — Capacitor Documentation](https://capacitorjs.com/docs/updating/8-0)
- [Setting Android Target SDK — Capacitor Documentation](https://capacitorjs.com/docs/android/setting-target-sdk)
- [Announcing Capacitor 8 — Ionic Blog](https://ionic.io/blog/announcing-capacitor-8)
- [Behavior changes: Apps targeting Android 16 or higher — Android Developers](https://developer.android.com/about/versions/16/behavior-changes-16)
- [Behavior changes: all apps (Android 16) — Android Developers](https://developer.android.com/about/versions/16/behavior-changes-all)
