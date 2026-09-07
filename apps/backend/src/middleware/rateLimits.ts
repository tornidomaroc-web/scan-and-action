import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

// All limiters use the default in-memory store, which is correct for the
// current single-instance Railway deployment. If we ever scale to multiple
// instances, swap in a shared store (e.g. rate-limit-redis).

const limitResponse = (message: string) => ({
  error: 'RATE_LIMITED',
  message
});

/**
 * Per-IP upload limiter: 60 uploads / 15 min.
 * A human scanning receipts one-by-one tops out around 4/min, so this only
 * bites scripts. Plan quotas (FREE lifetime 10, PRO 200/day) still apply
 * underneath — this is an abuse brake, not a billing control.
 */
export const uploadIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitResponse('Too many uploads from this address. Please wait a few minutes and try again.')
});

/**
 * Per-organization upload limiter: 120 uploads / hour.
 * Sits between a legitimate bookkeeping burst and a runaway loop burning
 * Gemini quota. Runs after authMiddleware, so req.user is always set;
 * falls back to IP if not (defensive).
 */
export const uploadOrgLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // IP fallback goes through ipKeyGenerator so IPv6 clients are keyed by
  // subnet, not per-address (prevents trivial limit evasion).
  keyGenerator: (req: Request) => req.user?.organizationId || ipKeyGenerator(req.ip || ''),
  message: limitResponse('Your workspace has reached the hourly upload limit. Please try again later.')
});

/**
 * Per-organization re-extraction limiter: 20 re-extractions / hour.
 *
 * Ships WITH its trigger. POST /documents/:id/reextract runs a paid Gemini
 * extraction; before the retry button existed the route was unmetered but
 * unreachable, since nothing in the app called it. The button is what makes an
 * unmetered paid call reachable from a tap, so the brake lands in the same
 * change rather than after it.
 *
 * The controller's conditional claim already stops repeat hits on the SAME
 * document (the second caller loses the claim and gets 409). It does nothing
 * about a sweep across MANY documents — that is this limiter's job.
 *
 * Much tighter than uploadOrgLimiter (120/hr) on purpose: re-extraction is a
 * recovery action, not a workflow. A user salvaging a bad batch might touch a
 * handful of documents; twenty in an hour is already generous, and the failed
 * documents to spend it on are rare by construction.
 *
 * Same org key and same IPv6-safe IP fallback as uploadOrgLimiter.
 */
export const reextractOrgLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.organizationId || ipKeyGenerator(req.ip || ''),
  message: limitResponse('Too many re-extraction attempts for this workspace. Please try again later.')
});

/**
 * Per-IP search limiter: 120 searches / 15 min.
 * Search is keyword parsing + a few DB queries — cheap, but unmetered.
 * 120 allows brisk interactive use (8/min) while capping scripted abuse.
 */
export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitResponse('Too many search requests. Please wait a few minutes and try again.')
});

/**
 * Account-deletion limiter: 5 attempts / hour, keyed per authenticated user
 * (falls back to IP defensively). Deletion is a rare, deliberate action — a
 * tight cap blunts both accidental retry storms and any attempt to hammer the
 * endpoint. Runs after authMiddleware, so req.user is normally set.
 */
export const accountDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || ipKeyGenerator(req.ip || ''),
  message: limitResponse('Too many account-deletion attempts. Please wait a while and try again.')
});
