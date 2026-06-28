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
import { applyEntitlementChange } from '../src/services/entitlement/applyEntitlementChange';
import { sendDiscordAlert } from '../src/services/discordAlert';
import { WebhookController } from '../src/controllers/webhookController';

const SECRET = 'test-webhook-secret';
const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const ORG_ID = 'org-uuid-1';

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

function transactionCompleted(data: object, eventId = 'evt_test_1') {
  return {
    event_id: eventId,
    event_type: 'transaction.completed',
    data: { id: 'txn_1', status: 'completed', customer_id: 'ctm_1', ...data },
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

// A Paddle Billing adjustment.created event (how refunds arrive). On live
// accounts these often land as status 'pending_approval' before Paddle reviews.
function adjustmentCreated(data: object = {}, eventId = 'evt_adj_1') {
  return {
    event_id: eventId,
    event_type: 'adjustment.created',
    data: {
      id: 'adj_1',
      action: 'refund',
      status: 'pending_approval',
      subscription_id: 'sub_1',
      transaction_id: 'txn_1',
      customer_id: 'ctm_1',
      custom_data: { userId: USER_ID },
      ...data,
    },
  };
}

describe('WebhookController.handlePaddle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PADDLE_WEBHOOK_SECRET = SECRET;
    (prisma.webhookEvent.create as any).mockResolvedValue({});
    (prisma.webhookEvent.delete as any).mockResolvedValue({});
    // Defaults: resolution succeeds, service reports an upgrade.
    (resolveBillingOrg as any).mockResolvedValue({ organizationId: ORG_ID });
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

  it('adjustment.created (refund) → NO entitlement change, logs a tagged [ALERT] for manual review', async () => {
    const res = mockResponse();
    await WebhookController.handlePaddle(
      signedRequest(adjustmentCreated({ status: 'pending_approval' })),
      res
    );
    // v1 policy: refunds are surfaced for manual review, NOT auto-downgraded.
    expect(applyEntitlementChange).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    // Identifying context present for finding the order; no secret material.
    const logged = (console.warn as any).mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toMatch(/adj_1/);
    expect(logged).toMatch(/refund/);
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
});
