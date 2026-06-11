import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../src/prismaClient', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organization: { update: vi.fn() },
    webhookEvent: { create: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from '../src/prismaClient';
import { WebhookController } from '../src/controllers/webhookController';

const SECRET = 'test-webhook-secret';
const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const ORG_ID = 'org-uuid-1';

const userWithMembership = {
  id: USER_ID,
  email: 'buyer@example.com',
  memberships: [{ organizationId: ORG_ID }],
};

// Builds a correctly signed request the way Paddle does: h1 = HMAC-SHA256
// over `${ts}:${rawBody}` — so these tests also exercise the Phase 0
// signature path end to end.
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrades the org when custom_data.userId matches a user (no email in payload, like real Paddle Billing events)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(userWithMembership);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { plan: 'PRO' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies no change and logs an ALERT when userId matches no user and there is no email', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } })),
      res
    );

    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('applies no change and logs an ALERT when custom_data is missing entirely', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(signedRequest(transactionCompleted({})), res);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Webhook][ALERT]'));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not throw on malformed userId (non-UUID, wrong type) — logs and fails safe', async () => {
    for (const bad of [12345, 'not-a-uuid', { nested: true }, null]) {
      vi.clearAllMocks();
      (prisma.webhookEvent.create as any).mockResolvedValue({});
      const res = mockResponse();

      await WebhookController.handlePaddle(
        signedRequest(transactionCompleted({ custom_data: { userId: bad } })),
        res
      );

      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('falls back to email matching when custom_data is absent but the payload carries an email', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(userWithMembership);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ customer: { email: 'buyer@example.com' } })),
      res
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'buyer@example.com' } })
    );
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { plan: 'PRO' },
    });
  });

  it('downgrades to FREE on subscription.expired matched via custom_data.userId', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(userWithMembership);
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest({
        event_id: 'evt_test_exp',
        event_type: 'subscription.expired',
        data: { id: 'sub_1', status: 'expired', custom_data: { userId: USER_ID } },
      }),
      res
    );

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { plan: 'FREE' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Phase 0 regression guards: signature and idempotency behavior unchanged.

  it('rejects a bad signature with 401 and never touches the database', async () => {
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }), {
        signature: 'ab'.repeat(32),
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
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
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it('releases the idempotency claim when processing fails, so Paddle retries are not lost', async () => {
    (prisma.user.findUnique as any).mockRejectedValue(new Error('db down'));
    (prisma.webhookEvent.delete as any).mockResolvedValue({});
    const res = mockResponse();

    await WebhookController.handlePaddle(
      signedRequest(transactionCompleted({ custom_data: { userId: USER_ID } }, 'evt_release_me')),
      res
    );

    expect(prisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt_release_me' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
