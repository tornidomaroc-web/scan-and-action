# Refund-revoke + one-off-transaction grant — recon & plan

**Date:** 2026-07-22 · **Base:** `main` @ `00bc06c` · **Mode:** read-only recon + written plan. No code, config, DB, or prod contact.
**Origin:** findings (A) and (B) in `docs/PADDLE_PRICE_ALLOWLIST_RECON_2026-07-22.md`.

## Verdict up front — three corrections

Both holes re-verify against current source, unchanged. But the recon changed my picture of each:

1. **Refund-revoke is blocked on something neither of us accounted for.** The refund event almost certainly does **not** carry `custom_data.userId` — but our test fixture *says it does* (`webhookController.test.ts:94`). Build revoke on the existing identity path and it passes CI and silently does nothing in production. There is a viable mapping route (`subscription_id` → `Subscription.externalId`), but that column is **write-only today** — never read, no index, and `resolveBillingOrg` has no path for it. **This changes the fix.**

2. **The policy you want to choose may not be implementable yet.** The existing TODO (`:236-238`) says gate on `status === 'approved'` — but we only handle `adjustment.created` (`:268`), and the pending→approved transition arrives as `adjustment.updated`, which we ignore entirely. Right now we can see a refund *requested* and never learn whether it was *approved*.

3. **The one-off hole (A) is smaller than I implied — it is not independently reachable.** I said "the code defect is unconditional and confirmed." True, but reachability isn't: our UI only ever opens checkout with the two recurring price IDs, so exploiting it needs a one-off price in the catalog **and** the priceId substitution from the allowlist recon. It's an amplifier of that hole, not a second front door. Its real significance is different, and I think stronger — see §3.

**And one thing that may be worse than either.** The entire v1 refund safety net is "a human reads a Discord alert." Whether `adjustment.created` is even subscribed as a notification type in the Paddle dashboard is unverifiable from this repo. If it isn't, no alert has ever fired, no human has ever reviewed a refund, and the manual fallback we believe we have does not exist. **That is a 60-second dashboard check and it should happen before anything else here.**

---

## 1. Refund events — what fires, what we do, what we can map

### Current handling — confirmed

`webhookController.ts:268-271`, inside `processEvent`, **before** any status classification:

```
if (eventName === 'adjustment.created') { logRefundForReview(event, eventId); return; }
```

`logRefundForReview` (`:239-256`) writes one `[Webhook][ALERT]` console line and fires one Discord alert carrying `adjustment_id, action, status, subscription_id, transaction_id, customer_id, event_id`. Then returns. **No entitlement change, by design** — reasoning at `:262-267`, TODO at `:236-238`. Test-locked at `webhookController.test.ts:272-286` (asserts `applyEntitlementChange` is **not** called).

So: we do receive and parse the event — *if* it's subscribed — and we deliberately do nothing with it.

**What we do NOT handle:** `adjustment.updated`. The match at `:268` is exact-string on `.created`. Any other `adjustment.*` event falls through to `classifyPaddleStatus` (`:194-205`), which returns `null` for it, so `processEvent` returns at `:274` — silently, with no log at all. A refund moving from `pending_approval` to `approved` is therefore **completely invisible to us**.

### Can we map a refund back to an org?

**Not by the current identity path.** `extractUserId` (`:162-170`) reads `data.custom_data.userId`. In Paddle Billing, `custom_data` is a property of the **transaction** and **subscription** entities. The **adjustment** entity's documented fields are `id, action, transaction_id, subscription_id, customer_id, reason, currency_code, status, items[], totals, payout_totals, created_at, updated_at` — **`custom_data` is not among them.**

Our fixture at `webhookController.test.ts:83-98` nonetheless includes `custom_data: { userId: USER_ID }` on the adjustment. Nothing ever forced that fixture to be accurate, because the handler returns at `:270` before touching identity. **It encodes an assumption that has never been exercised.** A refund-revoke built on `resolveBillingOrg(userId, …)` would pass every test in that file and, on real traffic, resolve nothing — landing in the `!resolved` branch (`:295-333`) and firing "Downgrade NOT applied" forever.

**The viable route** is `data.subscription_id` (present on the adjustment entity, and already in our own fixture at `:90`) → `Subscription.externalId` → `organizationId`. We already persist exactly that value:

- `webhookController.ts:335` — `externalId = data.subscription_id || data.id`
- `applyEntitlementChange.ts:84, 94` — written on create and update

**But it is write-only.** `grep -rn "externalId" apps/backend/src` returns only the write sites above plus comments — **no query anywhere reads it back.** And:

- `schema.prisma:66-80` — `externalId String?`, **no `@unique`, no `@@index`**. Only `@@unique([organizationId, source])` and `@@index([organizationId])`.
- `resolveBillingOrg.ts:52-55` — signature is `(userId, emailFallback)`. No externalId path exists.

So refund-revoke needs **a new resolver function** and, for correctness at scale, **an index migration**. That is materially more than "reuse the downgrade path," which is what I implied last turn.

**Second-order caveat:** `externalId` holds `subscription_id || id`, so for a *one-off* transaction it holds a `txn_…` id (noted as finding D in the allowlist recon). A resolver matching adjustments by `subscription_id` will therefore never match a one-off grant — the two holes do not close each other.

**Must verify in the dashboard (blocking, cannot be answered from this repo):**
- Is `adjustment.created` subscribed as a notification type? Is `adjustment.updated`?
- Capture one real delivered adjustment payload. Confirm `subscription_id` is populated, and confirm whether `custom_data` is present or absent.

---

## 2. The revoke path — reusable, with one addition

**How PRO clears today.** `classifyPaddleStatus:198-203` → `INACTIVE` on `subscription.canceled`, or on `subscription.updated` with status `paused`/`canceled` (`:209-221`). Then `applyEntitlementChange` (`:338-344`) upserts the source row to `INACTIVE` and `derivePlan.ts:38-44` recomputes `plan = max(planOverride ?? FREE, PRO if any ACTIVE else FREE)`. Test-locked at `webhookController.test.ts:237-267`.

**Nothing structural prevents reuse.** `applyEntitlementChange` takes an already-mapped `status` and is deliberately source-agnostic (`:26-33`). A refund handler that resolves an org and calls it with `status: 'INACTIVE', source: 'PADDLE'` is exactly the shape the service expects. The `planOverride` floor is untouched by it (`:32-33`, `:125`), so ENTERPRISE orgs and the review account cannot be clobbered — that safety property carries over for free.

**Where the logic belongs.** In `processEvent`, replacing/extending the early return at `:268-271` — consistent with the allowlist recon's conclusion that `processEvent` owns event-shape parsing and `applyEntitlementChange` forbids it. The new org resolver belongs beside `resolveBillingOrg` in `services/entitlement/`, taking an already-extracted `externalId` string (not an event), preserving the same boundary.

**One structural wrinkle to accept knowingly:** `@@unique([organizationId, source])` (`schema.prisma:78`) means one PADDLE row per org. An org holding two Paddle subscriptions collapses to a single status, so refunding one would revoke access granted by the other. Rare, pre-existing, not introduced by this work — but a refund-revoke makes it reachable for the first time.

---

## 3. The one-off-transaction hole — real, but latent, and the framing should change

**Re-verified.** `classifyPaddleStatus:195` — `transaction.completed` → `ACTIVE`, unconditional, with no check that a subscription backs it. Downgrades come only from `subscription.canceled` / `subscription.updated` (`:198-203`). One row per org (`schema.prisma:78`). So a transaction with no subscription behind it sets `PADDLE = ACTIVE` and **no event that our handler maps to INACTIVE can ever fire for it.** Unclearable via webhook: confirmed.

**Is it a real purchase path today? No.** `PaywallModal.tsx:20-23` wires exactly two price IDs, both recurring, and `:120-126` is the only `Checkout.open` call in the codebase. Every legitimate PRO purchase creates a subscription, which fires both `transaction.completed` and `subscription.created` (both → ACTIVE, same row, no conflict) and remains clearable by `subscription.canceled`. **The normal path is sound.**

Reaching the hole requires a one-off price in the catalog **plus** priceId substitution. So: **latent, and gated behind the allowlist hole.** Correcting my previous "unconditional and confirmed" — the *code* is unconditional; the *reachability* is not.

**Why it still deserves fixing, and the argument is better than the exploit one:** it becomes live the day someone adds any one-time product — a lifetime deal, a scan credit-pack, a top-up — with **zero code change and no warning**. That is an entirely plausible roadmap item for this product. A latent hole that arms itself on a future product decision is worth closing while it's cheap.

**Smallest correct fix:** require a subscription context before granting on a bare transaction — i.e. `transaction.completed` grants ACTIVE only when `data.subscription_id` is present; otherwise log + alert and skip. Rationale: it is `subscription_id`'s presence that guarantees a lifecycle exists to later clear the grant. This is strictly better than "ensure it has a clearable lifecycle," which would mean synthesizing one and adds state we don't need. It is a ~3-line change at `:195` and it does not touch the legitimate path (real subscription transactions always carry `subscription_id`).

**Note the shape:** this and the price-ID allowlist are the *same* fix — "validate the grant before granting," at the same point in `processEvent`, gating ACTIVE only. They should probably ship together (see §6).

---

## 4. Policy — for Abo Jad to decide

**Your call.** Options, with what each actually costs:

| Option | Behaviour | For | Against |
|---|---|---|---|
| **1 — Immediate on approval** | Revoke as soon as a full refund is approved / a chargeback lands | Correct for abuse. Closes the buy-refund-keep loop outright. Matches what the customer asked for — they wanted out. | Cuts off the rare "refunded one charge but continuing service" case. **Requires `adjustment.updated` handling** to learn about approval. |
| **2 — Grace period** (e.g. 72 h) | Alert immediately, revoke after N hours unless a human intervenes | Softer; a human can catch a mistake | Needs a scheduler/deferred job — **we have none**; `staleSweep.test.ts` implies a sweep pattern exists but this would be new infrastructure. Leaves a window open, and the abuse case doesn't care about 72 h. Most cost, least benefit. |
| **3 — At period end** | Refund recorded; access continues to the paid-through date | Feels fair for a mid-period voluntary refund | Nonsensical for a *full* refund — they were refunded the whole period, so "the period they paid for" no longer exists. Also needs `currentPeriodEnd`, which is on the schema (`:73`) but **never populated** — nothing in the webhook ever sets it. |
| **4 — Split by action** | Immediate on `chargeback`; immediate on approved **full** `refund`; log-only for partial refunds and credits | Matches the actual risk gradient. Chargebacks are terminal and adversarial by nature; partial refunds/goodwill credits genuinely shouldn't revoke | Slightly more branching. Depends on reading `action` and refund totals off the event |

### My recommendation — Option 4, and here's the argument that decides it

**We already have the escape hatch that makes immediate revocation safe.** `derivePlan.ts:41-43` makes `planOverride` a floor that **no billing event can lower** — `applyEntitlementChange` has, deliberately, no code path that writes it (`:30-33`). So the "legitimate refund-then-continue" case has a clean, already-built, already-tested answer: set `planOverride = PRO`. Immediate revocation is therefore *reversible by one field*, while the status quo — never revoking — is not reversible at all without noticing first. That asymmetry is the whole decision.

Option 2's grace period buys us a window we don't need (we have `planOverride` for regret) at the cost of infrastructure we don't have. Option 3 is incoherent for full refunds and depends on a column we never populate.

**Chargebacks should be immediate and unconditional.** A chargeback isn't a request — the money is already gone, plus a fee, and it is the single strongest abuse signal a payment processor emits. There is no "pending" state worth waiting on.

**Voluntary refunds should wait for approval**, not fire on `pending_approval` — a rejected refund that we already acted on would wrongly strip a paying customer, and no event would ever restore them. This is precisely what the existing TODO (`:236-238`) already argues, and I agree with it.

**The constraint that falls out of this:** Option 4's refund half is **not implementable without handling `adjustment.updated`**. The chargeback half is implementable today. That splits the work naturally, and it's reflected in §6.

---

## 5. Adjacent — flagged, not fixed

**a. Chargebacks and refunds are currently indistinguishable in behaviour.** `:268` branches on event type only; `action` is logged (`:243`, `:249`) but never read. Paddle's adjustment actions include `refund`, `credit`, `chargeback`, `chargeback_warning`, `chargeback_reverse`. All five currently produce identical handling. `chargeback_reverse` is notable in the other direction — it means the bank found *for us*, and arguably should restore access.

**b. The manual safety net may not exist.** Everything in v1 rests on a human reading a Discord alert. If `adjustment.created` isn't a subscribed notification type in the Paddle dashboard, no alert has ever fired. Unverifiable from here; 60 seconds to check; **do it first.**

**c. `transaction.completed` is an unconditional resurrect signal.** It maps to ACTIVE (`:195`) with no check that the subscription is still live. The out-of-order guard (`applyEntitlementChange.ts:73-76`) compares `occurred_at` to `lastEventAt`, so a *later-stamped* transaction arriving after `subscription.canceled` would re-grant PRO. I can't construct a likely sequence that does this in normal Paddle operation — flagging as fragility, not a live bug. The §3 fix does not address it (a resurrect txn would carry `subscription_id`).

**d. Dunning is handled correctly — no action needed.** `past_due` → ACTIVE (`:213-214`) so access isn't yanked mid-dunning; terminal failure arrives as `subscription.canceled`. Deliberate, documented (`:182-187`), correct.

**e. Unknown `subscription.updated` status → ACTIVE** (`:216-220`). Deliberate fail-safe. Noting only so refund work doesn't accidentally invert it.

**f. `currentPeriodEnd` (`schema.prisma:73`) is never populated** by any webhook path — `applyEntitlementChange` accepts it (`:13`, `:85`, `:95`) and the controller never passes it (`:338-344`). Dead column today. It is exactly what Option 3 would need, and would also enable a "revoke at period end" story later.

---

## 6. Plan & sequencing

### Step 0 — dashboard verification (no PR, blocking)

Three questions, none answerable from this repo, each of which can invalidate a design decision below:
1. Are `adjustment.created` **and** `adjustment.updated` subscribed notification types?
2. Capture a real delivered adjustment payload — is `subscription_id` populated? Is `custom_data` present or absent?
3. Does the catalog contain any one-off (non-recurring) price? (Also answers the allowlist recon's precondition.)

If (1) says `adjustment.created` isn't subscribed, that is the finding, and subscribing it is the highest-value five minutes available.

### PR A — refund/chargeback revoke

Everything here serves one behaviour, so it's one PR despite touching three files:
- New `resolveBillingOrgByExternalId(externalId)` in `services/entitlement/`, taking a string, not an event.
- Index migration on `Subscription.externalId`. **Flag:** per the known migrations-lag-prod constraint, this needs a deliberate `migrate deploy` — do not assume CI applies it. At current scale the index is a nice-to-have, so if the migration is friction, ship without it and add it later.
- `processEvent`: branch adjustments by `action`. `chargeback` ⇒ revoke immediately. `refund` + approved + full ⇒ revoke. Everything else ⇒ current log-only behaviour, unchanged.
- Handle `adjustment.updated` for the pending→approved transition.
- Document `planOverride = PRO` as the sanctioned reversal, in the code comment where the TODO currently sits (`:236-238`).

**If Step 0 shows `adjustment.updated` is unavailable**, ship the chargeback half alone and leave voluntary refunds on manual review. That is still a real improvement and it is honest about what we can detect.

### PR B — grant validation (one-off + price allowlist together)

Fold §3's `subscription_id`-required check into the price-allowlist PR from the previous recon. Same file, same function, same insertion point, same ACTIVE-only gating, same test fixtures, same "validate before granting" shape. Splitting them would mean two PRs touching the same ten lines of `classifyPaddleStatus`/`processEvent` back to back, for no review benefit.

### Order

**Step 0 → PR A → PR B.** PR A first because it is the confirmed, no-skill-required hole and needs no catalog knowledge. PR B second because both of its halves are latent and gated on what Step 0 finds in the catalog — and if the catalog turns out to hold exactly two recurring prices, PR B is prudence rather than urgency.

### Testing — no database needed for either

The harness is already right for this. `webhookController.test.ts:8-24` mocks `prisma`, both entitlement services, and the Discord sink, and signs requests properly (`:38-50`). `resolveBillingOrg.test.ts:3-5` shows the pattern for a resolver: plain `vi.mock` of `prismaClient`, no DB.

**PR A assertions:**
1. `adjustment.created` + `action: 'chargeback'` ⇒ `applyEntitlementChange` called with `INACTIVE`.
2. `adjustment.created` + `action: 'refund'` + `status: 'pending_approval'` ⇒ **not** called (existing test at `:272-286` must still pass unchanged — it is the regression guard for the pending case).
3. `adjustment.updated` + `action: 'refund'` + `status: 'approved'` ⇒ called with `INACTIVE`.
4. `action: 'credit'` / partial refund ⇒ log-only.
5. Adjustment with **no** `custom_data` ⇒ still resolves via `subscription_id`. **This is the load-bearing test** — it's the one that would have caught the fixture assumption in §1. Write it first.
6. Unresolvable `subscription_id` ⇒ alert fired, 200 returned, no throw.
7. Resolver unit tests: found / not-found / multiple-match.
8. **Fix the fixture at `:83-98`** to match the real captured payload from Step 0 — including dropping `custom_data` if real events lack it.

**PR B assertions:** as listed in the allowlist recon, plus `transaction.completed` **without** `subscription_id` ⇒ no grant + alert, and **with** `subscription_id` ⇒ grants normally (the legitimate-path regression guard).

Real Postgres (`TEST_DATABASE_URL`, guarded at `accountController.integration.test.ts:14-29`) is **not** required for either — `applyEntitlementChange` isn't changing and its in-memory-fake suite already covers it. The one thing mocks cannot prove is that the index migration applies cleanly; verify that against a throwaway Postgres using the documented docker flow, not prod.
