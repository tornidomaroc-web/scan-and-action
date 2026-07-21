// Standalone, fail-safe Discord alert sink.
//
// Posts a short message to a Discord incoming webhook so that founder-actionable
// failures on the payment/webhook path (a paid customer who did not map to an
// org, a refund needing manual review, a webhook processing error) are *pushed*
// in real time instead of only sitting in Railway logs that nobody is watching.
//
// Design contract (mirrors services/email/mailer.ts):
//   * Side-effect-free on import (no network, no env reads at module load).
//   * NEVER throws to the caller. This is best-effort observability layered on
//     top of the existing console.* logs — it must NEVER become a new failure
//     mode or add latency to the Paddle webhook response.
//   * Reads DISCORD_ALERT_WEBHOOK_URL from the environment at call time.
//   * NEVER logs the webhook URL or its token, and NEVER puts it in the body.
//   * Callers pass only non-secret, NON-PERSONAL business identifiers (event
//     name, our userId/org UUIDs, Paddle customer/subscription/transaction ids)
//     as context. NEVER an email address, a person's name, or any other direct
//     personal data.
//
//     This rule is stricter than it looks, and it is deliberate: Discord is a
//     THIRD PARTY. Anything posted here leaves our boundary, is readable by
//     everyone in the channel (including future invitees), and persists
//     INDEFINITELY — there is no retention window to age it out, only manual
//     deletion. That makes it categorically different from a Railway log line.
//     Until item #3 Half B PR B1 this contract listed "the user/email ref
//     string" as an acceptable example, and the billing alerts duly sent a
//     paying customer's email address to Discord. Do not reintroduce it: if you
//     need to identify a customer, send the Paddle customer id, which resolves
//     to the full record inside Paddle without egressing personal data.

// Discord renders the top-level `content` field of an incoming-webhook payload.
// Hard cap is 2000 chars; we truncate well under it defensively.
const MAX_CONTENT_LENGTH = 1900;

// A slow Discord must never hold the webhook request open. Abort after this.
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Non-secret context appended to the alert as `key=value` pairs. Pass only
 * opaque business identifiers — never tokens, secrets, signatures, raw payloads,
 * or PERSONAL DATA (email addresses, names, document contents).
 *
 * Note the rule is NOT "anything already in the [Webhook][ALERT] logs is fine"
 * (which is what this said before PR B1). Our own stdout still contains personal
 * data at other sites; a value being acceptable in a first-party log does not
 * make it acceptable to transmit to a third party.
 */
export type DiscordAlertContext = Record<string, string | number | undefined | null>;

function formatContent(message: string, context?: DiscordAlertContext): string {
  let content = `🚨 **[Scan & Action]** ${message}`;
  if (context) {
    const parts = Object.entries(context)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${v}`);
    if (parts.length > 0) {
      content += `\n${parts.join(' ')}`;
    }
  }
  return content.length > MAX_CONTENT_LENGTH
    ? `${content.slice(0, MAX_CONTENT_LENGTH)}…`
    : content;
}

/**
 * Best-effort: POST an alert to the Discord incoming webhook. Resolves to
 * `void` on every outcome and never rejects.
 *
 *   - env unset/blank → skipped (single console.warn, no fetch).
 *   - network error / timeout / non-2xx → swallowed (single console.warn).
 *   - success → silent (the alert itself is the signal).
 */
export async function sendDiscordAlert(
  message: string,
  context?: DiscordAlertContext,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    // Low volume (only the exceptional webhook paths call this), so a single
    // warn is useful: it means an alert was wanted but Discord is not wired up.
    // Deliberately does NOT echo the (empty) URL.
    console.warn('[DiscordAlert] DISCORD_ALERT_WEBHOOK_URL not set — skipping alert (fail-safe).');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: formatContent(message, context) }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Read the body best-effort for a short diagnostic; never the URL.
      const detail = await res.text().catch(() => '');
      console.warn(
        `[DiscordAlert] Discord returned ${res.status} ${res.statusText} — alert not delivered. ${detail.slice(0, 200)}`,
      );
    }
  } catch (err) {
    // Includes AbortError (our own timeout) and any network failure. The
    // message can never contain the URL (we never interpolate it into errors).
    const messageText = err instanceof Error ? err.message : String(err);
    console.warn(`[DiscordAlert] Failed to deliver alert (fail-safe, ignored): ${messageText}`);
  } finally {
    clearTimeout(timeout);
  }
}
