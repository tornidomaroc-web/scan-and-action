# First Customer Monitoring Runbook — Paddle Subscription Channel

> Operational safety net for the **first real PRO purchase**. The first customer
> *is* the test. When a purchase happens, this tells you exactly what to check,
> where, and how to react if PRO activation fails. No secrets in this file.

**Endpoint:** `POST https://scan-and-action-production.up.railway.app/api/webhook/paddle`
**Code of record:** `apps/backend/src/controllers/webhookController.ts`,
`services/entitlement/resolveBillingOrg.ts`, `applyEntitlementChange.ts`, `derivePlan.ts`
**Frontend checkout:** `apps/frontend/src/components/PaywallModal.tsx`

---

## 1. The Happy Path

When a customer completes checkout, in order:

1. Paddle fires billing events to our webhook. The two we act on:
   - `subscription.created` → mapped to **ACTIVE**
   - `transaction.completed` → mapped to **ACTIVE**
   (`classifyPaddleStatus`, `webhookController.ts`). Other events like
   `transaction.paid` / `subscription.activated` are received but mapped to
   `null` and ignored — that's normal.
2. For each, the webhook: verifies signature → records idempotency key
   `paddle:<event_id>` → extracts `data.custom_data.userId` (a UUID) →
   `resolveBillingOrg(userId, email)` finds the org → `applyEntitlementChange`
   upserts the `Subscription` row and recomputes `Organization.plan` via
   `derivePlan` → returns **200**.
3. Result: `Subscription(organizationId, source=PADDLE).status = ACTIVE`, and
   `Organization.plan = PRO`.

**Single source of truth — success log line (grep Railway):**
```
-> Org <orgId> [PADDLE ACTIVE]: plan FREE -> PRO (applied)
```
(emitted at the end of `processEvent`). Seeing `plan FREE -> PRO (applied)` =
done.

**DB confirmation:**
- `Organization.plan = 'PRO'` for the customer's org (the stored column actually
  read by upload/stats — never computed at read time).
- `Subscription` row keyed `@@unique([organizationId, source])` with
  `source = 'PADDLE'`, `status = 'ACTIVE'`, `externalId = <paddle sub id>`.

**Fastest single check** that "this customer is PRO": query
`Organization.plan` for their org (join from `User.email` → `Membership` →
`Organization`). If it reads `PRO`, activation worked.

---

## 2. Quick Confirm Checklist (right after the first sale)

- [ ] **Paddle → Notifications log:** delivery status for the events is **200 /
      Delivered** (not 4xx/5xx, not "pending retry").
- [ ] **Railway logs:** grep `-> Org` — expect `[PADDLE ACTIVE]: plan FREE -> PRO (applied)`.
- [ ] **DB:** `Organization.plan = 'PRO'` for the customer's org.
- [ ] **DB:** `Subscription` row exists with `source='PADDLE'`, `status='ACTIVE'`.

If all four are green, stop — the customer is live on PRO.

---

## 3. If It Failed — Triage Tree

### A) Paddle log shows non-200 (e.g. 401)
- **Meaning:** request never passed the signature/freshness gate; no DB write
  happened. Possible Railway log lines: `[Webhook] Invalid signature received`,
  `[Webhook] Stale or invalid timestamp`, or
  `[Webhook] Missing ts/h1 in paddle-signature header`.
- **Likely cause:** `PADDLE_WEBHOOK_SECRET` on Railway does not match the signing
  secret of *this* Paddle notification destination (most common: sandbox secret
  vs live secret).
- **Action:** Re-copy the destination's secret from Paddle → set on Railway →
  redeploy → in Paddle, **Retry** the delivery. (A 500 `Webhook secret not
  configured` means the env var is missing entirely.)

### B) Paddle shows 200 but customer still FREE
- **Meaning:** event passed the gate but did **not** resolve to an org. By design
  the handler **acks with 200 and applies no change** when the user can't be
  resolved (so Paddle stops retrying a structurally-valid event).
- **Proof line (grep Railway):**
  ```
  [Webhook][ALERT] PRO upgrade NOT applied — no user/org matches userId <...>, email <...> ... Customer paid but is still on FREE.
  ```
  Often preceded by:
  ```
  [resolveBillingOrg] userId <...> matches no user — trying email fallback.
  ```
- **Likely cause (in order):**
  1. `custom_data.userId` was **not sent** by checkout, or sent malformed (see §4)
     → log shows `userId none` or a "malformed" warning.
  2. `userId` was sent but no `User` row matches it (or the user has **zero
     memberships** → `resolveBillingOrg` returns null).
- **Action:** Find the `userId` in the ALERT line. Confirm a `User` with that
  `id` exists and has a `Membership`. If the customer genuinely paid, do the
  **Manual Rescue (§5)** to unblock them, then fix root cause. Do **not** expect
  the email fallback to save you — real Paddle Billing payloads carry no
  `customer.email` (only `customer_id`), so the fallback is effectively dead for
  live checkouts (see §4 flag).

### C) No `[Webhook] Received` line at all
- **Meaning:** the request never reached our handler. Expected line on any
  delivery:
  ```
  [Webhook] Received <event_type> (<event_id>) for <...>
  ```
- **Likely cause:** routing/delivery — wrong destination URL in Paddle, Railway
  service down/redeploying, or Paddle never sent (events not subscribed on the
  destination).
- **Action:** Confirm the Paddle destination URL is exactly
  `/api/webhook/paddle` on the production host; confirm Railway is up; in Paddle,
  check the destination is subscribed to `subscription.created` /
  `transaction.completed` and **Retry** the delivery.

---

## 4. The `custom_data.userId` Dependency (most likely failure point)

Activation hinges entirely on the checkout passing
`customData: { userId }`. That is set in **`PaywallModal.tsx`**, in
`handleUpgrade`:

```ts
paddle.Checkout.open({
  items: [{ priceId, quantity: 1 }],
  ...(user?.email ? { customer: { email: user.email } } : {}),
  ...(user?.id ? { customData: { userId: user.id } } : {}),   // ← THE hinge
  settings: { successUrl: CHECKOUT_SUCCESS_URL },
});
```

Paddle copies this `custom_data` onto the subscription and every downstream
event; the backend reads it at `data.custom_data.userId` and requires a valid
**UUID** (`customDataSchema`, `webhookController.ts`).

**If activation silently fails, verify:** the customer was **logged in** when
they clicked Upgrade (so `user.id` existed), and the webhook's
`[Webhook] Received ...` line shows a real UUID — not `unidentified user` and
not a "malformed" warning.

> ⚠️ **GAP TO FIX BEFORE / SOON AFTER FIRST SALE — flagging, not papering over.**
> Two real weaknesses here:
> 1. `customData` is attached **conditionally** (`user?.id ? ... : {}`). If
>    `user.id` is ever falsy at checkout time, the checkout still opens — just
>    with **no userId** — and the purchase will be unattributable.
> 2. The documented fallback (email match in `resolveBillingOrg`) reads
>    `event.data.customer.email`, but real **Paddle Billing** payloads send
>    `customer_id`, not an inline `customer.email`. So there is effectively
>    **no working fallback** if `userId` is missing — the comment in
>    `webhookController.ts` even calls email a fallback "for manual/imported
>    events" only.
>
> Net: `custom_data.userId` is a single point of failure with no live safety net.
> Recommend (proactive): add a hard guard so checkout refuses to open without
> `user.id`, and/or have the backend resolve via Paddle `customer_id` as a true
> fallback. Until then, §5 is the only rescue.

---

## 5. Manual Rescue (emergency stopgap, NOT the fix)

If a real paying customer is stuck on FREE while you debug, grant PRO via the
**`planOverride` floor**. `derivePlan` computes:

```
plan = max(planOverride ?? FREE, PRO if any source ACTIVE else FREE)
```

So `planOverride = 'PRO'` guarantees at least PRO regardless of billing state,
and webhooks **never** write `planOverride` (so a later billing event can't
clobber it).

**Caveat:** `Organization.plan` is a *stored* column, recomputed only when a
Subscription source changes. Setting `planOverride` alone does **not** refresh
`plan`. So set **both**:

```sql
UPDATE "Organization"
SET "planOverride" = 'PRO', "plan" = 'PRO'
WHERE id = '<orgId>';
```

(Find `<orgId>` via the customer's email → `Membership` → `Organization`.)

**This is a stopgap, not the fix.** Once the real Paddle path works and the
`Subscription(source=PADDLE)` row is `ACTIVE`, **reset the override**:

```sql
UPDATE "Organization" SET "planOverride" = NULL WHERE id = '<orgId>';
```

If you leave `planOverride = 'PRO'`, the customer will **stay PRO forever even
after they cancel** (the floor masks the downgrade). Always revert it.

---

### Escalate to a code investigation when:

> You see `[Webhook] Received` in Railway **and** Paddle shows **200**, the
> `userId` in the log **does** exist in the `User` table **with** a membership —
> yet there is **no** `-> Org ... [PADDLE ACTIVE]: plan FREE -> PRO (applied)`
> line and the org stays FREE. That means resolution/entitlement is failing in
> **code**, not config.
