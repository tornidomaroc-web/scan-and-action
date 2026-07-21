import { describe, it, expect, afterAll } from 'vitest';
import * as Sentry from '@sentry/react';
import { buildSentryOptions, initSentry } from '../src/sentry';
import { beforeSend } from '../src/redaction';

// ============================================================================
// FRONTEND SENTRY CONFIG — the structural levers, and the DSN-unset no-op.
// ============================================================================
// Fully offline. Importing ../src/sentry already executed its module-level
// initSentry() under the test env (VITE_SENTRY_DSN unset) — the no-op describe
// asserts that produced no client at all, which is exactly the path CI and a
// DSN-less Vercel/Capacitor build take.
//
// Test ORDER is load-bearing: the no-op assertions must run before the block
// that deliberately creates a client with a dummy DSN and a stub transport.
// ============================================================================

describe('buildSentryOptions — config', () => {
  it('reads the DSN from env and sets quota-safe, PII-safe defaults', () => {
    const opts = buildSentryOptions({
      VITE_SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
      MODE: 'production',
    });

    expect(opts.dsn).toBe('https://x@o0.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    // Errors only — no tracing — on the free tier.
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.sendDefaultPii).toBe(false);
    // The redaction choke point is wired in as beforeSend — same commit as init.
    expect(opts.beforeSend).toBe(beforeSend);
  });

  it('prefers VITE_SENTRY_ENVIRONMENT over MODE when set', () => {
    const opts = buildSentryOptions({ VITE_SENTRY_ENVIRONMENT: 'preview', MODE: 'production' });
    expect(opts.environment).toBe('preview');
  });

  const applyIntegrations = () => {
    const opts = buildSentryOptions({});
    expect(typeof opts.integrations).toBe('function');
    return (opts.integrations as (i: unknown[]) => { name: string }[])(
      Sentry.getDefaultIntegrations({})
    );
  };

  // A config snapshot so a future refactor cannot silently re-enable console
  // capture: the PII-bearing console.* lines must never become Sentry data.
  // (Asserted by identity, not deep equality — integration objects hold
  // closures, so two instances never compare equal.) The behavioural proof that
  // console lines really don't become breadcrumbs is the stub-transport test
  // at the bottom of this file.
  it('REPLACES the default Breadcrumbs integration with a console-free one', () => {
    const defaults = Sentry.getDefaultIntegrations({}) as { name: string }[];
    const stockBreadcrumbs = defaults.find((i) => i.name === 'Breadcrumbs');
    expect(stockBreadcrumbs, 'the SDK default should include Breadcrumbs').toBeDefined();

    const applied = (buildSentryOptions({}).integrations as (i: unknown[]) => { name: string }[])(
      defaults
    );

    // Exactly one Breadcrumbs integration...
    expect(applied.filter((i) => i.name === 'Breadcrumbs')).toHaveLength(1);
    // ...and it is NOT the stock (console-enabled) instance...
    expect(applied).not.toContain(stockBreadcrumbs);
    // ...it is the one we appended.
    expect(applied[applied.length - 1].name).toBe('Breadcrumbs');
  });

  it('keeps the default global handlers — async / unhandled-rejection errors stay covered', () => {
    const names = applyIntegrations().map((i) => i.name);
    // We hand-write no window.onerror / onunhandledrejection: this integration
    // is what covers the errors an ErrorBoundary cannot catch.
    expect(names).toContain('GlobalHandlers');
    expect(names).toContain('LinkedErrors');
    expect(names).toContain('Dedupe');
  });

  it('drops session envelopes — nothing may leave that beforeSend never saw', () => {
    expect(applyIntegrations().map((i) => i.name)).not.toContain('BrowserSession');
  });
});

describe('initSentry — NO-OP when VITE_SENTRY_DSN is unset', () => {
  it('created no client at module import time (the CI / no-DSN path)', () => {
    // ../src/sentry ran initSentry() on import with the test env, where
    // VITE_SENTRY_DSN is unset. No client ⇒ no handlers, nothing transmittable.
    expect(Sentry.getClient()).toBeUndefined();
  });

  it('returns false and creates no client for absent / empty DSNs', () => {
    expect(initSentry({})).toBe(false);
    expect(initSentry({ VITE_SENTRY_DSN: '' })).toBe(false);
    expect(initSentry({ VITE_SENTRY_ENVIRONMENT: 'production' })).toBe(false);
    expect(Sentry.getClient()).toBeUndefined();
  });
});

describe('initSentry + capture wiring (offline, stub transport)', () => {
  const sent: unknown[] = [];

  afterAll(async () => {
    await Sentry.close();
  });

  it('initialises a client when a DSN is present', () => {
    expect(initSentry({ VITE_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' })).toBe(true);
    const client = Sentry.getClient();
    expect(client).toBeDefined();
    expect(client!.getOptions().beforeSend).toBe(beforeSend);
    expect(client!.getOptions().sendDefaultPii).toBe(false);
  });

  it('the delivered envelope is already redacted (beforeSend ran on the real path)', async () => {
    // Re-init over the top with a STUB transport so nothing hits the network.
    Sentry.init({
      ...buildSentryOptions({ VITE_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' }),
      transport: () => ({
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });

    // A console line of exactly the PII shape the recon found (merchant/total,
    // plus an email). With console breadcrumbs OFF this must NOT become an
    // attached breadcrumb on the event captured immediately after it.
    //
    // This line is deliberately NOT silenced with vi.spyOn(console,'log'):
    // spying REPLACES the console method that Sentry's console integration
    // wrapped at init, so a mocked console.log is never recorded as a breadcrumb
    // — the assertion below would pass even with console breadcrumbs enabled
    // (verified against a stock-integration negative control). The cost is one
    // noisy line in the test output; the benefit is a test that can actually
    // fail. Fake merchant/total, no real data.
    console.log('[gemini] merchant=Carrefour total=412.50 user=leak@example.com');

    Sentry.captureException(new Error('reach me at leak@example.com'));
    await Sentry.flush(2000);

    // Scan EVERYTHING sent: the raw email must appear nowhere and the redaction
    // marker must be present — proving beforeSend ran on the real capture path,
    // not just in isolation.
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const raw = JSON.stringify(sent);
    expect(raw).not.toContain('leak@example.com');
    expect(raw).toContain('[redacted-email]');
    // The behavioural console-breadcrumb assertion: the merchant/total free text
    // never left, and no console breadcrumb was recorded at all.
    expect(raw).not.toContain('Carrefour');
    expect(raw).not.toContain('412.50');
    expect(raw).not.toContain('"category":"console"');
  });
});
