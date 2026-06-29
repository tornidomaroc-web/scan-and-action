import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the singleton Prisma client (only the user.updateMany used by the claim).
vi.mock('../../prismaClient', () => ({
  prisma: { user: { updateMany: vi.fn() } },
}));

// Mock the fail-safe mailer so no real HTTP call is ever made.
vi.mock('./mailer', () => ({
  sendTransactionalEmail: vi.fn(),
}));

import { prisma } from '../../prismaClient';
import { sendTransactionalEmail } from './mailer';
import { sendWelcomeEmailOnce, isWelcomeEmailEnabled } from './welcomeEmail';

const updateMany = prisma.user.updateMany as unknown as ReturnType<typeof vi.fn>;
const sendMock = sendTransactionalEmail as unknown as ReturnType<typeof vi.fn>;

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const EMAIL = 'new.user@example.com';

// Let the fire-and-forget send's .then/.catch microtasks settle.
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendMock.mockResolvedValue({ status: 'sent', id: 'resend-id' });
  // Default-off kill switch: the claim/send tests below exercise the ENABLED
  // behaviour, so opt in explicitly. The disabled path has its own describe.
  process.env.WELCOME_EMAIL_ENABLED = 'true';
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WELCOME_EMAIL_ENABLED;
});

describe('sendWelcomeEmailOnce — atomic claim', () => {
  it('sends exactly once when the claim affects 1 row (winner)', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });

    await sendWelcomeEmailOnce(USER_ID, EMAIL);
    await flush();

    // Claim uses the null-guarded conditional update.
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: expect.any(Date) },
    });

    // Sent once, to the right person, with the login link in the body.
    expect(sendMock).toHaveBeenCalledTimes(1);
    const params = sendMock.mock.calls[0][0];
    expect(params.to).toBe(EMAIL);
    expect(params.subject).toBe('Thanks for joining Scan & Action');
    expect(params.html).toContain('https://www.scan-action.com/login');
    expect(params.text).toContain('https://www.scan-action.com/login');
  });

  it('does NOT send when the claim affects 0 rows (race loser / already sent)', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });

    await sendWelcomeEmailOnce(USER_ID, EMAIL);
    await flush();

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends only once across two concurrent callers (one wins the claim)', async () => {
    // Simulate the provisioning race: first call wins (1), second loses (0).
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await Promise.all([
      sendWelcomeEmailOnce(USER_ID, EMAIL),
      sendWelcomeEmailOnce(USER_ID, EMAIL),
    ]);
    await flush();

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendWelcomeEmailOnce — humanized welcome copy', () => {
  // Capture the params handed to the mailer for a winning claim.
  async function sentParams() {
    updateMany.mockResolvedValueOnce({ count: 1 });
    await sendWelcomeEmailOnce(USER_ID, EMAIL);
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
    return sendMock.mock.calls[0][0] as { subject: string; html: string; text: string };
  }

  it('contains ZERO em dashes in subject, html, and text', async () => {
    const p = await sentParams();
    expect(p.subject).not.toContain('—'); // —
    expect(p.html).not.toContain('—');
    expect(p.text).not.toContain('—');
  });

  it('drops the AI-flavored "structured, searchable data" phrasing', async () => {
    const p = await sentParams();
    expect(p.html.toLowerCase()).not.toContain('structured, searchable data');
    expect(p.text.toLowerCase()).not.toContain('structured, searchable data');
  });

  it('contains NO payment / subscription / upgrade steering (silent-app safe)', async () => {
    const p = await sentParams();
    const steering = /\b(upgrade|subscribe|subscription|pricing|price|\bpro\b|payment|pay\b|billing|checkout|plan)\b|\$/i;
    expect(p.html).not.toMatch(steering);
    expect(p.text).not.toMatch(steering);
  });

  it('keeps the Open Scan & Action action and the login URL in both bodies', async () => {
    const p = await sentParams();
    expect(p.html).toContain('Open Scan &amp; Action');
    expect(p.html).toContain('https://www.scan-action.com/login');
    expect(p.text).toContain('Open Scan & Action');
    expect(p.text).toContain('https://www.scan-action.com/login');
  });

  it('keeps a working reply invitation (Reply-To routes to a monitored mailbox)', async () => {
    const p = await sentParams();
    expect(p.html.toLowerCase()).toContain('reply');
    expect(p.text.toLowerCase()).toContain('reply');
  });
});

describe('sendWelcomeEmailOnce — fail-safe / non-blocking', () => {
  it('resolves without throwing when the mailer returns failed', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    sendMock.mockResolvedValueOnce({ status: 'failed', error: 'Resend HTTP 500' });

    await expect(sendWelcomeEmailOnce(USER_ID, EMAIL)).resolves.toBeUndefined();
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when the mailer returns skipped', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    sendMock.mockResolvedValueOnce({ status: 'skipped', reason: 'RESEND_API_KEY not configured' });

    await expect(sendWelcomeEmailOnce(USER_ID, EMAIL)).resolves.toBeUndefined();
  });

  it('does not throw, and does not send, when the atomic claim itself errors', async () => {
    updateMany.mockRejectedValueOnce(new Error('DB unavailable'));

    await expect(sendWelcomeEmailOnce(USER_ID, EMAIL)).resolves.toBeUndefined();
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('claim-then-send: claim is set BEFORE the send is invoked', async () => {
    const order: string[] = [];
    updateMany.mockImplementationOnce(async () => {
      order.push('claim');
      return { count: 1 };
    });
    sendMock.mockImplementationOnce(async () => {
      order.push('send');
      return { status: 'sent', id: 'x' };
    });

    await sendWelcomeEmailOnce(USER_ID, EMAIL);
    await flush();

    expect(order).toEqual(['claim', 'send']);
  });
});

describe('isWelcomeEmailEnabled — default-off kill switch', () => {
  afterEach(() => delete process.env.WELCOME_EMAIL_ENABLED);

  it('is false when unset', () => {
    delete process.env.WELCOME_EMAIL_ENABLED;
    expect(isWelcomeEmailEnabled()).toBe(false);
  });

  it("is true only for the exact string 'true' (case-insensitive, trimmed)", () => {
    for (const v of ['true', 'TRUE', 'True', '  true  ']) {
      process.env.WELCOME_EMAIL_ENABLED = v;
      expect(isWelcomeEmailEnabled()).toBe(true);
    }
  });

  it('is false for any other value', () => {
    for (const v of ['', 'false', '0', '1', 'yes', 'on', 'enabled', 'truthy']) {
      process.env.WELCOME_EMAIL_ENABLED = v;
      expect(isWelcomeEmailEnabled()).toBe(false);
    }
  });
});

describe('sendWelcomeEmailOnce — held by kill switch', () => {
  it('makes NO claim and NO send when WELCOME_EMAIL_ENABLED is unset', async () => {
    delete process.env.WELCOME_EMAIL_ENABLED;

    await expect(sendWelcomeEmailOnce(USER_ID, EMAIL)).resolves.toBeUndefined();
    await flush();

    // Critically: no DB write (claim not burned) and no send attempted.
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("makes NO claim and NO send when WELCOME_EMAIL_ENABLED is 'false'", async () => {
    process.env.WELCOME_EMAIL_ENABLED = 'false';

    await sendWelcomeEmailOnce(USER_ID, EMAIL);
    await flush();

    expect(updateMany).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
