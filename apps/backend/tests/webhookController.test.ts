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

import { prisma } from '../src/prismaClient';
import { resolveBillingOrg } from '../src/services/entitlement/resolveBillingOrg';
import { applyEntitlementChange } from '../src/services/entitlement/applyEntitlementChange';
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('downgrades (PADDLE INACTIVE) on subscription.expired matched via custom_data.userId', async () => {
    (applyEntitlementChange as any).mockResolvedValue({
      previousPlan: 'PRO',
      newPlan: 'FREE',
      applied: true,
    });
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest({
        event_id: 'evt_test_exp',
        event_type: 'subscription.expired',
        data: { id: 'sub_1', status: 'expired', custom_data: { userId: USER_ID } },
      }),
      res
    );

    expect(applyEntitlementChange).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, source: 'PADDLE', status: 'INACTIVE' })
    );
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
});
