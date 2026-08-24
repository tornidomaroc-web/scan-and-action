import { describe, it, expect } from 'vitest';
import type { Event } from '@sentry/node';
import { scrubEvent, beforeSend, scrubString, formatErrorForLog } from './redaction';

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

// ============================================================================
// formatErrorForLog — the stdout projection. Until now: ZERO tests.
// ============================================================================
// This is the function that reads `code` and `meta` OFF THE ERROR OBJECT, which
// is the only place a Prisma known error carries them. `err.stack` is
// `name: message` plus frames and carries neither, so when the message is empty
// the stack says nothing at all — the production shape on 2026-08-24, where
// every failing record read `PrismaClientKnownRequestError:` and stopped.
//
// The tests below are written against the two shapes that incident could
// actually take, not against the happy path: an empty message WITH meta (the
// fix answers), and an empty message WITHOUT meta (the fix does NOT answer, and
// that limit is asserted here rather than discovered in production).

/** The exact object shape Prisma 6.19.2 throws for a unique-constraint failure. */
const prismaKnownError = (message: string, meta?: unknown) => {
  const e: any = new Error(message);
  e.name = 'PrismaClientKnownRequestError';
  e.code = 'P2002';
  e.clientVersion = '6.19.2';
  if (meta !== undefined) e.meta = meta;
  return e;
};

describe('formatErrorForLog — the incident shape', () => {
  it('prints code AND the colliding constraint when the message is EMPTY', () => {
    const out = formatErrorForLog(prismaKnownError('', { modelName: 'User', target: ['email'] }));
    expect(out).toContain('code=P2002');
    expect(out).toContain('meta.modelName=User');
    expect(out).toContain('meta.target=email');
    // The whole point: nothing was learned from the message, everything from the object.
    expect(out).not.toContain('message=');
  });

  it('prints the same for a WHITESPACE-ONLY message — the shape actually observed', () => {
    // Prisma emitted `message === "\n"`, which is why the log row ended at the
    // colon. A bare `message=\n` would split this record in two at ingestion.
    const out = formatErrorForLog(prismaKnownError('\n', { modelName: 'User', target: ['email'] }));
    expect(out).toContain('code=P2002');
    expect(out).toContain('meta.target=email');
    expect(out).not.toContain('message=');
    expect(out).not.toContain('\n');
  });

  it('is ALWAYS one line, whatever the message contains', () => {
    const multiline = prismaKnownError(
      '\nInvalid `prisma.user.upsert()` invocation in\n/app/dist/middleware/authMiddleware.js:41:30\n\nUnique constraint failed on the fields: (`email`)',
      { modelName: 'User', target: ['email'] }
    );
    const out = formatErrorForLog(multiline);
    expect(out.split('\n')).toHaveLength(1);
    // Both halves survive on that one line: the constraint text AND the projection.
    expect(out).toContain('Unique constraint failed on the fields');
    expect(out).toContain('meta.target=email');
  });

  it('LIMIT: an empty message with NO meta yields the code and nothing more', () => {
    // Not a passing detail — a documented ceiling. If the real error arrives in
    // this shape, this PR narrows the answer to "P2002 somewhere in ensureUser"
    // and CANNOT name the constraint. Anyone reading the next incident log needs
    // to know that before concluding the instrument failed again.
    const out = formatErrorForLog(prismaKnownError(''));
    expect(out).toBe('name=PrismaClientKnownRequestError code=P2002');
    expect(out).not.toContain('meta.');
  });
});

describe('formatErrorForLog — the meta bound (value, not code list)', () => {
  it('scrubs a meta value that turns out to be a VALUE, not an identifier', () => {
    // `meta` is typed Record<string, unknown> and the Prisma client never
    // inspects it, so we cannot prove from the installed package that `target`
    // only ever holds schema identifiers. The bound does not depend on that.
    const out = formatErrorForLog(prismaKnownError('', { target: ['user@example.com'] }));
    expect(out).toContain('meta.target=[redacted-email]');
    expect(out).not.toContain('user@example.com');
  });

  it('drops a meta value that is not a string or string[]', () => {
    for (const bad of [{ nested: 'x' }, [['a']], 42, [1, 2], null, [{ a: 1 }]]) {
      const out = formatErrorForLog(prismaKnownError('', { target: bad }));
      expect(out).not.toContain('meta.target');
    }
  });

  it('drops a meta array longer than the item cap rather than printing it', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `col${i}`);
    expect(formatErrorForLog(prismaKnownError('', { target: eleven }))).not.toContain('meta.target');
    const ten = Array.from({ length: 10 }, (_, i) => `col${i}`);
    expect(formatErrorForLog(prismaKnownError('', { target: ten }))).toContain('meta.target=col0,');
  });

  it('truncates an over-long meta value instead of dumping it', () => {
    const out = formatErrorForLog(prismaKnownError('', { target: 'x'.repeat(500) }));
    expect(out).toContain('...[truncated]');
    expect(out.length).toBeLessThan(300);
  });

  it('reads ONLY the allowlisted keys — other meta keys never print', () => {
    const out = formatErrorForLog(
      prismaKnownError('', {
        modelName: 'User',
        target: ['email'],
        // P2025 puts prose here; driver-adapter errors put a whole error object
        // in `driverAdapterError`. Neither is allowlisted, so neither appears.
        cause: 'Record to delete does not exist: bob@example.com',
        driverAdapterError: { cause: { originalMessage: 'secret' } },
      })
    );
    expect(out).not.toContain('cause');
    expect(out).not.toContain('driverAdapterError');
    expect(out).not.toContain('bob@example.com');
    expect(out).not.toContain('secret');
  });

  it('ignores a meta that is not a plain object', () => {
    for (const bad of ['email', 42, ['email'], null]) {
      expect(formatErrorForLog(prismaKnownError('', bad))).not.toContain('meta.');
    }
  });
});

describe('formatErrorForLog — existing behaviour is unchanged', () => {
  it('still scrubs the message and keeps name/code/status', () => {
    const e: any = new Error('failed for user@example.com');
    e.name = 'SupabaseError';
    e.status = 500;
    const out = formatErrorForLog(e);
    expect(out).toBe('name=SupabaseError status=500 message=failed for [redacted-email]');
  });

  it('handles strings, null and undefined as before', () => {
    expect(formatErrorForLog('raw user@example.com')).toBe('raw [redacted-email]');
    expect(formatErrorForLog(null)).toBe('unknown error');
    expect(formatErrorForLog(undefined)).toBe('unknown error');
    expect(formatErrorForLog({})).toBe('unspecified error');
  });
});
