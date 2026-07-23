# Server-side price-ID allowlist — recon

**Date:** 2026-07-22 · **Base:** `main` @ `00bc06c` · **Mode:** read-only recon. No code, config, DB, or prod contact.
**Origin:** surfaced as adjacent finding (a) in `docs/WEB_PRICING_DRIFT_RECON_2026-07-22.md`.

**Verdict up front — I am correcting my own framing from the item #4 recon.** The mechanism is confirmed exactly as described: the grant path never reads price, product or amount, and the price ID is chosen client-side. But I called it "a live hole… ranked above item #4," and that overstated the *confirmed* impact. Its blast radius depends entirely on what is in the Paddle catalog, which I cannot see from here — and if the catalog is clean, the price-substitution attack yields **nothing a user can't already get by clicking the "Monthly" button.**

Meanwhile, tracing this end-to-end surfaced **two defects that need no dashboard to confirm and are more accessible than the one we set out to investigate** — including one that requires no technical skill whatsoever. See §5. My recommendation reflects that reordering.

---

## 1. The grant path — traced end to end

**Route:** `apps/backend/src/app.ts:32-35` — `/api/webhook/paddle`, mounted with `express.raw()` **before** global `express.json()` so the raw body survives for HMAC. Correct.

**Handler:** `apps/backend/src/controllers/webhookController.ts`

| Stage | Location | What happens |
|---|---|---|
| Signature | `:36-87` | HMAC-SHA256 over `` `${ts}:${rawBody}` ``, constant-time compare (`:84`). Solid. |
| Replay window | `:62-71` | Rejects events older than 5 min / >60 s in the future (`:29-31`). Solid. |
| Idempotency | `:101-116` | `webhookEvent.create` on `paddle:<event_id>`; P2002 ⇒ 200 duplicate. Claim is **released on processing error** (`:139-141`) so a retry isn't lost. Well built. |
| Identity | `:162-170` | `extractUserId` — reads `event.data.custom_data.userId`, validated only as a **UUID shape** (`:24`). Nothing binds it to the payer. |
| Status mapping | `:194-221` | `classifyPaddleStatus` / `classifySubscriptionStatus`. |
| Org resolution | `:293` → `resolveBillingOrg.ts:52-96` | `userId` → `User.id`, email fallback (`:72-77`), deterministic membership pick (`:27-37`). |
| Entitlement write | `:338-344` → `applyEntitlementChange.ts:45-135` | Locks the org row `FOR UPDATE` (`:54-56`), out-of-order guard (`:69-76`), upserts the `(orgId, source)` Subscription row (`:88-99`), re-derives plan (`:123`), writes only on change (`:126-131`). |
| Derivation | `derivePlan.ts:38-44` | `plan = max(planOverride ?? FREE, PRO if any subscription ACTIVE else FREE)`. |

**Fields read from the Paddle event — the complete list:**
`event_type` (`:90`), `event_id` (`:91`), `occurred_at` (`:226`), `data.customer.email` / `data.email` (`:92`), `data.custom_data.userId` (`:163`), `data.status` (`:202`), `data.customer_id` (`:290`), `data.subscription_id` / `data.id` (`:311`, `:335`), and on refunds only `data.{id,action,status,transaction_id}` (`:240-245`).

**What PRO is keyed on:** `derivePlan.ts:41` — `subscriptions.some(s => s.status === 'ACTIVE')`. That is the whole test. **Nothing about price, product, amount or currency enters the decision at any point.** Confirmed by grep across `webhookController.ts` and all of `src/services/entitlement/` for `price|amount|total|product`: the only hits are prose in comments (`webhookController.ts:238`, `derivePlan.ts:32`).

**The schema cannot even store it:** `apps/backend/prisma/schema.prisma:66-80` — `Subscription` has `id, organizationId, source, status, externalId, currentPeriodEnd, lastEventAt, createdAt, updatedAt`. No price, product, amount or currency column. `@@unique([organizationId, source])` (`:78`) — **one row per org per source**, which matters in §5.

**Your framing is accurate on every point.** `derivePlan.ts:38-44`, the never-reads-price claim, and the client-side price ID all hold against current source, unchanged.

---

## 2. The attack — confirmed mechanism, unconfirmed blast radius

**Client-side selection, confirmed:**
`PaywallModal.tsx:20-23` builds `PADDLE_PRICE_IDS` from `import.meta.env.VITE_PADDLE_PRICE_ID_MONTHLY` / `_YEARLY`. `VITE_`-prefixed vars are **inlined into the public bundle at build time** — these are not secrets and were never intended to be (the audit notes this at `:185`). `:110` selects one, `:120-126` passes it straight to `paddle.Checkout.open({ items: [{ priceId, quantity: 1 }] })`.

**There is no server-side transaction creation at all.** The backend has no Paddle SDK (`apps/backend/package.json` — no `@paddle/*` dependency), no `PADDLE_API_KEY`, no call to `api.paddle.com` anywhere in `apps/backend/src`. Its only Paddle secret is `PADDLE_WEBHOOK_SECRET` (`.env.example:14`). **The server's first and only knowledge of a purchase is the webhook that arrives after the fact.**

**Substitution is trivial:** open devtools and call `Paddle.Checkout.open({ items: [{ priceId: 'pri_<anything>', quantity: 1 }], customData: { userId: '<any uuid>' } })`. No build step, no proxy, no signature to forge. The resulting checkout is a genuine Paddle checkout; the resulting webhook is genuinely signed by Paddle and passes every check in `:36-87`.

**What the server sees:** the event *does* carry the price (see §4) — but the code never reads it, so today the server sees **nothing** about which price was used. A subscription created against a $0.50 price and one created against the $59 price produce byte-identical entitlement outcomes.

### True exploitability — honest assessment

| Vector | Status |
|---|---|
| Sandbox price against production | **Not viable.** `paddle.ts:16-18` derives environment from the token prefix; `test_` and `live_` are separate Paddle environments with separate catalogs. Rule this out. |
| Cheaper *live* price (monthly instead of yearly) | Viable but **worthless** — the UI already offers Monthly as a button. No attack. |
| **Stale $5 / $39 prices** | **Highest-probability real vector.** Commit `0560655` (2026-04-01) changed the displayed price $5→$9 / $39→$59. If that was done in Paddle by **creating new price objects** rather than editing amounts in place, the old prices very likely still exist and, if still `active`, remain checkout-able. That is $9→$5 and $59→$39 for anyone who reads the old commit — and this repo is the only place the old numbers are written down. |
| $0 / trial price | Free PRO forever if one exists. Existence unknown. |
| One-off (non-subscription) price | See §5-A — worse than cheap, it's *permanent*. |
| `quantity` manipulation | Only raises the charge. Not useful. |

**Everything in that table below the first two rows depends on the Paddle catalog, which I cannot see.** The honest position: this is an **unbounded-trust defect with unknown-but-catalog-bounded impact**. Before spending a PR on it, spend two minutes in the Paddle dashboard listing every price object and its status (active/archived) and amount. If the catalog holds exactly two active prices at $9 and $59, this defect is currently **unexploitable for gain** and drops to "harden before we ever add a second product." If it holds an archived-but-active $5, or any $0 or one-off price, it is live and urgent. **That check should gate the work, not follow it.**

---

## 3. Canonical price IDs — where truth lives today

**Nowhere in the codebase, and nowhere the backend can reach.**

- `.env.example:46-47` — `VITE_PADDLE_PRICE_ID_MONTHLY` / `_YEARLY`, placeholder `pri_xxxxxxxxxxxx` values only.
- `apps/frontend/.env.production` — the *committed*, deliberately-tracked env file. Carries only `VITE_API_URL`; its header explicitly states Paddle credentials come from the build environment. So the real IDs are **Vercel dashboard** values, consumed at frontend build time.
- Backend env surface (`.env.example:1-40`) — `PADDLE_WEBHOOK_SECRET` and nothing else. **The Railway backend has never known a price ID.**

So an allowlist has no existing source of truth to read. Whatever we choose, we are **creating** the canonical set for the first time. That's the central design question in §6, and it's a bigger deal than it looks: today the price ID exists in exactly one dashboard, and a naive fix would put a second copy in a second dashboard with no mechanism keeping them equal — reintroducing item #4's exact drift shape on the server side, where the failure mode is "legitimate paying customer is rejected."

---

## 4. The fix surface

**Where the check belongs:** `webhookController.processEvent`, between `classifyPaddleStatus` (`:273`) and `applyEntitlementChange` (`:338`). That is the last point where the raw event is still in scope and the only point that knows whether this is an upgrade or a downgrade. It must **not** go inside `applyEntitlementChange` — that service is deliberately billing-source-agnostic (`:26-33`: "NO event-shape parsing"), and `price.id` is Paddle-specific vocabulary. Putting it there would break a boundary the codebase maintains carefully.

**The one constraint that must not be missed:** the check must gate **ACTIVE transitions only**. A downgrade (`INACTIVE`) must apply unconditionally, regardless of price ID — including when the price is unrecognized or absent. Getting this backwards means a cancelled subscription with an odd price keeps PRO forever. The existing code already leans fail-safe-toward-the-customer in both directions (`:216-220`, `:262-267`), and the allowlist must not invert that.

**Does the event carry the price ID?** Per Paddle Billing's documented event schema, yes — `data.items[].price.id` is present on `subscription.created` and `subscription.updated`, and `transaction.completed` carries both `data.items[].price.id` and `data.details.line_items[].price_id`.

**But I am flagging this as the single highest-risk assumption in the whole plan, and it is NOT confirmed from this repo.** Our test fixtures (`webhookController.test.ts:59-95`) carry no `items` array at all — because the code has never read one, so nothing forced the fixtures to be realistic. The fixtures prove nothing about Paddle's real shape. **Confirm against a real captured event (Paddle dashboard → Notifications → a delivered event's payload) before writing the check.** If the field is absent on some event family, the fallback would be a Paddle API lookup — which means a new API key, a new secret, and an outbound HTTP call inside the payment path. That is a materially larger change and would justify rescoping.

`transaction.completed` is the event that actually fires first on a new purchase (`:195`), so it is the one that matters most for gating an upgrade — verify that family specifically.

---

## 5. Adjacent — two confirmed defects that outrank the one we came for

### A. `transaction.completed` grants PRO permanently, with no subscription required

`classifyPaddleStatus:195` maps `transaction.completed` → `ACTIVE` **unconditionally** — no check that a subscription exists behind it. Combine with two structural facts:

- `schema.prisma:78` — `@@unique([organizationId, source])`: one PADDLE row per org, holding a single `status`.
- Every downgrade path (`:198-203`) fires only on `subscription.canceled` / `subscription.updated`.

So a **one-off, non-subscription transaction** sets `PADDLE = ACTIVE` and **no subscription lifecycle event will ever exist to clear it**. That is permanent PRO for a single charge. Whether a one-off price exists in the catalog is unverified — but unlike §2, the *code* defect here is unconditional and confirmed, and it converts any cheap one-off price in the catalog from "cheap PRO" into "permanent PRO."

### B. Refunds never revoke PRO — confirmed, deliberate, and requires no technical skill at all

`processEvent:268-271` — `adjustment.created` ⇒ `logRefundForReview` (console + Discord) ⇒ `return`. No entitlement change. This is explicit v1 policy with sound reasoning (`:262-267`: pending refunds may be rejected; partial refunds shouldn't revoke) and a `TODO(refund-auto-revoke)` at `:236-238`.

The reasoning is defensible. The consequence is not: **buy PRO for $9, request a refund, keep PRO indefinitely** until a human reads a Discord alert and acts by hand. No devtools. No catalog knowledge. No console. Just a support email.

**This is the most accessible revenue-integrity hole in the system, and it is the only one on this page confirmed with zero unverified dependencies.**

Note it is **not** covered by audit item #5 as framed. Item #5 is *paid user loses access they paid for*. This is the mirror image — *unpaid user retains access they didn't pay for* — and I don't see it captured anywhere. It needs a product decision (auto-revoke gated on `action === 'refund' && status === 'approved'` and full-amount, per the existing TODO), not just code.

### C. The composite: a $0-net free-PRO pipeline

`custom_data.userId` is fully client-controlled and validated only as a UUID (`:24`, `:162-170`) — nothing binds it to the payer. So: pay once → direct the grant at any org → request a refund → that org keeps PRO. Net cost to the attacker after refund: approximately zero. Each link is individually documented above; the chain is what makes it notable.

### D. Minor, noted for completeness

- `classifySubscriptionStatus:216-220` — unknown status defaults to `ACTIVE`. Deliberate, documented, correct posture. Noting only because an allowlist must not quietly convert this fail-open into a fail-closed.
- `resolveBillingOrg.ts:72-77` — email fallback. Low risk in practice: Paddle Billing payloads carry no email (`webhookController.ts:22-23`), so `email` is near-always `undefined`.
- `webhookController.ts:335` — `externalId` is `subscription_id || id`, so a one-off transaction stores a `txn_…` id in a column documented as holding a subscription id (`schema.prisma:72`). Cosmetic today; makes A harder to spot in the DB.

---

## 6. Recommendation — smallest server-side change that closes the hole

**Precondition (do this first, it's free):** audit the Paddle catalog — every price object, its status, amount, and whether it's one-off or recurring. Specifically hunt for the pre-`0560655` $5/$39 prices. This costs two minutes and determines whether any of the below is urgent or merely prudent. **Archiving stale prices in the dashboard may close most of the real exposure with no code at all** — and that possibility deserves to be evaluated before we spend engineering on it.

**Then, staged — two small PRs, not one:**

**PR 1 — observe only.** In `processEvent`, extract `data.items?.[0]?.price?.id` (falling back to `data.details?.line_items?.[0]?.price_id`) and, when `status === 'ACTIVE'` and the price is not in the canonical set, emit a `[Webhook][ALERT]` line plus a `fireDiscordAlert` — **and still grant PRO**. Downgrades bypass the check entirely.

Why observe-first rather than enforce immediately: it **empirically answers §4's open question** (does the field actually arrive, on every event family, with the shape we expect) using real production traffic instead of an assumption, and it does so with zero risk of rejecting a paying customer. Given that the exposure is catalog-bounded and possibly nil, spending a week of observation to avoid a "customer paid but is FREE" incident (`:314`) is the right trade — that incident is the exact failure this codebase already alerts loudly about, and enforcing on an unverified field shape would be a way to *cause* it.

**PR 2 — enforce.** Once the logs confirm the field arrives and no legitimate price trips the check, flip non-canonical ACTIVE events to skip `applyEntitlementChange` (alert retained). Two-line diff.

**Where the canonical set comes from: committed config, not a new env var.** A new `PADDLE_PRICE_ID_*` on Railway would put a second copy of the value in a second dashboard with nothing keeping it equal to Vercel's — recreating item #4's drift on the server, where the failure mode is *rejecting real customers*. Instead: a committed constant (e.g. `apps/backend/src/config/paddlePrices.ts`) listing the canonical IDs. They are not secrets — they're already inlined in the public bundle — so committing them costs nothing and buys git history, code review, and testability. Add an optional comma-separated env override for emergencies (adding a price without a deploy). Accept that the frontend keeps reading its own `VITE_` vars; document that both must name the same IDs.

Worth noting for sequencing: this committed catalog is a natural home for item #4's display fallback too. If #4 lands first, build it there; if this lands first, #4 should read from it. Either order works — don't create two catalogs.

**No schema migration in either PR.** Persisting the price on `Subscription` would need a new column (`schema.prisma:66-80` has none), and per the migrations-lag-prod constraint, merged migrations can silently lag the live DB. Log-only keeps both PRs deploy-safe. Revisit persistence separately if the observation data proves it useful.

**Testing — no database required.** `webhookController.test.ts` already mocks `prisma`, `resolveBillingOrg`, `applyEntitlementChange` and `discordAlert` (`:8-24`) and builds correctly-signed requests (`:38-50`). Extend the fixtures (`:59-95`) with realistic `data.items[].price.id`, then assert:

1. Canonical price + ACTIVE ⇒ `applyEntitlementChange` called, no alert.
2. Non-canonical + ACTIVE ⇒ alert fired; PR1: still called · PR2: **not** called.
3. **Non-canonical or absent price + INACTIVE ⇒ always applied.** The regression that matters most — this is the one that strands a cancelled user on PRO if we get the gate backwards.
4. Missing `items` entirely ⇒ treated as unknown-and-alerted, never as rejection.
5. Both event families (`transaction.completed`, `subscription.created`) exercised, since their payload shapes differ.

The real-Postgres path (`TEST_DATABASE_URL`, guarded at `accountController.integration.test.ts:14-29`) is **not needed** — `applyEntitlementChange` isn't changing, and its own in-memory-fake suite already covers it.

**Sequencing — my actual recommendation on priority.** Finding B (refunds never revoke) is confirmed, needs no dashboard, and is exploitable by anyone who can write a support email. The price-ID allowlist is a real defect but its impact is unknown and possibly zero. **I'd take the refund-revoke decision first**, or at minimum in parallel — and I'd stop calling the allowlist "blocking" until the catalog audit says it is. That's a correction to what I told you last turn.
