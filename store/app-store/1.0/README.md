# App Store screenshots, version 1.0

The iPhone set for the App Store product page, English (U.S.), the listing's
only localization. Not uploaded: the review and the upload are the owner's.

| Folder | Size (portrait) | App Store Connect slot |
|---|---|---|
| `iphone-dynamic-island-medium-1206x2622/` | 1206 x 2622 | iPhone with Dynamic Island (medium display), the required one |
| `iphone-dynamic-island-large-1320x2868/` | 1320 x 2868 | iPhone with Dynamic Island (large display), optional |

What applies, read on 2026-10-15:

- Apple's screenshot specifications
  (https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
  list "iPhone: At least one screenshot for iPhone with Dynamic Island (medium
  display)" under "Required device sizes", and App Store Connect's version 1.0
  page shows exactly that slot. PNG or JPEG, no alpha, 1 to 10 per size.
- No iPad set: the app builds for iPhone only (`TARGETED_DEVICE_FAMILY = 1` in
  `apps/frontend/ios/App/App.xcodeproj/project.pbxproj`).
- iPhone Duo screenshots become required from April 2027 for apps built with
  the iOS 27.1 SDK or later. Build 34 was built with Xcode 26.6, so not now.

## The frames, in order

1. `01-home`: the month's total for each currency, never added together.
2. `02-capture`: adding a document (the system scanner or a file).
3. `03-detail`: one receipt, its photo, and what was read from it.
4. `04-queue`: the receipts that need a person, with Approve and Reject.
5. `05-search`: a month's receipts, with each currency's total.

## How they were made

From the app at `main` `0fedd179` (the code of TestFlight build 34) on the iOS
26.5 simulator, iPhone 17 Pro and iPhone 17 Pro Max, light, default text size,
the status bar at 9:41 with a full battery. The network was replaced by
fixtures (`source/sa-proof.js`): every merchant, amount, date and file name is
invented, no real user's data and no review account's data, and no real brand
name (App Store Review Guideline 5.2). The receipt photo is drawn by
`source/receipt.mjs` and its lines add up to the total Detail shows.

Run 38664852917 on the throwaway branch `proof/store-shots` shot them, with
`source/store-shots.yml` as its workflow; the files here are those frames
converted to RGB (pixels unchanged, alpha channel removed). Every frame passed
the in-page layout audit (no text cut, nothing overlapping, no sideways
scroll) and the contrast audit (no text pair under 4.5:1).

To reshoot after a UI change: put `source/` back at `.github/dt-proof/` and
`source/store-shots.yml` at `.github/workflows/` on a throwaway branch from
main, push, and take the frames from the run's artifact.
