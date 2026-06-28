import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendDiscordAlert } from './discordAlert';

// Mock the global fetch so no real HTTP call is ever made.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc-secret-token';

function okResponse(status = 204) {
  return {
    ok: true,
    status,
    statusText: 'No Content',
    text: async () => '',
  } as unknown as Response;
}

function errorResponse(status = 429, body = 'rate limited') {
  return {
    ok: false,
    status,
    statusText: 'Too Many Requests',
    text: async () => body,
  } as unknown as Response;
}

describe('sendDiscordAlert', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.DISCORD_ALERT_WEBHOOK_URL = WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_ALERT_WEBHOOK_URL;
  });

  // ---- happy path ----
  it('POSTs a Discord-shaped payload to the configured webhook URL', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());

    await sendDiscordAlert('Customer paid but is still on FREE', {
      event: 'transaction.completed',
      ref: 'userId none, email none',
      event_id: 'evt_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    // Discord incoming webhooks render the `content` field.
    expect(typeof body.content).toBe('string');
    expect(body.content).toContain('Customer paid but is still on FREE');
    // Non-secret business identifiers are included so the alert is actionable.
    expect(body.content).toContain('transaction.completed');
    expect(body.content).toContain('evt_1');
    expect(body.content).toContain('userId none, email none');
  });

  it('passes an AbortSignal so a slow Discord cannot hold the request open forever', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendDiscordAlert('msg');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeDefined();
  });

  // ---- never leaks the secret webhook URL ----
  it('never includes the webhook URL or its token in the request body or any log', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendDiscordAlert('hello', { ref: 'x' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).not.toContain('abc-secret-token');
    expect(init.body).not.toContain(WEBHOOK_URL);

    const allLogs = [
      ...(console.log as any).mock.calls,
      ...(console.warn as any).mock.calls,
      ...(console.error as any).mock.calls,
    ]
      .map((c: any[]) => c.join(' '))
      .join('\n');
    expect(allLogs).not.toContain('abc-secret-token');
    expect(allLogs).not.toContain(WEBHOOK_URL);
  });

  // ---- fail-safe: unset env ----
  it('does nothing and does NOT throw when DISCORD_ALERT_WEBHOOK_URL is unset', async () => {
    delete process.env.DISCORD_ALERT_WEBHOOK_URL;

    await expect(sendDiscordAlert('msg', { ref: 'x' })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a blank/whitespace webhook URL as unset (no fetch, no throw)', async () => {
    process.env.DISCORD_ALERT_WEBHOOK_URL = '   ';
    await expect(sendDiscordAlert('msg')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- fail-safe: transport failures ----
  it('swallows a fetch rejection (network/timeout) without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendDiscordAlert('msg', { ref: 'x' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('swallows a non-2xx Discord response without throwing', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(429, 'rate limited'));
    await expect(sendDiscordAlert('msg', { ref: 'x' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('swallows an AbortError (timeout) without throwing', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abort);
    await expect(sendDiscordAlert('msg')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  // ---- works without context ----
  it('sends with no context object', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendDiscordAlert('bare message');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).content).toContain('bare message');
  });
});
