import { describe, it, expect } from 'vitest';
import type { Event } from '@sentry/node';
import { scrubEvent, beforeSend, scrubString } from './redaction';

describe('scrubString backstop', () => {
  it('redacts emails', () => {
    expect(scrubString('contact me@example.com now')).toBe('contact [redacted-email] now');
  });

  it('redacts JWT-shaped tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abc-DEF_123';
    expect(scrubString(`token=${jwt}`)).toBe('token=[redacted-token]');
  });

  it('redacts Bearer tokens', () => {
    expect(scrubString('Authorization: Bearer abc.def.ghi')).toContain('Bearer [redacted-token]');
  });
});

describe('scrubEvent — structural PII stripping', () => {
  it('scrubs an email embedded in the exception value (Prisma P2002 style)', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'PrismaClientKnownRequestError',
            value:
              'Unique constraint failed on the fields: (`email`) value user@example.com',
          },
        ],
      },
    };
    const out = scrubEvent(event);
    const value = out.exception!.values![0].value!;
    expect(value).not.toContain('user@example.com');
    expect(value).toContain('[redacted-email]');
  });

  it('drops local variables from stack frames', () => {
    const event: Event = {
      exception: {
        values: [
          {
            value: 'boom',
            stacktrace: { frames: [{ filename: 'x.ts', vars: { email: 'user@example.com' } }] },
          },
        ],
      },
    };
    const out = scrubEvent(event);
    expect(out.exception!.values![0].stacktrace!.frames![0].vars).toBeUndefined();
  });

  it('scrubs source context lines attached to a stack frame (ContextLines vector)', () => {
    const event: Event = {
      exception: {
        values: [
          {
            value: 'boom',
            stacktrace: {
              frames: [
                {
                  filename: 'x.ts',
                  context_line: "throw new Error('mail user@example.com')",
                  pre_context: ['const to = "admin@example.com";'],
                  post_context: ['// Bearer eyJa.bbb.ccc'],
                },
              ],
            },
          },
        ],
      },
    };
    const frame = scrubEvent(event).exception!.values![0].stacktrace!.frames![0];
    expect(frame.context_line).not.toContain('user@example.com');
    expect(frame.context_line).toContain('[redacted-email]');
    expect(frame.pre_context![0]).not.toContain('admin@example.com');
    expect(frame.post_context![0]).toContain('[redacted-token]');
  });

  it('strips the request body', () => {
    const event: Event = { request: { data: { confirm: 'user@example.com', secret: 1 } } };
    const out = scrubEvent(event);
    expect(out.request!.data).toBe('[redacted]');
  });

  it('removes Authorization and Cookie headers case-insensitively', () => {
    const event: Event = {
      request: {
        headers: {
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
          cookie: 'session=abc',
          'Content-Type': 'application/json',
        },
      },
    };
    const out = scrubEvent(event);
    const headers = out.request!.headers!;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    // Non-sensitive headers are preserved.
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('redacts the query string and strips URL query params', () => {
    const event: Event = {
      request: { query_string: 'email=user@example.com', url: 'https://api/x?email=user@example.com' },
    };
    const out = scrubEvent(event);
    expect(out.request!.query_string).toBe('[redacted]');
    expect(out.request!.url).toBe('https://api/x');
  });

  it('removes user email / username / ip but keeps the pseudonymous id', () => {
    const event: Event = {
      user: { id: 'uuid-123', email: 'user@example.com', username: 'user', ip_address: '1.2.3.4' },
    };
    const out = scrubEvent(event);
    expect(out.user!.id).toBe('uuid-123');
    expect((out.user as Record<string, unknown>).email).toBeUndefined();
    expect((out.user as Record<string, unknown>).username).toBeUndefined();
    expect((out.user as Record<string, unknown>).ip_address).toBeUndefined();
  });

  it('drops breadcrumb data payloads and scrubs breadcrumb messages', () => {
    const event: Event = {
      breadcrumbs: [
        { message: 'sent to user@example.com', data: { url: 'https://api?token=eyJa.b.c' } },
      ],
    };
    const out = scrubEvent(event);
    expect(out.breadcrumbs![0].data).toBeUndefined();
    expect(out.breadcrumbs![0].message).toBe('sent to [redacted-email]');
  });

  it('scrubs free-text string values in extra', () => {
    const event: Event = { extra: { note: 'reach me@example.com', count: 5 } };
    const out = scrubEvent(event);
    expect(out.extra!.note).toBe('reach [redacted-email]');
    expect(out.extra!.count).toBe(5);
  });
});

describe('beforeSend — fail-closed', () => {
  it('returns the scrubbed event on success', () => {
    const event: Event = { message: 'hi user@example.com' };
    const out = beforeSend(event);
    expect(out).not.toBeNull();
    expect(out!.message).toBe('hi [redacted-email]');
  });

  it('drops the event (returns null) if scrubbing throws on hostile input', () => {
    // A getter that throws when scrubEvent touches event.request.
    const hostile = {} as Event;
    Object.defineProperty(hostile, 'request', {
      get() {
        throw new Error('boom');
      },
    });
    expect(beforeSend(hostile)).toBeNull();
  });
});
