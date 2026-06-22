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
 * Compliance footer. The postal address is a PLACEHOLDER — replace the bracket
 * text with the real registered business address before launch. A valid postal
 * address is required by CAN-SPAM and improves deliverability.
 */
// TODO(PR4b/launch): replace with the real registered postal address.
const POSTAL_ADDRESS = '[Your Company Name], [Street Address], [City, Postal/ZIP], [Country]';

/**
 * Address used for mailto-based unsubscribe. Recipients can always unsubscribe
 * by emailing this; if you wire a one-click HTTPS endpoint later, set
 * MAIL_UNSUBSCRIBE_URL and it will be advertised as RFC 8058 one-click too.
 *
 * On the apex (scan-action.com) to match the verified sender domain. NOTE: this
 * is a placeholder — the unsubscribe inbox routing is NOT wired up yet; mail to
 * this address is not yet received/processed (separate deferred task).
 */
const UNSUBSCRIBE_MAILTO = 'unsubscribe@scan-action.com';

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

function appendComplianceFooter(html: string): string {
  return (
    html +
    `\n<div style="margin-top:32px;padding-top:16px;border-top:1px solid #f1f5f9;` +
    `font-family:sans-serif;color:#94a3b8;font-size:12px;line-height:1.5;">` +
    `<p style="margin:0 0 4px;">You're receiving this email from Scan &amp; Action.</p>` +
    `<p style="margin:0 0 4px;">${POSTAL_ADDRESS}</p>` +
    `<p style="margin:0;">To stop receiving these emails, ` +
    `<a href="mailto:${UNSUBSCRIBE_MAILTO}" style="color:#94a3b8;">unsubscribe here</a>.</p>` +
    `</div>`
  );
}

/**
 * Build the List-Unsubscribe header(s). Always advertises the mailto option.
 * If MAIL_UNSUBSCRIBE_URL is set (an HTTPS endpoint that accepts POST), it is
 * added and RFC 8058 one-click is enabled.
 */
function buildUnsubscribeHeaders(): Record<string, string> {
  const oneClickUrl = process.env.MAIL_UNSUBSCRIBE_URL?.trim();
  const parts = [`<mailto:${UNSUBSCRIBE_MAILTO}>`];
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
 *   - 'skipped' : configuration missing (e.g. RESEND_API_KEY) — not sent.
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

  const from = process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;
  if (!process.env.MAIL_FROM?.trim()) {
    console.warn(
      `[Mailer] MAIL_FROM is not set. Falling back to default sender. ` +
        `Set MAIL_FROM explicitly to avoid relying on this default.`,
    );
  }

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html: appendComplianceFooter(html),
    headers: buildUnsubscribeHeaders(),
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
      console.error(
        `[Mailer] Resend returned ${res.status} ${res.statusText} for ${to}: ${detail}`,
      );
      return { status: 'failed', error: `Resend HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(`[Mailer] Email accepted by Resend for ${to}. ID: ${data.id ?? 'unknown'}`);
    return { status: 'sent', id: data.id ?? '' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] Network/exception while sending to ${to}: ${message}`);
    return { status: 'failed', error: message };
  }
}
