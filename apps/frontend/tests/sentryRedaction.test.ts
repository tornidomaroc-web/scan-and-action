import { describe, it, expect } from 'vitest';
import type { Event } from '@sentry/react';
import { scrubEvent, scrubString, beforeSend } from '../src/redaction';

// ============================================================================
// FRONTEND SENTRY REDACTION — the proof that PII is stripped BEFORE send.
// ============================================================================
// These are pure-function tests on the value beforeSend returns. Nothing is
// initialised, no DSN is read, no network is touched: the assertion is on the
// returned event object itself, which is exactly what the SDK would transmit.
//
// The browser twin of apps/backend/src/redaction.test.ts. The structural levers
// (console breadcrumbs off, session envelopes off) are asserted in
// sentryInit.test.ts; this file covers the beforeSend half.
// ============================================================================

const EMAIL = 'victim@example.com';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('scrubString — free-text backstop', () => {
  it('redacts emails, JWTs and Bearer tokens', () => {
    expect(scrubString(`mail ${EMAIL} now`)).toBe('mail [redacted-email] now');
    expect(scrubString(`token ${JWT}`)).toBe('token [redacted-token]');
    expect(scrubString(`Authorization: Bearer ${JWT}`)).not.toContain(JWT);
  });

  it('leaves ordinary text untouched', () => {
    expect(scrubString('TypeError: x is not a function')).toBe('TypeError: x is not a function');
  });
});

describe('scrubEvent — exception message and stack', () => {
  it('strips an email embedded in the exception value', () => {
    const event = scrubEvent({
      exception: {
        values: [{ type: 'Error', value: `Failed to load profile for ${EMAIL}` }],
      },
    } as Event);

    const raw = JSON.stringify(event);
    expect(raw).not.toContain(EMAIL);
    expect(event.exception!.values![0].value).toContain('[redacted-email]');
  });

  it('drops stack frame local variables and scrubs source context lines', () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: {
              frames: [
                {
                  filename: 'app.tsx',
                  vars: { email: EMAIL, token: JWT },
                  context_line: `const user = '${EMAIL}'`,
                  pre_context: [`// owner ${EMAIL}`],
                  post_context: [`send(${JWT})`],
                },
              ],
            },
          },
        ],
      },
    } as Event);

    const frame = event.exception!.values![0].stacktrace!.frames![0];
    expect(frame.vars).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain(EMAIL);
    expect(JSON.stringify(event)).not.toContain(JWT);
  });

  it('scrubs the top-level message', () => {
    const event = scrubEvent({ message: `hello ${EMAIL}` } as Event);
    expect(event.message).toBe('hello [redacted-email]');
  });
});

describe('scrubEvent — request', () => {
  it('removes the Authorization header regardless of casing (bearer JWT = session hijack)', () => {
    const event = scrubEvent({
      request: {
        headers: {
          Authorization: `Bearer ${JWT}`,
          authorization: `Bearer ${JWT}`,
          Cookie: 'sb-access-token=abc',
          Referer: 'https://app.example.com/search?q=carrefour',
          'User-Agent': 'Mozilla/5.0',
        },
      },
    } as unknown as Event);

    const headers = event.request!.headers as Record<string, unknown>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();
    expect(headers.Referer).toBeUndefined();
    // Non-sensitive headers survive — this is a strip, not a wipe.
    expect(headers['User-Agent']).toBe('Mozilla/5.0');
    expect(JSON.stringify(event)).not.toContain(JWT);
  });

  it('strips the request body, cookies and query string', () => {
    const event = scrubEvent({
      request: {
        data: { email: EMAIL, merchant: 'Carrefour', total: '412.50' },
        cookies: { session: 'abc' },
        query_string: `q=${EMAIL}`,
      },
    } as unknown as Event);

    expect(event.request!.data).toBe('[redacted]');
    expect(event.request!.cookies).toBeUndefined();
    expect(event.request!.query_string).toBe('[redacted]');
    const raw = JSON.stringify(event);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('Carrefour');
  });

  it('drops the query string AND the hash from the page URL', () => {
    const event = scrubEvent({
      request: { url: 'https://app.example.com/search?q=facture%20carrefour#token=abc' },
    } as Event);
    expect(event.request!.url).toBe('https://app.example.com/search');
  });
});

describe('scrubEvent — user identity', () => {
  it('deletes email, username and ip_address but keeps the pseudonymous id', () => {
    const event = scrubEvent({
      user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: EMAIL, username: 'victim', ip_address: '1.2.3.4' },
    } as Event);

    expect(event.user!.id).toBe('7f1e2d3c-4b5a-4678-9abc-def012345678');
    expect(event.user!.email).toBeUndefined();
    expect(event.user!.username).toBeUndefined();
    expect(event.user!.ip_address).toBeUndefined();
  });
});

describe('scrubEvent — breadcrumbs', () => {
  // The recon's worst sites (merchant name / total / raw query text) are
  // console.* lines. Console breadcrumbs are OFF at the source; this is the
  // defense-in-depth layer for the breadcrumb types we keep (fetch/xhr/dom).
  it('drops breadcrumb data payloads and scrubs breadcrumb messages', () => {
    const event = scrubEvent({
      breadcrumbs: [
        {
          category: 'fetch',
          data: { url: `https://api.example.com/search?q=${EMAIL}`, body: { merchant: 'Carrefour' } },
        },
        { category: 'console', message: `Sending magic link to ${EMAIL}` },
      ],
    } as Event);

    expect(event.breadcrumbs![0].data).toBeUndefined();
    expect(event.breadcrumbs![1].message).toBe('Sending magic link to [redacted-email]');
    const raw = JSON.stringify(event);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('Carrefour');
  });
});

describe('scrubEvent — extra', () => {
  it('scrubs free-text string values in extra', () => {
    const event = scrubEvent({ extra: { note: `owner ${EMAIL}`, count: 3 } } as unknown as Event);
    expect(event.extra!.note).toBe('owner [redacted-email]');
    expect(event.extra!.count).toBe(3);
  });
});

describe('beforeSend — fail-closed', () => {
  it('returns the scrubbed event on the happy path', () => {
    const out = beforeSend({ message: `hi ${EMAIL}` } as Event);
    expect(out).not.toBeNull();
    expect(out!.message).toBe('hi [redacted-email]');
  });

  it('DROPS the event (returns null) if scrubbing throws on hostile input', () => {
    // A getter that throws when scrubEvent touches event.request. A scrubber bug
    // must never degrade into "send it un-redacted".
    const hostile = {
      message: `hi ${EMAIL}`,
      get request(): never {
        throw new Error('boom');
      },
    } as unknown as Event;

    expect(beforeSend(hostile)).toBeNull();
  });
});
