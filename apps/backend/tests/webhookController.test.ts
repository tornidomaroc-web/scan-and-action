import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Idempotency table lives on prisma; user/org resolution and the plan write now
// live behind the resolver + service, which we mock to keep this a controller
// (mapping + infra) unit test. Service/resolver correctness is covered by their
// own tests.
vi.mock('../src/prismaClient', () => ({
  prisma: {
    webhookEvent: { create: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock('../src/services/entitlement/resolveBillingOrg', () => ({
  resolveBillingOrg: vi.fn(),
}));
// The adjustment (refund/chargeback) identity path. Distinct from resolveBillingOrg
// on purpose: adjustments carry no custom_data, so they resolve by subscription_id.
vi.mock('../src/services/entitlement/resolveBillingOrgByExternalId', () => ({
  resolveBillingOrgByExternalId: vi.fn(),
}));
vi.mock('../src/services/entitlement/applyEntitlementChange', () => ({
  applyEntitlementChange: vi.fn(),
}));
// The Discord alert sink is best-effort observability layered on top of the
// existing console.* logs. It is mocked here so we assert it is *invoked* on the
// failure paths without making real HTTP calls, and so we can prove a failing
// alert never changes the webhook's HTTP response.
vi.mock('../src/services/discordAlert', () => ({
  sendDiscordAlert: vi.fn(),
}));

import { prisma } from '../src/prismaClient';
import { resolveBillingOrg } from '../src/services/entitlement/resolveBillingOrg';
import { resolveBillingOrgByExternalId } from '../src/services/entitlement/resolveBillingOrgByExternalId';
import {
  adjustmentCreated,
  adjustmentUpdated,
  FIXTURE_SUBSCRIPTION_ID,
} from '../src/testSupport/paddleAdjustment';
import { applyEntitlementChange } from '../src/services/entitlement/applyEntitlementChange';
import { sendDiscordAlert } from '../src/services/discordAlert';
import { WebhookController } from '../src/controllers/webhookController';
import { CANONICAL_PADDLE_PRICE_IDS } from '../src/config/paddlePrices';

const SECRET = 'test-webhook-secret';
const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const ORG_ID = 'org-uuid-1';
// A REAL shipping price id, from the same catalog the grant gate validates
// against — so these tests exercise the allowlist rather than a stand-in that
// could pass while the real ids are wrong.
const MONTHLY_PRICE_ID = [...CANONICAL_PADDLE_PRICE_IDS][0];

// Builds a correctly signed request the way Paddle does: h1 = HMAC-SHA256
// over `${ts}:${rawBody}` — so these tests also exercise the signature path.
function signedRequest(eventBody: object, overrides: { signature?: string } = {}) {
  const rawBody = Buffer.from(JSON.stringify(eventBody), 'utf8');
  const ts = Math.floor(Date.now() / 1000);
  const h1 =
    overrides.signature ??
    crypto.createHmac('sha256', SECRET).update(`${ts}:${rawBody}`).digest('hex');
  return {
    body: rawBody,
    get: (header: string) =>
      header.toLowerCase() === 'paddle-signature' ? `ts=${ts};h1=${h1}` : undefined,
  } as any;
}

function mockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

// A Paddle Billing transaction.completed for a SUBSCRIPTION purchase.
//
// SHAPE IS LOAD-BEARING. This fixture previously carried neither `subscription_id`
// nor `items`, so it did not match any real Paddle payload: a subscription
// transaction always carries `subscription_id` (documented `string | null`, null
// only for one-off transactions) and `data.items[].price.id`. Nothing caught it
// because no code read those fields — the same way the adjustment fixture carried
// a `custom_data` field Paddle does not send. Both are now read, so both must be
// real. https://developer.paddle.com/webhooks/transactions/transaction-completed
function transactionCompleted(data: object, eventId = 'evt_test_1') {
  return {
    event_id: eventId,
    event_type: 'transaction.completed',
    data: {
      id: 'txn_1',
      status: 'completed',
      customer_id: 'ctm_1',
      subscription_id: 'sub_1',
      items: [{ price: { id: MONTHLY_PRICE_ID } }],
      ...data,
    },
  };
}

// A Paddle Billing subscription.* event. `data.status` carries the subscription
// status the handler maps on (active/trialing/past_due/paused/canceled).
function subscriptionEvent(
  eventType: string,
  data: object = {},
  eventId = `evt_${eventType.replace(/\./g, '_')}`
) {
  return {
    event_id: eventId,
    event_type: eventType,
    data: { id: 'sub_1', custom_data: { userId: USER_ID }, ...data },
  };
}

// Adjustment fixtures come from the SHARED definition (src/testSupport/paddleAdjustment)
// so this file and the resolver's tests can never disagree about the event shape —
// the disagreement is exactly what let a fabricated `custom_data` field survive here.
// See that file for the Paddle doc references and for why it lives under src/.

describe('WebhookController.handlePaddle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PADDLE_WEBHOOK_SECRET = SECRET;
    (prisma.webhookEvent.create as any).mockResolvedValue({});
    (prisma.webhookEvent.delete as any).mockResolvedValue({});
    // Defaults: resolution succeeds, service reports an upgrade.
    (resolveBillingOrg as any).mockResolvedValue({ organizationId: ORG_ID });
    (resolveBillingOrgByExternalId as any).mockResolvedValue({ organizationId: ORG_ID });
    (applyEntitlementChange as any).mockResolvedValue({
      previousPlan: 'FREE',
      newPlan: 'PRO',
      applied: true,
    });
    (sendDiscordAlert as any).mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrades the org (PADDLE ACTIVE) when custom_data.userId matches a user (no email in payload, like real Paddle Billing events)', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(resolveBillingOrg).toHaveBeenCalledWith(USER_ID, undefined);
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'ACTIVE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies no change and logs an ALERT when resolution fails and there is no email', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies no change and logs an ALERT when custom_data is missing entirely', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(signedRequest(transactionCompleted({})), res);

    // No identifiers extracted -> resolver called with (null, undefined).
    expect(resolveBillingOrg).toHaveBeenCalledWith(null, undefined);
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not throw on malformed userId (non-UUID, wrong type) — logs and fails safe', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    for (const bad of [12345, 'not-a-uuid', { nested: true }, null]) {
      vi.clearAllMocks();
      (prisma.webhookEvent.create as any).mockResolvedValue({});
      (resolveBillingOrg as any).mockResolvedValue(null);
      const res = mockResponse();

      await WebhookController.handlePaddle(
        signedRequest(transactionCompleted({ custom_data: { userId: bad } })),
        res
      );

      expect(applyEntitlementChange).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('falls back to email matching when custom_data is absent but the payload carries an email', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ customer: { email: 'buyer@example.com' } })),
      res
    );

    expect(resolveBillingOrg).toHaveBeenCalledWith(null, 'buyer@example.com');
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'ACTIVE' })
    );
  });

  // ── Paddle Billing event → entitlement status mapping ──────────────────────
  // Replaces the previous dead-event behaviour. Paddle Billing emits NEITHER
  // 'subscription.expired' NOR 'transaction.refunded', and has no 'expired'
  // subscription status — so the old downgrade path could never fire. The real
  // contract is asserted below.

  const downgrade = () =>
    (applyEntitlementChange as any).mockResolvedValue({
      previousPlan: 'PRO',
      newPlan: 'FREE',
      applied: true,
    });

  it('subscription.created → ACTIVE (PRO)', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.created', { status: 'active' })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'ACTIVE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('transaction.completed → ACTIVE (PRO)', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'PADDLE', status: 'ACTIVE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // subscription.updated maps by data.status. active/trialing/past_due keep PRO
  // (past_due deliberately stays ACTIVE so access is not yanked mid-dunning);
  // paused/canceled downgrade to FREE.
  const updatedCases: Array<{ status: string; expected: 'ACTIVE' | 'INACTIVE' }> = [
    { status: 'active', expected: 'ACTIVE' },
    { status: 'trialing', expected: 'ACTIVE' },
    { status: 'past_due', expected: 'ACTIVE' },
    { status: 'paused', expected: 'INACTIVE' },
    { status: 'canceled', expected: 'INACTIVE' },
  ];
  for (const { status, expected } of updatedCases) {
    it(`subscription.updated status=${status} → ${expected}`, async () => {
      if (expected === 'INACTIVE') downgrade();
      const res = mockResponse();
      await WebhookController.handlePaddle(
        signedRequest(subscriptionEvent('subscription.updated', { status })),
        res
      );
      expect(applyEntitlementChange).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: expected })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  }

  it('subscription.canceled → INACTIVE (FREE) — authoritative terminal downgrade', async () => {
    downgrade();
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.canceled', { status: 'canceled' })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'INACTIVE' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ==========================================================================
  // ADJUSTMENT POLICY (refunds / chargebacks).
  //
  // Every test here asserts the ENTITLEMENT OUTCOME — that applyEntitlementChange
  // was or was not called, and with INACTIVE — not merely that nothing threw.
  // A "no-throw" assertion would have passed against the old do-nothing handler.
  //
  // Identity on this path NEVER comes from custom_data (adjustments do not have
  // it); it comes from subscription_id via resolveBillingOrgByExternalId.
  // ==========================================================================

  /** Asserts a revoke happened: the org was set INACTIVE through the shared service. */
  function expectRevoked() {
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        source: 'PADDLE',
        status: 'INACTIVE',
        externalId: FIXTURE_SUBSCRIPTION_ID,
      })
    );
  }

  it('REVOKES on chargeback — funds are already gone, no approval step to wait for', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ action: 'chargeback', status: 'approved' })),
      res
    );
    expectRevoked();
    // Resolved by subscription_id, NOT by any user identifier.
    expect(resolveBillingOrgByExternalId).toHaveBeenCalledWith('PADDLE', FIXTURE_SUBSCRIPTION_ID);
    expect(resolveBillingOrg).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does NOT revoke a refund still pending Paddle approval — it may yet be rejected', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ action: 'refund', status: 'pending_approval', type: 'full' })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toMatch(/adj_1/);
    expect(logged).toMatch(/refund/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('REVOKES when adjustment.updated carries the approved FULL refund — the only event with the decision', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentUpdated({ action: 'refund', status: 'approved', type: 'full' })),
      res
    );
    expectRevoked();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does NOT revoke an approved PARTIAL refund — the customer still paid for most of the period', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentUpdated({ action: 'refund', status: 'approved', type: 'partial' })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does NOT revoke when `type` is ABSENT — Paddle defaults type to partial, so absence must not read as full', async () => {
    const res = mockResponse();
    const ev = adjustmentUpdated({ action: 'refund', status: 'approved' });
    delete (ev.data as any).type;
    await WebhookController.handlePaddle(signedRequest(ev), res);
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does NOT revoke a rejected refund', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentUpdated({ action: 'refund', status: 'rejected', type: 'full' })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // The non-revoking actions, asserted as a set so a future edit cannot quietly
  // promote one of them into a revoke.
  const logOnlyActions = [
    'credit',
    'chargeback_warning',
    'chargeback_reverse',
    'chargeback_warning_reverse',
    'credit_reverse',
  ];
  for (const action of logOnlyActions) {
    it(`does NOT touch entitlement for action='${action}'`, async () => {
      const res = mockResponse();
      await WebhookController.handlePaddle(
        signedRequest(adjustmentCreated({ action, status: 'approved', type: 'full' })),
        res
      );
      expect(applyEntitlementChange).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  }

  it('does NOT revoke on an unrecognized action — unknown vocabulary never moves entitlement', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ action: 'some_future_action', status: 'approved', type: 'full' })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('FAILS SAFE: a chargeback with subscription_id null does NOT revoke, and alerts instead', async () => {
    // Paddle types subscription_id as `string | null` — a refund/chargeback against
    // a one-off transaction has none. Guessing an org here would revoke an innocent
    // customer, so we must alert and stop.
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ action: 'chargeback', subscription_id: null })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(resolveBillingOrgByExternalId).not.toHaveBeenCalled();
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toMatch(/subscription_id is absent/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('FAILS SAFE: a chargeback whose subscription matches no stored row does NOT revoke, and alerts', async () => {
    (resolveBillingOrgByExternalId as any).mockResolvedValue(null);
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ action: 'chargeback' })),
      res
    );
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toMatch(/matches no stored subscription/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('THE ESCAPE HATCH: a manual planOverride survives a refund revoke — org keeps PRO', async () => {
    // "Refunded but keep access" is handled by Organization.planOverride, which the
    // entitlement service never writes and derivePlan treats as a floor. Here the
    // controller's part is asserted: it maps the approved full refund to INACTIVE and
    // hands it to the floor-owning service, which reports PRO still standing. The
    // controller has no path that writes plan itself — the prisma mock in this file
    // exposes only webhookEvent, so a direct plan write would throw.
    (applyEntitlementChange as any).mockResolvedValue({
      previousPlan: 'PRO',
      newPlan: 'PRO',
      applied: true,
    });
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentUpdated({ action: 'refund', status: 'approved', type: 'full' })),
      res
    );
    expectRevoked();
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toMatch(/PRO -> PRO/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('override (ENTERPRISE) org is NOT downgraded by a canceled event — controller delegates to the floor-owning service and never writes plan itself', async () => {
    // The planOverride FLOOR is enforced inside applyEntitlementChange/derivePlan
    // (covered there: derivePlan "ENTERPRISE override survives an INACTIVE billing
    // source"). At the controller boundary we assert OUR part: a canceled event is
    // mapped to INACTIVE and handed to the floor-owning service, which returns the
    // unchanged ENTERPRISE plan. The controller has no path that writes
    // Organization.plan/planOverride directly — note the prisma mock here exposes
    // only webhookEvent, so any direct plan write would throw and fail this test.
    (applyEntitlementChange as any).mockResolvedValue({
      previousPlan: 'ENTERPRISE',
      newPlan: 'ENTERPRISE',
      applied: true,
    });
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.canceled', { status: 'canceled' })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'INACTIVE' })
    );
    // Floor held inside the service; the webhook completed without a direct write.
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Infra regression guards: signature, replay, idempotency, release-claim — must
  // be byte-for-byte unchanged by the Step 2b refactor.

  it('rejects a bad signature with 401 and never touches the database or service', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }), {
        signature: 'ab'.repeat(32),
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(resolveBillingOrg).not.toHaveBeenCalled();
    expect(applyEntitlementChange).not.toHaveBeenCalled();
  });

  it('skips duplicate deliveries via the idempotency table (P2002 → 200, no processing)', async () => {
    (prisma.webhookEvent.create as any).mockRejectedValue({ code: 'P2002' });
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('OK (duplicate)');
    expect(resolveBillingOrg).not.toHaveBeenCalled();
    expect(applyEntitlementChange).not.toHaveBeenCalled();
  });

  it('releases the idempotency claim (namespaced key) when processing fails, so Paddle retries are not lost', async () => {
    (applyEntitlementChange as any).mockRejectedValue(new Error('db down'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }, 'evt_release_me')),
      res
    );

    // Claim created and released under the SAME source-namespaced key, else the
    // release no-ops and Paddle's retry is lost.
    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: { id: 'paddle:evt_release_me', eventType: 'transaction.completed' },
    });
    expect(prisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { id: 'paddle:evt_release_me' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ==========================================================================
  // GRANT-SIDE HARDENING (PR B).
  //
  // Part 1 (price allowlist) is ALERT-ONLY: an unrecognised price is named loudly
  // but still granted, because the likely false positive is US adding a promo
  // price and forgetting the config — and rejecting a charged customer is worse
  // than granting one we then review.
  //
  // Part 2 (one-off transactions) is ENFORCED: a transaction with no subscription
  // behind it would set PRO that NO event we handle can ever clear. A wrong denial
  // is loud and fixable via planOverride; a wrong permanent grant is silent and
  // has no remedy.
  //
  // Both gate ACTIVE only. Every downgrade must survive them untouched.
  // ==========================================================================

  it('GRANTS on a canonical price (the happy path is genuinely exercised, not bypassed)', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'ACTIVE' })
    );
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).not.toMatch(/UNRECOGNISED/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ALERT-ONLY: an unrecognised price is named loudly but STILL GRANTED', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(
        transactionCompleted({
          custom_data: { userId: USER_ID },
          items: [{ price: { id: 'pri_legacy_five_dollar' } }],
        })
      ),
      res
    );

    // Granted — a charged customer is never denied over a config gap.
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' })
    );
    // …but the price is named, or the alert is useless for triage.
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toContain('[Webhook][ALERT]');
    expect(logged).toContain('UNRECOGNISED price');
    expect(logged).toContain('pri_legacy_five_dollar');
    expect(sendDiscordAlert).toHaveBeenCalledWith(
      expect.stringContaining('UNRECOGNISED Paddle price'),
      expect.objectContaining({ unknown_price_ids: 'pri_legacy_five_dollar' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reads the price from data.details.line_items[] when items[] is absent', async () => {
    const res = mockResponse();
    const ev = transactionCompleted({ custom_data: { userId: USER_ID } });
    delete (ev.data as any).items;
    (ev.data as any).details = { line_items: [{ price_id: 'pri_promo_unknown' }] };

    await WebhookController.handlePaddle(signedRequest(ev), res);

    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toContain('pri_promo_unknown');
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' })
    );
  });

  it('ENFORCED: a bare one-off transaction (no subscription_id) does NOT grant', async () => {
    const res = mockResponse();
    const ev = transactionCompleted({ custom_data: { userId: USER_ID } });
    delete (ev.data as any).subscription_id;

    await WebhookController.handlePaddle(signedRequest(ev), res);

    // The whole point: no unrevokable PRO.
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toContain('[Webhook][ALERT]');
    expect(logged).toContain('Grant REFUSED');
    expect(sendDiscordAlert).toHaveBeenCalledWith(
      expect.stringContaining('Grant REFUSED'),
      expect.objectContaining({ transaction_id: 'txn_1' })
    );
    // Still 200: Paddle must not retry a decision that will not change.
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a subscription purchase still grants via subscription.created even if its transaction is refused', async () => {
    // Why enforcing Part 2 is safe: subscription.created grants independently of
    // the one-off gate, so a real subscription customer cannot be stranded by it.
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.created', { items: [{ price: { id: MONTHLY_PRICE_ID } }] })),
      res
    );
    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' })
    );
  });

  // ── THE UNCONDITIONAL-DOWNGRADE GUARD ──────────────────────────────────────
  // The opposite direction from the grant gate, and the one that must never
  // regress: if a gate ever blocked a downgrade, a cancelled subscription would
  // keep PRO forever — undoing PR A (#114).
  const downgradeCases: Array<{ name: string; mutate: (d: any) => void }> = [
    { name: 'no items array at all', mutate: (d) => delete d.items },
    { name: 'an unrecognised price', mutate: (d) => (d.items = [{ price: { id: 'pri_who_knows' } }]) },
    { name: 'a null subscription_id', mutate: (d) => (d.subscription_id = null) },
  ];
  for (const { name, mutate } of downgradeCases) {
    it(`DOWNGRADE still applies with ${name}`, async () => {
      downgrade();
      const res = mockResponse();
      const ev = subscriptionEvent('subscription.canceled', { status: 'canceled' });
      mutate(ev.data as any);

      await WebhookController.handlePaddle(signedRequest(ev), res);

      expect(applyEntitlementChange).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'PADDLE', status: 'INACTIVE' })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  }

  // ── The claim-release is itself allowed to fail, and that must be LOUD ──────
  //
  // Releasing the claim is the only thing that lets Paddle's retry work. If the
  // release ALSO fails, the claim stays: the retry hits P2002, is answered 200
  // "duplicate", and Paddle stops — having written nothing. Paddle's
  // replay-a-notification dies to the same P2002, so the manual recovery path
  // goes with the automatic one. The delete is most likely to fail exactly when
  // the DB is broken, which is the most likely reason processing threw at all,
  // so this is a correlated failure, not an independent one.
  //
  // We cannot repair it from inside the request. The requirement is only that it
  // can never be SILENT — this used to be `.catch(() => {})`.
  it('ALERTS (never swallows) when the claim-release itself fails, naming the stuck row', async () => {
    (applyEntitlementChange as any).mockRejectedValue(new Error('db down'));
    (prisma.webhookEvent.delete as any).mockRejectedValue(new Error('connection terminated'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }, 'evt_stuck_claim')),
      res
    );

    // The stuck row is named in the log, or nobody can clear it by hand.
    const logged = (console.error as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toContain('[Webhook][ALERT]');
    expect(logged).toContain('Idempotency claim STUCK');
    expect(logged).toContain('paddle:evt_stuck_claim');

    // And pushed to Discord with the id as a discrete field — a Railway log line
    // nobody reads is exactly the failure mode the alert sink exists to fix.
    expect(sendDiscordAlert).toHaveBeenCalledWith(
      expect.stringContaining('Idempotency claim STUCK'),
      expect.objectContaining({
        webhook_event_key: 'paddle:evt_stuck_claim',
        event_id: 'evt_stuck_claim',
        event: 'transaction.completed',
      })
    );

    // Unchanged behaviour: still 500, so Paddle still retries. The release
    // failure must not swallow, mask, or replace the original processing error.
    expect(res.status).toHaveBeenCalledWith(500);
    const outerLog = (console.error as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(outerLog).toContain('db down');
  });

  it('does NOT alert about a stuck claim when the release succeeds', async () => {
    // Guards against the alert firing on every processing failure, which would
    // train the channel to be ignored. Only a FAILED release is noteworthy.
    (applyEntitlementChange as any).mockRejectedValue(new Error('db down'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }, 'evt_clean_release')),
      res
    );

    const logged = (console.error as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).not.toContain('Idempotency claim STUCK');
    expect(sendDiscordAlert).not.toHaveBeenCalledWith(
      expect.stringContaining('Idempotency claim STUCK'),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ── Discord alert sink wiring ──────────────────────────────────────────────
  // The sink is fired ALONGSIDE the existing console.* on the four founder-
  // actionable failure paths. It must never alter control flow or HTTP status,
  // and a failing sink must never change the webhook response.

  it('fires a Discord alert (alongside the console ALERT) on the unresolved-user ACTIVE path, still 200', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    // Existing log record intact.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    // New push alert fired with actionable, non-secret context.
    expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
    const [message] = (sendDiscordAlert as any).mock.calls[0];
    expect(String(message)).toMatch(/FREE|PRO/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fires a Discord alert on the unresolved-user INACTIVE (downgrade-not-applied) path, still 200', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.canceled', { status: 'canceled' })),
      res
    );

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fires a Discord alert on the refund (adjustment.created) path, still 200', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ status: 'pending_approval' })),
      res
    );

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
    const [message, context] = (sendDiscordAlert as any).mock.calls[0];
    // Actionable refund identifiers carried through to the alert.
    const blob = `${message} ${JSON.stringify(context ?? {})}`;
    expect(blob).toMatch(/adj_1/);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fires a Discord alert on the processing-failure / 500 path, still 500', async () => {
    (applyEntitlementChange as any).mockRejectedValue(new Error('db down'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(console.error).toHaveBeenCalled();
    expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does NOT fire a Discord alert on the happy upgrade path', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );
    expect(sendDiscordAlert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a failing Discord alert does NOT change the webhook HTTP response (200 stays 200)', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    (sendDiscordAlert as any).mockRejectedValue(new Error('discord down'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a failing Discord alert does NOT change the webhook HTTP response (500 stays 500)', async () => {
    (applyEntitlementChange as any).mockRejectedValue(new Error('db down'));
    (sendDiscordAlert as any).mockRejectedValue(new Error('discord down'));
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ── NEGATIVE CONTROL: no personal data may reach Discord (item #3 Half B, B1)
  //
  // Discord is a THIRD PARTY. Until B1 these two alerts sent
  // `ref="userId <uuid>, email <address>"`, so a paying customer's email left our
  // boundary into a channel with no retention control and no way to age out.
  //
  // Every case below feeds an event that DOES carry an email (`data.customer.email`
  // — the real fallback-identity shape, exercised at :183) down a path where
  // resolution fails, which is precisely when the alerts fire. If anyone
  // reintroduces the address — directly, or by putting `ref` back in the context —
  // these fail.
  //
  // Scope note: these assert on what is handed to sendDiscordAlert ONLY. The
  // controller still logs the email to stdout at webhookController.ts:118; that is
  // a first-party log line and is PR B3's job, deliberately not B1's.
  const PAYER_EMAIL = 'payer@example.com';

  /** Everything the alert would transmit, flattened the way discordAlert.ts does. */
  function discordPayload(): string {
    expect(sendDiscordAlert).toHaveBeenCalledTimes(1);
    const [message, context] = (sendDiscordAlert as any).mock.calls[0];
    return `${message} ${JSON.stringify(context ?? {})}`;
  }

  it('ACTIVE path: the Discord payload carries NO email — not the address, not an @ at all', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ customer: { email: PAYER_EMAIL } })),
      res
    );

    // Sanity: the email really was present on the event, so this is not vacuous.
    expect(resolveBillingOrg).toHaveBeenCalledWith(null, PAYER_EMAIL);

    const payload = discordPayload();
    expect(payload).not.toContain(PAYER_EMAIL);
    expect(payload).not.toContain('payer');
    // Nothing email-SHAPED either, so a future partial/masked address also fails.
    expect(payload).not.toMatch(/@/);
    expect(payload).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    // And the old blob key is gone, not merely emptied.
    expect(JSON.parse(payload.slice(payload.indexOf('{')))).not.toHaveProperty('ref');
  });

  it('INACTIVE path: the Discord payload carries NO email', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(
        subscriptionEvent('subscription.canceled', {
          status: 'canceled',
          customer: { email: PAYER_EMAIL },
        })
      ),
      res
    );

    expect(resolveBillingOrg).toHaveBeenCalledWith(USER_ID, PAYER_EMAIL);
    const payload = discordPayload();
    expect(payload).not.toContain(PAYER_EMAIL);
    expect(payload).not.toMatch(/@/);
  });

  // The other half of the swap. A BARE deletion would leave these two alerts with
  // no Paddle identifier at all (they carried none before B1), degrading support
  // to "search Paddle by event id" — which is exactly the pressure that would get
  // the email put back. These pin that the replacement handles are really there.
  it('ACTIVE path: the alert still identifies the customer — Paddle customer + object ids', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ customer: { email: PAYER_EMAIL } })),
      res
    );

    const [, context] = (sendDiscordAlert as any).mock.calls[0];
    // ctm_1 resolves to the full customer record inside Paddle.
    expect(context).toMatchObject({
      event: 'transaction.completed',
      customer_id: 'ctm_1',
      // `subscription_id || id`. This previously expected 'txn_1' only because the
      // fixture omitted subscription_id, which no real Paddle subscription
      // transaction does. With a realistic payload it resolves to the SUBSCRIPTION
      // — which is the better support handle anyway: it names the object the
      // entitlement write actually targets, not one invoice against it.
      paddle_id: 'sub_1',
      event_id: 'evt_test_1',
    });
  });

  it('INACTIVE path: paddle_id resolves to the SUBSCRIPTION id for subscription.* events', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.canceled', { status: 'canceled', customer_id: 'ctm_9' })),
      res
    );

    const [, context] = (sendDiscordAlert as any).mock.calls[0];
    expect(context).toMatchObject({
      customer_id: 'ctm_9',
      paddle_id: 'sub_1', // subscription.* -> data.id is the sub
      user_id: USER_ID,
    });
  });

  // The incidental first-party win: `ref` is shared with the [Webhook][ALERT]
  // stdout lines, so redefining it at the single definition site cleaned those up
  // too. Pinned here so the stdout half cannot silently regress either.
  //
  // Deliberately scoped to the [Webhook][ALERT] warn lines. The separate
  // `[Webhook] Received …` console.log at webhookController.ts:118 still contains
  // the email and is PR B3's scope — asserting "no email in any console output"
  // here would fail, and papering over that with a broader mock would be dishonest
  // about what B1 actually fixed.
  it('the [Webhook][ALERT] stdout line no longer carries the email either', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ customer: { email: PAYER_EMAIL } })),
      res
    );

    const alertLines = (console.warn as any).mock.calls
      .map((c: any[]) => c.join(' '))
      .filter((line: string) => line.includes('[Webhook][ALERT]'));

    expect(alertLines.length).toBeGreaterThan(0);
    const blob = alertLines.join('\n');
    expect(blob).not.toContain(PAYER_EMAIL);
    expect(blob).not.toMatch(/@/);
    // Replaced by the Paddle handle, so the line stays actionable.
    expect(blob).toContain('paddleCustomer ctm_1');
  });

  // Paddle omits customer_id on some manual/imported events. The alert must still
  // fire and still be well-formed rather than throwing or going quiet.
  it('degrades safely to "none" when the event carries no customer_id', async () => {
    (resolveBillingOrg as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(subscriptionEvent('subscription.canceled', { status: 'canceled' })),
      res
    );

    const [, context] = (sendDiscordAlert as any).mock.calls[0];
    expect(context.customer_id).toBe('none');
    expect(context.paddle_id).toBe('sub_1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
