import type { Event, Breadcrumb } from '@sentry/react';

/**
 * PII redaction for Sentry events — the choke point that strips sensitive data
 * BEFORE any event leaves the browser. This module ships in the SAME commit as
 * Sentry.init (see sentry.ts); Sentry is never wired without it.
 *
 * This is the browser twin of apps/backend/src/redaction.ts and is deliberately
 * kept structurally identical so the two can be reviewed side by side (there is
 * no shared package — see plan §"Objections" 8). Design (plan §3): structural,
 * not regex-chasing. Console lines only reach Sentry as breadcrumbs, and those
 * are neutralised at the source by disabling the Console breadcrumb integration
 * (sentry.ts), not here. This module handles the vectors that survive:
 *   - the exception message + stack,
 *   - the page URL / query string, Authorization & Cookie headers, Referer,
 *   - the user email, and any leftover breadcrumb payloads (fetch/xhr URLs).
 *
 * Regex is used ONLY as a backstop over free-text fields (exception values,
 * messages) where a value can be embedded — it is not the primary mechanism.
 */

// Order matters: strip JWT-shaped and Bearer tokens before emails so an
// email-looking substring inside a token doesn't get partially replaced.
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const REDACTED_EMAIL = '[redacted-email]';
const REDACTED_TOKEN = '[redacted-token]';
const REDACTED = '[redacted]';

/** Backstop scrub of a free-text string: tokens first, then emails. */
export function scrubString(input: string): string {
  return input
    .replace(JWT_RE, REDACTED_TOKEN)
    .replace(BEARER_RE, `Bearer ${REDACTED_TOKEN}`)
    .replace(EMAIL_RE, REDACTED_EMAIL);
}

// `referer` is browser-specific vs the backend list: the SpA page URL can carry
// a search query, and HttpContext attaches the referrer verbatim.
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'referer', 'referrer'];

/** Remove sensitive headers case-insensitively from a headers bag. */
function scrubHeaders(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      delete headers[key];
    }
  }
}

function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  // Drop structured payloads (fetch/xhr URLs and bodies, DOM targets) wholesale;
  // scrub any free-text message as a backstop even though Console breadcrumbs
  // are disabled in sentry.ts.
  if (b.data) delete b.data;
  if (typeof b.message === 'string') b.message = scrubString(b.message);
  return b;
}

/**
 * Strip PII from a Sentry event in place and return it. Pure (no I/O). May throw
 * on hostile input — beforeSend() below is the fail-closed guard that turns any
 * throw into a dropped event.
 */
export function scrubEvent<T extends Event>(event: T): T {
  // Exception message + stack.
  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v.value === 'string') v.value = scrubString(v.value);
      const frames = v.stacktrace?.frames;
      if (Array.isArray(frames)) {
        for (const f of frames) {
          // Local variables can carry anything — never ship them.
          if (f.vars) delete f.vars;
          // Source context lines are free text that can embed a value/literal
          // (with source maps uploaded these become real app source).
          if (typeof f.context_line === 'string') f.context_line = scrubString(f.context_line);
          if (Array.isArray(f.pre_context)) f.pre_context = f.pre_context.map(scrubString);
          if (Array.isArray(f.post_context)) f.post_context = f.post_context.map(scrubString);
        }
      }
    }
  }

  // Top-level message.
  if (typeof event.message === 'string') event.message = scrubString(event.message);

  // Request: body, sensitive headers, cookies, query string, URL query params.
  const req = event.request;
  if (req) {
    if ('data' in req) req.data = REDACTED;
    if (req.cookies) delete req.cookies;
    if (req.headers && typeof req.headers === 'object') {
      scrubHeaders(req.headers as Record<string, unknown>);
    }
    if ('query_string' in req) req.query_string = REDACTED;
    // The page URL is attached by the HttpContext integration; a search query
    // or token could ride in the query string or the hash.
    if (typeof req.url === 'string') req.url = req.url.split('?')[0].split('#')[0];
  }

  // Never transmit a user email; keep only a pseudonymous id if present.
  if (event.user && typeof event.user === 'object') {
    if ('email' in event.user) delete (event.user as Record<string, unknown>).email;
    if ('ip_address' in event.user) delete (event.user as Record<string, unknown>).ip_address;
    if ('username' in event.user) delete (event.user as Record<string, unknown>).username;
  }

  // Breadcrumbs (defense-in-depth; Console breadcrumbs are already off).
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  // Extra: scrub free-text string values as a backstop.
  if (event.extra && typeof event.extra === 'object') {
    for (const [k, val] of Object.entries(event.extra)) {
      if (typeof val === 'string') event.extra[k] = scrubString(val);
    }
  }

  return event;
}

/**
 * The Sentry `beforeSend` hook. FAIL-CLOSED: if scrubbing throws for any reason,
 * we drop the event (return null) rather than risk sending un-redacted data.
 */
export function beforeSend<T extends Event>(event: T): T | null {
  try {
    return scrubEvent(event);
  } catch {
    return null;
  }
}
