import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTransactionalEmail } from './mailer';

// Mock the global fetch so no real HTTP call is ever made.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const VALID = {
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<p>Hello</p>',
};

function okResponse(id = 'resend-id-123') {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ id }),
    text: async () => JSON.stringify({ id }),
  } as unknown as Response;
}

function errorResponse(status = 422, body = 'Invalid from address') {
  return {
    ok: false,
    status,
    statusText: 'Unprocessable Entity',
    json: async () => ({ message: body }),
    text: async () => body,
  } as unknown as Response;
}

describe('sendTransactionalEmail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.RESEND_API_KEY = 'test_key';
    process.env.MAIL_FROM = 'Scan & Action <noreply@send.scan-action.com>';
    delete process.env.MAIL_UNSUBSCRIBE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_UNSUBSCRIBE_URL;
  });

  // ---- success path ----
  it('sends via Resend and returns sent with the message id', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('abc-123'));

    const result = await sendTransactionalEmail(VALID);

    expect(result).toEqual({ status: 'sent', id: 'abc-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test_key');

    const body = JSON.parse(init.body);
    expect(body.from).toBe('Scan & Action <noreply@send.scan-action.com>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Welcome');
    // Compliance: footer with postal address + unsubscribe is appended.
    expect(body.html).toContain('<p>Hello</p>');
    expect(body.html).toContain('unsubscribe');
    expect(body.headers['List-Unsubscribe']).toContain('mailto:unsubscribe@send.scan-action.com');
    // Without MAIL_UNSUBSCRIBE_URL, no one-click header is advertised.
    expect(body.headers['List-Unsubscribe-Post']).toBeUndefined();
  });

  it('advertises RFC 8058 one-click when MAIL_UNSUBSCRIBE_URL is set', async () => {
    process.env.MAIL_UNSUBSCRIBE_URL = 'https://scan-action.com/unsubscribe?t=1';
    fetchMock.mockResolvedValueOnce(okResponse());

    await sendTransactionalEmail(VALID);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.headers['List-Unsubscribe']).toContain('<https://scan-action.com/unsubscribe?t=1>');
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('includes the text alternative when provided', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendTransactionalEmail({ ...VALID, text: 'Hello plain' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe('Hello plain');
  });

  // ---- missing-key skip path ----
  it('returns skipped (does not throw, does not call fetch) when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendTransactionalEmail(VALID);

    expect(result).toEqual({
      status: 'skipped',
      reason: 'RESEND_API_KEY not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an empty/whitespace RESEND_API_KEY as missing', async () => {
    process.env.RESEND_API_KEY = '   ';
    const result = await sendTransactionalEmail(VALID);
    expect(result.status).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- HTTP-error failure path ----
  it('returns failed (does not throw) on a non-2xx Resend response', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(422, 'bad request'));

    const result = await sendTransactionalEmail(VALID);

    expect(result).toEqual({ status: 'failed', error: 'Resend HTTP 422' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns failed (does not throw) when fetch itself rejects (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await sendTransactionalEmail(VALID);

    expect(result).toEqual({ status: 'failed', error: 'ECONNRESET' });
  });

  // ---- input validation / injection guards ----
  it('rejects header injection in the recipient without calling fetch', async () => {
    const result = await sendTransactionalEmail({
      ...VALID,
      to: 'user@example.com\r\nBcc: victim@evil.com',
    });
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a newline-injected subject without calling fetch', async () => {
    const result = await sendTransactionalEmail({
      ...VALID,
      subject: 'Hi\r\nList-Unsubscribe: <mailto:spoof@evil.com>',
    });
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed recipient address', async () => {
    const result = await sendTransactionalEmail({ ...VALID, to: 'not-an-email' });
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
