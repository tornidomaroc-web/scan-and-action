import { describe, it, expect, afterAll } from 'vitest';
import * as Sentry from '@sentry/node';
import { buildSentryOptions, initSentry } from './instrument';
import { beforeSend } from './redaction';

describe('buildSentryOptions — config', () => {
  it('reads the DSN from env and sets quota-safe, PII-safe defaults', () => {
    const opts = buildSentryOptions({ SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1', NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(opts.dsn).toBe('https://x@o0.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.sendDefaultPii).toBe(false);
    // The redaction choke point is wired in as beforeSend.
    expect(opts.beforeSend).toBe(beforeSend);
  });

  it('disables the Console breadcrumb integration but keeps the others', () => {
    const opts = buildSentryOptions({} as NodeJS.ProcessEnv);
    expect(typeof opts.integrations).toBe('function');
    type Named = { name: string };
    const fakeDefaults: Named[] = [
      { name: 'Console' },
      { name: 'Http' },
      { name: 'OnUncaughtException' },
      { name: 'OnUnhandledRejection' },
    ];
    const filter = opts.integrations as unknown as (i: Named[]) => Named[];
    const result = filter(fakeDefaults);
    const names = result.map((i) => i.name);
    expect(names).not.toContain('Console');
    expect(names).toContain('Http');
    expect(names).toContain('OnUncaughtException');
    expect(names).toContain('OnUnhandledRejection');
  });
});

describe('initSentry — no-op when DSN unset', () => {
  it('does not initialise a client and returns false when SENTRY_DSN is absent', () => {
    // Module load already ran initSentry() with the (DSN-less) test env → no-op.
    expect(Sentry.getClient()).toBeUndefined();
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false);
    expect(Sentry.getClient()).toBeUndefined();
  });
});

describe('capture wiring (offline, stub transport)', () => {
  const sent: unknown[] = [];

  afterAll(async () => {
    await Sentry.close();
  });

  it('captures an exception and the delivered envelope is already redacted', async () => {
    Sentry.init({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      // Stub transport — nothing hits the network.
      transport: () => ({
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
      tracesSampleRate: 0,
      sendDefaultPii: false,
      integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
      beforeSend,
    });

    Sentry.captureException(new Error('reach me at leak@example.com'));
    await Sentry.flush(2000);

    // At least one envelope was delivered (the SDK may also emit a session
    // envelope, so don't assert an exact count). Scan EVERYTHING sent: the raw
    // email must appear nowhere, and the redaction marker must be present —
    // proving beforeSend ran on the real capture path, not just in isolation.
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const raw = JSON.stringify(sent);
    expect(raw).not.toContain('leak@example.com');
    expect(raw).toContain('[redacted-email]');
  });
});
