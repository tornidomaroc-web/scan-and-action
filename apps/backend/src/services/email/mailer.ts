// Standalone, fail-safe transactional email module (PR4a).
//
// Sends a single transactional email via the Resend REST API (no SDK — same
// HTTP approach as scripts/send_reminders.js). This module is intentionally
// dead code until a later step (PR4b) imports it from an auth hook.
//
// Design contract:
//   * Side-effect-free on import (no network, no env reads at module load).
//   * NEVER throws to the caller. Every outcome is a typed SendResult so a
//     future caller's main flow can never be broken by an email failure.
//   * Reads RESEND_API_KEY and MAIL_FROM from the environment at call time.
//
// Anti-spam compliance (this is a promotional/transactional welcome email):
//   * List-Unsubscribe header (mailto, plus optional one-click HTTPS URL).
//   * A physical postal address line in the footer.
//
// Compliance is FAIL-CLOSED: the footer (postal address + unsubscribe) is
// appended to every email this module sends, so a commercial email is never
// dispatched without a real physical address. If MAIL_POSTAL_ADDRESS is unset,
// the send is skipped rather than sent with placeholder text. The postal address
// and the unsubscribe/contact mailbox are env-driven so they can be changed
// (e.g. swap a temporary address for a P.O. box) without a code change.

// The one import this otherwise-standalone module takes: the shared scrubber
// (item #3 Half B, PR B3). It is a pure, side-effect-free function, so the
// "side-effect-free on import" contract above still holds.
import { scrubString } from '../../redaction';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Fallback From address used only if MAIL_FROM is unset, so a misconfigured
 * env can never crash a caller. The domain MUST match the verified Resend
 * sending domain. The verified domain on the production Resend key is the apex
 * scan-action.com (empirically: noreply@scan-action.com is accepted, the `send`
 * subdomain is rejected 403), so the From address lives on scan-action.com. Set
 * MAIL_FROM explicitly in every real environment; this default is a safety net,
 * not a config source.
 */
const DEFAULT_MAIL_FROM = 'Scan & Action <noreply@scan-action.com>';

/**
 * Default unsubscribe/contact mailbox, used when MAIL_UNSUBSCRIBE_MAILTO is
 * unset. support@scan-action.com is live via Cloudflare Email Routing and
 * forwards to a monitored inbox, so it is a working opt-out address (CAN-SPAM
 * allows email-based opt-out) AND the natural Reply-To for replies. One mailbox,
 * one source of truth: the List-Unsubscribe header, the footer link, and
 * Reply-To all resolve to the same address so they can never disagree.
 */
const DEFAULT_CONTACT_MAILTO = 'support@scan-action.com';

export interface TransactionalEmailParams {
  /** Single recipient address. */
  to: string;
  subject: string;
  /** HTML body. A compliance footer is appended automatically. */
  html: string;
  /** Optional plain-text alternative. Improves deliverability. */
  text?: string;
}

export type SendResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

// Reject control characters (CR/LF/NUL) to prevent header/field injection via
// caller-supplied recipient or subject. The Resend REST API takes JSON (so this
// is defense-in-depth), but we never want to forward malformed values.
const CONTROL_CHARS = /[\r\n\0]/;
// Deliberately loose: a single address with no surrounding whitespace and one @.
const BASIC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The physical postal address for the compliance footer, read at call time from
 * MAIL_POSTAL_ADDRESS. Returns null when unset/blank — the caller fails closed
 * (skips the send) rather than ever rendering placeholder text.
 */
function getPostalAddress(): string | null {
  return process.env.MAIL_POSTAL_ADDRESS?.trim() || null;
}

/**
 * The unsubscribe/contact mailbox, read at call time from MAIL_UNSUBSCRIBE_MAILTO
 * and defaulting to support@scan-action.com. Env is trusted, but since this value
 * is interpolated into the List-Unsubscribe header and an HTML href, a malformed
 * value (not a single clean address) falls back to the safe default as
 * defense-in-depth against header/markup injection.
 */
function getContactMailto(): string {
  const v = process.env.MAIL_UNSUBSCRIBE_MAILTO?.trim();
  if (v && BASIC_EMAIL.test(v) && !CONTROL_CHARS.test(v)) {
    return v;
  }
  if (v) {
    console.warn(
      '[Mailer] MAIL_UNSUBSCRIBE_MAILTO is not a single valid email address. ' +
        'Falling back to the default contact mailbox.',
    );
  }
  return DEFAULT_CONTACT_MAILTO;
}

function appendComplianceFooter(html: string, postalAddress: string, contactMailto: string): string {
  return (
    html +
    `\n<div style="margin-top:32px;padding-top:16px;border-top:1px solid #f1f5f9;` +
    `font-family:sans-serif;color:#94a3b8;font-size:12px;line-height:1.5;">` +
    `<p style="margin:0 0 4px;">You're receiving this email from Scan &amp; Action.</p>` +
    `<p style="margin:0 0 4px;">${postalAddress}</p>` +
    `<p style="margin:0;">To stop receiving these emails, ` +
    `<a href="mailto:${contactMailto}" style="color:#94a3b8;">unsubscribe here</a>.</p>` +
    `</div>`
  );
}

/**
 * Build the List-Unsubscribe header(s). Always advertises the mailto option
 * (same address as the footer link, passed in, so they cannot disagree). If
 * MAIL_UNSUBSCRIBE_URL is set (an HTTPS endpoint that accepts POST), it is added
 * and RFC 8058 one-click is enabled.
 */
function buildUnsubscribeHeaders(contactMailto: string): Record<string, string> {
  const oneClickUrl = process.env.MAIL_UNSUBSCRIBE_URL?.trim();
  const parts = [`<mailto:${contactMailto}>`];
  const headers: Record<string, string> = {};
  if (oneClickUrl) {
    parts.push(`<${oneClickUrl}>`);
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  headers['List-Unsubscribe'] = parts.join(', ');
  return headers;
}

/**
 * Send a single transactional email via Resend. Fail-safe: returns a typed
 * result and never throws.
 *
 *   - 'skipped' : configuration missing (RESEND_API_KEY, or the compliance
 *                 MAIL_POSTAL_ADDRESS) — not sent.
 *   - 'failed'  : validation rejected the input, or Resend/network errored.
 *   - 'sent'    : accepted by Resend (result.id is the Resend message id).
 */
export async function sendTransactionalEmail(
  params: TransactionalEmailParams,
): Promise<SendResult> {
  const { to, subject, html, text } = params;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      '[Mailer] RESEND_API_KEY is missing or empty. Skipping email send (fail-safe).',
    );
    return { status: 'skipped', reason: 'RESEND_API_KEY not configured' };
  }

  // Input validation — guard against header injection and obvious garbage.
  if (typeof to !== 'string' || !BASIC_EMAIL.test(to) || CONTROL_CHARS.test(to)) {
    console.error('[Mailer] Invalid recipient address. Refusing to send.');
    return { status: 'failed', error: 'Invalid recipient address' };
  }
  if (typeof subject !== 'string' || subject.length === 0 || CONTROL_CHARS.test(subject)) {
    console.error('[Mailer] Invalid subject. Refusing to send.');
    return { status: 'failed', error: 'Invalid subject' };
  }

  // Compliance, fail-closed: a commercial email legally requires a real physical
  // postal address in the footer. If it is not configured we REFUSE to send
  // rather than dispatch placeholder text. Checked here (where the footer is
  // built) so it protects every email this module sends.
  const postalAddress = getPostalAddress();
  if (!postalAddress) {
    console.error(
      '[Mailer] MAIL_POSTAL_ADDRESS is not set. A commercial email requires a ' +
        'physical postal address (CAN-SPAM/compliance). Refusing to send (fail-safe).',
    );
    return { status: 'skipped', reason: 'MAIL_POSTAL_ADDRESS not configured' };
  }
  const contactMailto = getContactMailto();

  const from = process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;
  if (!process.env.MAIL_FROM?.trim()) {
    console.warn(
      `[Mailer] MAIL_FROM is not set. Falling back to default sender. ` +
        `Set MAIL_FROM explicitly to avoid relying on this default.`,
    );
  }

  const payload: Record<string, unknown> = {
    from,
    // Replies go to the monitored contact mailbox (not the no-reply From), so
    // the welcome email's "just reply to this email" actually reaches a human.
    reply_to: contactMailto,
    to: [to],
    subject,
    html: appendComplianceFooter(html, postalAddress, contactMailto),
    headers: buildUnsubscribeHeaders(contactMailto),
  };
  if (typeof text === 'string' && text.length > 0) {
    payload.text = text;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // The recipient address is not logged. Note the second half of this fix:
      // `detail` is RESEND'S response body, not a string we build, and it
      // routinely echoes the offending address back ("Invalid `to` field: …").
      // Dropping `${to}` alone would therefore not have removed the address —
      // the body has to go through the scrubber too.
      console.error(
        `[Mailer] Resend returned ${res.status} ${res.statusText}: ${scrubString(detail)}`,
      );
      return { status: 'failed', error: `Resend HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    // The Resend message id is a lossless, non-PII handle: Resend's own dashboard
    // resolves it to the full delivery record, recipient included. Logging the
    // address as well was pure duplication of a system of record we already have.
    console.log(`[Mailer] Email accepted by Resend. ID: ${data.id ?? 'unknown'}`);
    return { status: 'sent', id: data.id ?? '' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // No recipient, and the exception text is scrubbed: on a fetch failure the
    // message is vendor/runtime text we do not control.
    console.error(`[Mailer] Network/exception while sending: ${scrubString(message)}`);
    return { status: 'failed', error: message };
  }
}
