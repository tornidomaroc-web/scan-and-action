# Brand mark divergence — deferred decision

**Raised:** 2026-07-17, during the Play rejection fix (Misleading Claims / store listing mismatch).
**Status:** **DEFERRED — deliberately not fixed in that PR.** Needs a brand decision, not an engineering one.
**Blocking anything?** No. The rejection fix stands on its own.

---

## There are three different marks, not two

Found while mapping the launcher-icon rejection. All three are live right now.

| # | Mark | Where it lives | Evidence |
|---|---|---|---|
| 1 | **Teal document + checkmark** | Play Store hi-res listing icon; **now also the Android launcher + splash** | `apps/frontend/assets/scan-action-mark.svg` (vector master) |
| 2 | ~~Capacitor logo (blue X)~~ | ~~Android launcher + splash~~ | **FIXED** — was the un-replaced `cap add android` scaffold from `1b328ee` |
| 3 | **Blue/white arrow on `#0f172a` navy** | Web app: PWA icons, favicon, web manifest | `apps/frontend/public/icons/*`, `apps/frontend/index.html:5`, `apps/frontend/public/manifest.webmanifest` |

Mark #2 was the rejection and is gone. **Marks #1 and #3 still disagree with each other**, and they did so
*before* the Capacitor bug existed — the launcher defect was masking a pre-existing brand split.

### Where #3 actually is

- `apps/frontend/public/icons/icon-192.png` · `icon-512.png` · `icon-maskable-512.png` · `apple-touch-icon.png`
  — all a blue/white arrow on `#0f172a`.
- `apps/frontend/index.html:5` — an inline `data:` URI favicon: `rect fill='%230f172a'` with `#2563eb`
  arrow paths. Same arrow, hand-authored in the markup.
- `apps/frontend/public/manifest.webmanifest` — `"name": "Scan & Action"`, `background_color` /
  `theme_color` `#0f172a`, pointing at the three icons above.

Note `apps/frontend/android/app/src/main/assets/public/icons/*` is a **`cap sync` copy** of
`public/icons/` (gitignored build output, regenerated on every `npm run build:android`). It carries the
arrow into the APK's web assets. That is not a store-listing surface — the launcher icon and splash are —
so it does not affect the rejection. But it means the arrow *is* inside the shipped bundle.

---

## Why this was left alone

1. **Not the rejection.** Google compared the *launcher icon* to the *store listing*. Both are now mark #1.
   The PWA icons are not a store-listing surface and were not cited.
2. **Touching them widens the blast radius.** Changing the favicon/PWA icons changes what every existing
   web user sees in their browser tab and on their home screen, for a release whose only job is to clear a
   rejection.
3. **The decision is genuinely a brand call.** Neither option is obviously right, and it is not mine to make.

---

## The decision to make

**(a) Unify on the teal document+check (mark #1).** Regenerate `public/icons/*` and the inline favicon from
`apps/frontend/assets/scan-action-mark.svg`. One mark everywhere: store, launcher, splash, web, PWA.
Store listing untouched, so no re-review of the listing.
*Cost:* the web app's visual identity changes. `manifest.webmanifest`'s `background_color`/`theme_color`
(`#0f172a`) would want revisiting against the teal gradient.

**(b) Unify on the arrow (mark #3).** Replace the Play Store listing icon and regenerate the Android assets
from an arrow master.
*Cost:* **changes the store listing immediately after a Misleading Claims rejection** — slower, and it
re-enters review with a changed listing. Also throws away the vector master just built.

**(c) Accept the split.** Web = arrow, app + store = document. Defensible if they are positioned as
different products; not defensible if they are one brand.

**Recommendation: (a), as a standalone PR after the rejection clears.** The master already exists and is
verified, the store listing stays untouched, and it collapses three marks to one. But it should ship on its
own so that if anything about it is wrong, it cannot jeopardise the resubmission.

---

## Do not do this by accident

`apps/frontend/public/icons/*` and `apps/frontend/index.html` were **explicitly out of scope** for the
rejection fix and were not modified. If a future change regenerates icons from the master, do it knowingly
and update this file. See also `docs/ICON_MASTER_REBUILD.md` (the master and its measurements) and
`docs/ANDROID_LAUNCHER_ICON_MISMATCH_MAP.md` (the original rejection map).
