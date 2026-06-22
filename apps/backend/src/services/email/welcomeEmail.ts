// One-time welcome email, wired into new-user provisioning (PR4b).
//
// Sends EXACTLY ONE welcome email per user, gated by an atomic DB claim so the
// known provisioning race in authMiddleware (two concurrent first requests both
// entering the zero-memberships branch) can never produce a duplicate send.
//
// This module builds on the merged, fail-safe mailer (PR4a) and does NOT modify
// its sending logic.

import { prisma } from '../../prismaClient';
import { sendTransactionalEmail } from './mailer';

const WELCOME_SUBJECT = 'Welcome to Scan & Action';

// Web upgrade flows through login — there is no direct Paddle link.
const LOGIN_URL = 'https://www.scan-action.com/login';

/**
 * Env-based kill switch for welcome-email sending. Default OFF: welcome emails
 * are held unless WELCOME_EMAIL_ENABLED is explicitly the string 'true'
 * (case-insensitive, trimmed). This lets us keep the path deployed but dormant
 * until the compliance placeholders (POSTAL_ADDRESS, unsubscribe mailbox) are
 * filled, WITHOUT touching RESEND_API_KEY (which also drives other email).
 *
 * Read at call time so flipping the env + redeploy takes effect with no code
 * change — mirrors how the mailer reads RESEND_API_KEY.
 */
export function isWelcomeEmailEnabled(): boolean {
  return process.env.WELCOME_EMAIL_ENABLED?.trim().toLowerCase() === 'true';
}

function buildWelcomeHtml(): string {
  // Minimal, clean HTML. The mailer appends the compliance footer
  // (postal address + List-Unsubscribe) automatically, so it is intentionally
  // NOT duplicated here.
  return (
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">` +
    `<h1 style="color:#1e293b;font-size:24px;font-weight:800;margin:0 0 12px;">Welcome to Scan &amp; Action</h1>` +
    `<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 16px;">` +
    `Thanks for signing up. Your workspace is ready — upload a document and let the AI turn it into structured, searchable data.` +
    `</p>` +
    `<p style="margin:24px 0;">` +
    `<a href="${LOGIN_URL}" style="background-color:#2563eb;color:#ffffff;padding:14px 28px;` +
    `text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">` +
    `Open Scan &amp; Action</a>` +
    `</p>` +
    `<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;">` +
    `Need anything? Just reply to this email.` +
    `</p>` +
    `</div>`
  );
}

function buildWelcomeText(): string {
  return (
    `Welcome to Scan & Action\n\n` +
    `Thanks for signing up. Your workspace is ready — upload a document and let ` +
    `the AI turn it into structured, searchable data.\n\n` +
    `Open Scan & Action: ${LOGIN_URL}\n\n` +
    `Need anything? Just reply to this email.`
  );
}

/**
 * Atomically claim-then-send the one-time welcome email for a brand-new user.
 *
 * Contract:
 *   - Awaits ONLY the atomic claim (one fast UPDATE). The actual send is
 *     fire-and-forget so Resend's HTTP latency can never delay the auth
 *     response.
 *   - NEVER throws. Any error (claim or send) is logged and swallowed so it
 *     cannot propagate into the auth/provisioning flow.
 *
 * Atomic claim: `updateMany({ where: { id, welcomeEmailSentAt: null }, ... })`
 * is a single conditional UPDATE the database serializes. Under the provisioning
 * race, both requests run it but only ONE matches the `null` row and gets
 * count === 1 — that winner sends; the loser (count === 0) does not.
 *
 * Claim-then-send (timestamp set BEFORE sending) is deliberate: a send failure
 * means the user simply misses the welcome (acceptable — email is best-effort),
 * but it can never cause a resend loop on every subsequent request, nor a
 * duplicate after a crash/retry. The alternative (send-then-claim) reopens the
 * duplicate window and risks spamming, which is worse than a rare miss.
 */
export async function sendWelcomeEmailOnce(userId: string, email: string): Promise<void> {
  // Kill switch is checked BEFORE the atomic claim on purpose: when held we make
  // no DB write and no send, so welcomeEmailSentAt stays null and the user is
  // not silently marked "welcomed" without receiving anything.
  if (!isWelcomeEmailEnabled()) {
    console.log(
      `[WelcomeEmail] Held: WELCOME_EMAIL_ENABLED is not 'true'. ` +
        `No claim, no send for user ${userId}.`,
    );
    return;
  }

  let claimed = false;
  try {
    const claim = await prisma.user.updateMany({
      where: { id: userId, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: new Date() },
    });
    claimed = claim.count === 1;
  } catch (err) {
    // A claim failure must never break auth. Skip the email entirely.
    console.error(
      '[WelcomeEmail] Atomic claim failed; skipping welcome email:',
      err instanceof Error ? err.message : err,
    );
    return;
  }

  if (!claimed) {
    // Either already sent, or this caller lost the provisioning race.
    return;
  }

  // Fire-and-forget. We do NOT await the send so auth proceeds immediately.
  // The mailer never throws and returns a typed result; we only log non-sends.
  // The .catch is pure defense-in-depth against an unexpected rejection.
  void sendTransactionalEmail({
    to: email,
    subject: WELCOME_SUBJECT,
    html: buildWelcomeHtml(),
    text: buildWelcomeText(),
  })
    .then((result) => {
      if (result.status !== 'sent') {
        console.warn(
          `[WelcomeEmail] Welcome email not delivered for user ${userId} (status=${result.status}). ` +
            `Claim already set; it will not be retried.`,
        );
      }
    })
    .catch((err) => {
      console.error('[WelcomeEmail] Unexpected error during welcome send:', err);
    });
}
