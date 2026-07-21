import type { Event, Breadcrumb } from '@sentry/node';

/**
 * PII redaction for Sentry events — the choke point that strips sensitive data
 * BEFORE any event leaves the process. This module ships in the SAME commit as
 * Sentry.init (see instrument.ts); Sentry is never wired without it.
 *
 * Design (per docs/SENTRY_INTEGRATION_PLAN_2026-07-20.md §3): structural, not
 * regex-chasing. The bulk of PII-bearing logs (merchant name, totals, raw query
 * text, emails) are console.* lines that only reach Sentry as breadcrumbs — those
 * are neutralised at the source by DISABLING the Console breadcrumb integration
 * (instrument.ts), not here. This module handles the vectors that survive:
 *   - the exception message + stack (a Prisma P2002 embeds e.g. an email value),
 *   - the request body, Authorization/Cookie headers, cookies, and query string,
 *   - the user email, and any leftover breadcrumb payloads.
 *
 * Regex is used ONLY as a backstop over free-text fields (exception values,
 * messages) where a value can be embedded — it is not the primary mechanism.
 */

// Order matters: strip JWT-shaped and Bearer tokens before emails so an
// email-looking substring inside a token doesn't get partially replaced.
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Storage paths and filenames (added in item #3 Half B, PR B3).
//
// supabaseStorage.ts builds an object key as `uploads/<epoch-ms>-<sanitized
// filename>`, and its sanitiser only lowercases and strips punctuation — so
// "CV John Smith.pdf" survives inside the path as "cv-john-smith.pdf". B2
// removed our own deliberate logging of those paths, but a VENDOR error message
// (Supabase, Gemini) can still quote one back at us, and that string is not
// something we construct.
//
// A filename is not pattern-matchable in general. These two patterns cover what
// IS matchable: our exact storage-path shape, and the generic "<name>.<ext>"
// token for the upload types this product accepts. This is a BACKSTOP, not a
// guarantee — see formatErrorForLog below for the structural half of the policy,
// which is what actually bounds the exposure.
const STORAGE_PATH_RE = /\buploads\/[0-9]+-[^\s"',;)]+/gi;
const FILENAME_RE = /\b[\w.-]+\.(?:pdf|png|jpe?g|webp|heic|heif|gif|tiff?|bmp)\b/gi;

const REDACTED_EMAIL = '[redacted-email]';
const REDACTED_TOKEN = '[redacted-token]';
const REDACTED_PATH = '[redacted-path]';
const REDACTED_FILENAME = '[redacted-filename]';
const REDACTED = '[redacted]';

/**
 * Backstop scrub of a free-text string: tokens first, then emails, then storage
 * paths/filenames.
 *
 * Used by BOTH sinks — Sentry (via scrubEvent/beforeSend) and stdout (via the
 * error logging in errorHandler/queryExecutor/formatErrorForLog). That is
 * deliberate: one scrubber means an error string is redacted identically whether
 * it lands in Railway or in Sentry, and there is no second implementation to
 * drift.
 */
export function scrubString(input: string): string {
  return input
    .replace(JWT_RE, REDACTED_TOKEN)
    .replace(BEARER_RE, `Bearer ${REDACTED_TOKEN}`)
    .replace(EMAIL_RE, REDACTED_EMAIL)
    // Path before filename: the path contains a filename, and matching the
    // whole key is more informative than leaving `uploads/173…-[redacted-filename]`.
    .replace(STORAGE_PATH_RE, REDACTED_PATH)
    .replace(FILENAME_RE, REDACTED_FILENAME);
}

/**
 * THE ERROR-OBJECT LOGGING POLICY (item #3 Half B, PR B3).
 *
 * Rule 1 — NEVER pass an error object to console.*. `console.error('x:', err)`
 * serialises every enumerable field. For a vendor error (Supabase, Resend,
 * Gemini) that is an unaudited surface: it can carry request context, a storage
 * key, or a payload echo that we never chose to log. Log a BOUNDED PROJECTION
 * instead — that is what this function produces.
 *
 * Rule 2 — the projection is bounded vendor metadata (name/code/status) plus the
 * message, and the message goes through scrubString.
 *
 * Rule 3 — be honest about the limit. scrubString catches emails, tokens, our
 * storage-path shape and common upload filenames. A filename with an unusual or
 * absent extension, quoted inside a vendor message, can still survive. The regex
 * is the backstop; RULE 1 is what actually bounds the exposure, because the
 * fields we never print cannot leak.
 */
export function formatErrorForLog(err: unknown): string {
  if (err === null || err === undefined) return 'unknown error';

  if (typeof err === 'string') return scrubString(err);

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    // Bounded, non-PII vendor metadata. Nothing else off the object is read.
    for (const key of ['name', 'code', 'status', 'statusCode']) {
      const v = e[key];
      if (typeof v === 'string' || typeof v === 'number') parts.push(`${key}=${v}`);
    }
    const message = typeof e.message === 'string' ? scrubString(e.message) : undefined;
    if (message) parts.push(`message=${message}`);
    return parts.length > 0 ? parts.join(' ') : 'unspecified error';
  }

  return scrubString(String(err));
}

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'proxy-authorization'];

/** Remove sensitive headers case-insensitively from a headers bag. */
function scrubHeaders(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      delete headers[key];
    }
  }
}

function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  // Drop structured payloads (http/fetch URLs, bodies) wholesale; scrub any
  // free-text message as a backstop even though Console breadcrumbs are disabled.
  if (b.data) delete b.data;
  if (typeof b.message === 'string') b.message = scrubString(b.message);
  return b;
}

/**
 * Strip PII from a Sentry event in place and return it. Pure w.r.t. process
 * state (no I/O). May throw on hostile input — beforeSend() below is the
 * fail-closed guard that turns any throw into a dropped event.
 */
export function scrubEvent<T extends Event>(event: T): T {
  // Exception message + stack (covers err.stack embedding at errorHandler.ts:11).
  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v.value === 'string') v.value = scrubString(v.value);
      const frames = v.stacktrace?.frames;
      if (Array.isArray(frames)) {
        for (const f of frames) {
          // Local variables can carry anything — never ship them.
          if (f.vars) delete f.vars;
          // Source context lines (attached by the ContextLines integration) are
          // free text that can embed a value/literal — backstop-scrub them.
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
    if (typeof req.url === 'string') req.url = req.url.split('?')[0];
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
