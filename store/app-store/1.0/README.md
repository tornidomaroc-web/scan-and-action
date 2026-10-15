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
   Both show their amount: Station Nour 400.00 MAD and Régie Al Amal 612.80
   MAD. The queue card shows no review reason (the card renders the status
   only, `ReviewQueueScreen.tsx`); the reason shows on the receipt's Detail.
   The fixtures still carry each reason the rule engine would give: "Total
   not printed" (Rule E) and "Amount exceeds threshold" (Rule A, over 500).
5. `05-search`: a month's receipts, with each currency's total.

## How they were made

From the app at `main` `0fedd179` (the code of TestFlight build 34) on the iOS
26.5 simulator, iPhone 17 Pro and iPhone 17 Pro Max, light, default text size,
the status bar at 9:41 with a full battery. The network was replaced by
fixtures (`source/sa-proof.js`): every merchant, amount, date and file name is
invented, no real user's data and no review account's data, and no real brand
name (App Store Review Guideline 5.2). The receipt photo is drawn by
`source/receipt.mjs` and its lines add up to the total Detail shows.

Run 38664852917 on the throwaway branch `proof/store-shots` shot the first
set. Frames 1, 2, 4 and 5 were reshot on 2026-10-15 by run 38763571358 on
`proof/store-shots-2` (app code at `main` `4dd2bdcd`, whose `apps/` tree is
`0fedd179`'s), after the queue's receipt with no amount was replaced: frame 4
changed, and frames 1, 2 and 5 changed with it because Home and Search read
the same month (Home now says 2 receipts need review, Search marks Régie Al
Amal "Needs review"). Frame 3 is the first run's file: the second run gave it
byte-identical on the large set and a shadow-only difference on the medium.
The files here are the frames converted to RGB (pixels unchanged, the alpha
channel, opaque everywhere, removed), with `source/store-shots.yml` as the
workflow.

`02-reading` in `source/screens.mjs` is a candidate that was shot and not
chosen: Detail while a scan is read. It is a loading state (a skeleton for the
amount, a grey "Processing" chip, the lower third empty) and it shows neither
way of adding a document, so frame 2 stays the Add a document sheet. The
system scanner itself cannot be shot: the simulator has no camera. Every frame passed
the in-page layout audit (no text cut, nothing overlapping, no sideways
scroll) and the contrast audit (no text pair under 4.5:1).

To reshoot after a UI change: put `source/` back at `.github/dt-proof/` and
`source/store-shots.yml` at `.github/workflows/` on a throwaway branch from
main, push, and take the frames from the run's artifact.
