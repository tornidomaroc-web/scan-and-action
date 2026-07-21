import * as Sentry from '@sentry/react';
import type { BrowserOptions } from '@sentry/react';
import { beforeSend } from './redaction';

/**
 * Sentry initialisation for the frontend. Imported as the FIRST line of
 * main.tsx, before React and the providers, so the SDK's global handlers are
 * installed before any app code can throw.
 *
 * Redaction (./redaction) is wired in here, in the same module/commit as init —
 * Sentry is never enabled without the scrubber in place.
 *
 * When VITE_SENTRY_DSN is unset the SDK is a full NO-OP: we skip init entirely,
 * so no client is created, no global handlers are installed, and nothing is ever
 * transmitted. This keeps CI green and local/dev/native builds silent until a
 * DSN is set in the Vercel project env.
 *
 * NOTE ON ASYNC ERRORS: we deliberately hand-write NO window.onerror /
 * onunhandledrejection handlers. Sentry's default `GlobalHandlers` integration
 * installs both, so event-handler and promise-rejection errors — the ones an
 * ErrorBoundary cannot catch — are covered by the SDK.
 */
/**
 * The slice of `import.meta.env` this module reads. Kept as a narrow structural
 * type (rather than Vite's `ImportMetaEnv`) so tests can pass a plain object,
 * mirroring the backend's `buildSentryOptions(env: NodeJS.ProcessEnv)`.
 */
export interface SentryEnv {
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  MODE?: string;
}

export function buildSentryOptions(env: SentryEnv = import.meta.env): BrowserOptions {
  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE,
    // Errors only — no performance tracing — to protect the free-tier quota.
    tracesSampleRate: 0,
    // Never let the SDK auto-attach IPs, cookies, or request bodies as "default PII".
    sendDefaultPii: false,
    integrations: (defaults) =>
      defaults
        .filter(
          (i) =>
            // Replaced below with a console-free variant.
            i.name !== 'Breadcrumbs' &&
            // Session envelopes do NOT pass through beforeSend, so the scrubber
            // never sees them. Nothing leaves this app un-scrubbed: drop them.
            // (Release Health is not something we use on the free tier.)
            i.name !== 'BrowserSession'
        )
        // Console breadcrumbs OFF: the PII-bearing console.* lines (emails,
        // merchant/total, raw query text) must never become Sentry data at the
        // source. dom/fetch/xhr/history breadcrumbs are kept — they are the
        // useful ones — and their `data` payloads are dropped in beforeSend.
        .concat(Sentry.breadcrumbsIntegration({ console: false })),
    // The redaction choke point — strips PII before any event leaves. Fail-closed.
    beforeSend,
  };
}

/**
 * Initialise Sentry if a DSN is configured. Returns true if initialised, false
 * if it no-op'd (DSN unset). Safe to call once at module load.
 */
export function initSentry(env: SentryEnv = import.meta.env): boolean {
  const options = buildSentryOptions(env);
  if (!options.dsn) return false;
  Sentry.init(options);
  return true;
}

// Run at import time (side effect). No-op when VITE_SENTRY_DSN is unset.
initSentry();
