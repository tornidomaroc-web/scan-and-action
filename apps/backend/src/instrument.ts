import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { beforeSend } from './redaction';

/**
 * Sentry initialisation for the backend. Imported at the TOP of index.ts —
 * after `import 'dotenv/config'` (so env is loaded) and BEFORE `import app`
 * (so init runs before express is imported and instrumented).
 *
 * Redaction (./redaction) is wired in here, in the same module/commit as init —
 * Sentry is never enabled without the scrubber in place.
 *
 * When SENTRY_DSN is unset the SDK is a full NO-OP: we skip init entirely, so no
 * client is created, no global handlers are installed, and nothing is ever
 * transmitted. This keeps CI green and local/dev runs silent until a DSN is set
 * on Railway.
 */
export function buildSentryOptions(env: NodeJS.ProcessEnv = process.env): NodeOptions {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    // Errors only — no performance tracing — to protect the free-tier quota.
    tracesSampleRate: 0,
    // Never let the SDK auto-attach IPs, cookies, or request bodies as "default PII".
    sendDefaultPii: false,
    // Disable the Console breadcrumb integration: the PII-bearing console.* lines
    // (emails, merchant/total, raw query text) must never become Sentry data at
    // the source. All OTHER defaults (OnUncaughtException, OnUnhandledRejection,
    // Http, etc.) are preserved.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
    // The redaction choke point — strips PII before any event leaves. Fail-closed.
    beforeSend,
  };
}

/**
 * Initialise Sentry if a DSN is configured. Returns true if initialised, false
 * if it no-op'd (DSN unset). Safe to call once at process start.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const options = buildSentryOptions(env);
  if (!options.dsn) return false;
  Sentry.init(options);
  return true;
}

// Run at import time (side effect). No-op when SENTRY_DSN is unset.
initSentry();
