import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../prismaClient';
import { sendWelcomeEmailOnce } from '../services/email/welcomeEmail';
import { formatErrorForLog } from '../redaction';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Bounded retries for the just-in-time provisioning paths below. Each retry
// only happens after a unique-constraint (P2002) loss, i.e. another concurrent
// request from the SAME user already created the contended row — so a couple of
// attempts is always enough in practice; the cap exists purely to guarantee we
// can never spin forever.
const MAX_PROVISION_ATTEMPTS = 3;

// True for a Prisma unique-constraint violation. We key off `.code` (rather than
// `instanceof PrismaClientKnownRequestError`) so the check holds across Prisma
// internals and is trivially testable.
const isUniqueConstraintError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * WHICH unique constraint a P2002 hit, lowercased. `[]` when we cannot tell.
 *
 * Prisma types `meta` as `Record<string, unknown>` and never inspects it, so the
 * shape is whatever the query engine sent. Observed in production on 2026-08-24
 * (errorId d7ff1eba-967e-4ec8-a053-23c34790d790):
 *
 *     code=P2002 meta.modelName=User meta.target=email
 *
 * That rendering is ambiguous by construction — redaction.ts:118-121 joins a
 * string and a one-element array identically — so BOTH spellings are accepted
 * here and both are pinned in the tests. Postgres can also report the constraint
 * NAME rather than the field list, hence `user_email_key`.
 *
 * Anything else returns `[]`, which the caller treats as "unknown" and handles
 * exactly as this file did before. Unknown must never select the new branch.
 */
function uniqueConstraintTargets(err: unknown): string[] {
  const meta = (err as { meta?: unknown } | null)?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const target = (meta as { target?: unknown }).target;
  const items = Array.isArray(target) ? target : [target];
  if (!items.every((i) => typeof i === 'string')) return [];
  return (items as string[]).map((i) => i.trim().toLowerCase()).filter(Boolean);
}

/** The two spellings that mean "the collision was on User.email". */
const EMAIL_CONSTRAINT_NAMES = new Set(['email', 'user_email_key']);

const collidedOnUserEmail = (err: unknown): boolean =>
  uniqueConstraintTargets(err).some((t) => EMAIL_CONSTRAINT_NAMES.has(t));

/**
 * A live Supabase identity whose verified email is already held by a DIFFERENT
 * `User.id`. Permanent: `ensureUser` keys on `id`, so the upsert misses forever
 * and the create violates `User.email` forever. Retrying cannot help.
 *
 * WHY THIS REFUSES INSTEAD OF ADOPTING THE EXISTING ROW.
 * Re-keying the upsert on email would make the address the identity. Everywhere
 * else in this system the Supabase uuid is the identity and the email is the
 * explicitly WEAKER fallback — resolveBillingOrg tries the id first and only then
 * the email, and logs `[ALERT]` when that fallback is ambiguous. Adopting on
 * email would silently attach a re-registered or reassigned address to the
 * previous holder's Organization: their documents, their entities, their storage.
 * Silent, undetectable, and strictly worse than the lockout it would fix.
 *
 * So: distinguish, refuse, name it. Recovery is an operator action against the
 * orphaned row, never an automatic one taken on a request.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW A ROW GETS INTO THIS STATE — the mechanism, not an incident report.
 * ─────────────────────────────────────────────────────────────────────────────
 * `User.email` is `@unique` and NOT NULL, and `ensureUser` keys on `id`.
 * Therefore ANY removal of a Supabase auth identity that leaves its
 * `public."User"` row behind POISONS THAT ADDRESS PERMANENTLY FOR ITS OWNER:
 * the person re-registers, gets a new uuid, the upsert misses on `id`, and the
 * create violates `User.email` forever. Because this middleware is mounted on
 * the `/api` prefix (app.ts:92), every authenticated endpoint then fails for
 * them — they can still log in, which makes it look like the product is broken
 * rather than their account.
 *
 * This follows from the schema alone. It is true whatever removed the identity
 * — a console, the admin API, a half-completed deletion — so no particular
 * route is named here; naming one would state an inference as a cause.
 *
 * The app's own deletion path (`accountController.deleteAccount`) removes the
 * app rows and THEN the identity, so it cannot produce this shape. USE IT. Any
 * other route that deletes an identity must delete the `User` row too.
 *
 * IT HAS HAPPENED ONCE, AND IT HAPPENED TO THE DEVELOPER. Not to a customer:
 * the account was one of this project's own, registered and then removed during
 * ordinary work on it, and its owner was locked out from 2026-08-24 to
 * 2026-09-05 without recognising why. That is the part worth carrying. The
 * person who knew this system best did it, and then could not read it from the
 * symptom — because logging in still worked, so it looked like a broken product.
 * "I would never do that" is not a defence against this one.
 *
 * THE ROUTE WAS NOT RECORDED AND IS NOT NAMED HERE. Any admin-side removal
 * qualifies — a console, the admin API, a CLI, an abandoned script — and the
 * consequence is identical for all of them, so naming one would narrow a rule
 * that is not narrow. See docs/PRODUCTION_DATA_FIX_2026-09-04_ORPHAN_1e1c8482.md.
 */
export class IdentityEmailConflictError extends Error {
  readonly status = 409;
  constructor() {
    // errorHandler returns `err.message` as the response `error` field for a
    // non-500, so the message IS the machine code the client whitelist keys on
    // (same contract as CONFIRMATION_REQUIRED / SHARED_WORKSPACE).
    super('IDENTITY_EMAIL_CONFLICT');
    this.name = 'IdentityEmailConflictError';
  }
}

/**
 * A live Supabase identity that carries NO email address at all.
 *
 * WHY THIS IS A REFUSAL AND NOT A DEFAULTED VALUE.
 * `User.email` is `String @unique` and NOT NULL (schema.prisma:14). The line
 * that used to read `user.email || ''` therefore wrote the empty string into a
 * unique column, which means EXACTLY ONE account in the entire system may ever
 * hold "no email". The first emailless identity is provisioned normally; the
 * SECOND collides on `user_email_key`, is classified by `collidedOnUserEmail`
 * below as an identity conflict, and is locked out permanently — as a brand-new
 * user, with no orphaned row for an operator to point at, reading copy that
 * tells them only support can help. Nothing about that is true or fixable.
 *
 * WHY NOT A SYNTHETIC PLACEHOLDER (e.g. `<uuid>@no-email.invalid`).
 * It would collide with nothing and the account would work — which is the
 * problem. `User.email` exists so two cold paths can find a row BY ADDRESS
 * (resolveBillingOrg.ts:73, accountController.ts:75). A placeholder silently
 * fills that column with something no human will ever type, so the account
 * cannot be billed by the email fallback, cannot be found by the delete-account
 * holder lookup, and cannot be reached — and nobody learns this until one of
 * those paths is needed. It also leaves RESIDUE: rows carrying synthetic
 * addresses that must be found and cleaned if the product later decides
 * emailless accounts are not supported. A refusal leaves none.
 *
 * WHY NOT A NULLABLE COLUMN. Postgres treats NULLs as distinct in a unique
 * index, so nullability genuinely solves the collision — but it is a migration,
 * it changes the type at every read site, and it pre-commits the product to
 * supporting emailless accounts. That is a decision to take deliberately when a
 * provider that withholds addresses is actually enabled, not a side effect of
 * closing this trap.
 *
 * So: refuse, name it, write nothing. This is UNREACHABLE today — the only auth
 * surface is signInWithPassword / signUp (AuthScreen.tsx:82,85), which cannot
 * produce an identity without an address. It is armed by phone auth, anonymous
 * sign-in, or any OAuth provider configured without an email scope.
 *
 * DISTINCT FROM IdentityEmailConflictError ON PURPOSE. That code is TERMINAL on
 * the client (lib/identityConflict.ts) and must stay reserved for the condition
 * only an operator can clear. This one is a different situation with a different
 * remedy — sign in with an address — so it must never borrow that code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IF YOU ARE HERE BECAUSE YOU ARE ENABLING AN EMAILLESS PROVIDER, READ THIS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phone auth, anonymous sign-in, or an OAuth provider configured without an
 * email scope all make this class REACHABLE FOR THE FIRST TIME, and the client
 * has no handling for it. `documentService` discards the HTTP status and throws
 * `new Error(<server code>)`, so the screens classify by code alone;
 * `isIdentityConflict` returns false for IDENTITY_EMAIL_MISSING and every
 * adopted screen falls to its ordinary retryable branch. A user signing in that
 * way sees a generic "could not load" on every screen and a retry button that
 * can NEVER succeed, with nothing anywhere telling them the remedy.
 *
 * The copy was left undone deliberately, not overlooked: writing it for an
 * unreachable path means guessing at the flow that makes it reachable. What it
 * needs is a string and a branch that is NOT `isIdentityConflict` — that one is
 * terminal and stays reserved. The better answer may be to refuse the sign-in
 * CLIENT-SIDE before any request is made, which is only decidable once you know
 * which provider you are adding. That decision is yours; this file only
 * guarantees the database is never corrupted while you make it.
 */
export class IdentityEmailMissingError extends Error {
  readonly status = 403;
  constructor() {
    // Same contract as above: errorHandler returns `err.message` as the response
    // `error` field for a non-500, so the message IS the machine code.
    super('IDENTITY_EMAIL_MISSING');
    this.name = 'IdentityEmailMissingError';
  }
}

// Ensure the User row exists, returning it with memberships loaded.
//
// `prisma.user.upsert` is find-then-write and not atomic under concurrency: two
// near-simultaneous first-time requests from the same user can both miss the row
// and both attempt the INSERT, so the loser throws P2002 on User.id / User.email.
// On that loss the row now exists, so simply retrying the upsert takes the UPDATE
// path and succeeds. Non-P2002 errors propagate untouched.
async function ensureUser(userId: string, email: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_PROVISION_ATTEMPTS; attempt++) {
    try {
      return await prisma.user.upsert({
        where: { id: userId },
        update: { email },
        create: {
          id: userId,
          email,
          preferredLanguage: 'en',
        },
        include: { memberships: { include: { organization: true } } },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      // ── The ONLY new branch in this file, and it lives strictly inside a catch
      // that already required a P2002 — so it is unreachable for every account
      // whose upsert succeeds, which is all of them.
      //
      // A collision on `id` is the concurrency race: the row exists now, so the
      // retry takes the UPDATE path and recovers. A collision on `email` is a
      // DIFFERENT row holding this address, which no number of retries can fix.
      // Separating them is the whole change; conflating them would break the
      // race recovery, which is what the existing race tests guard.
      if (collidedOnUserEmail(error)) {
        // WHICH of the two email collisions is this? They are opposite situations
        // that the constraint reports identically, and until this lookup the code
        // treated both as the permanent one.
        //
        //   CREATE path — no row for this id. A live identity whose verified
        //     address is held by a different User.id. Permanent: the upsert keys
        //     on id so it misses forever, and the create violates User.email
        //     forever. Refusing is correct and stays exactly as it was.
        //
        //   UPDATE path — the row EXISTS. A provisioned account, working until
        //     this request, whose token email changed into an address another row
        //     holds. Nothing about the caller's identity is in question and their
        //     data is intact; only the email MIRROR cannot be updated. Refusing
        //     here destroys a working session to protect an invariant that is not
        //     under threat, and hands the user terminal copy telling them only
        //     support can help — for a condition support has nothing to fix.
        //
        // Keyed on `id`, never on email. A lookup BY EMAIL is the first step of
        // adopting the other row, which this file refuses on purpose (see
        // IdentityEmailConflictError) and which an existing test guards.
        const existing = await prisma.user.findUnique({
          where: { id: userId },
          include: { memberships: { include: { organization: true } } },
        });

        if (existing) {
          // The holder's id is deliberately NOT named here. Finding it needs a
          // read BY EMAIL — the one query this file will not make on a request.
          // An operator can run it once, by hand, when a human is looking.
          console.error(
            `[AuthMiddleware][ALERT] IDENTITY_EMAIL_MIRROR_STALE: user ${userId} is provisioned ` +
              `and their session continues, but their address is held by a different id, so ` +
              `User.email was NOT updated and now trails the identity provider. ` +
              `targets=${JSON.stringify(uniqueConstraintTargets(error))}. ` +
              `Reads that resolve a row BY ADDRESS will miss this user until an operator clears it.`
          );
          return existing;
        }

        console.error(
          `[AuthMiddleware] IDENTITY_EMAIL_CONFLICT: user ${userId} authenticated, but ` +
            `User.email is held by a different id. targets=${JSON.stringify(uniqueConstraintTargets(error))}. ` +
            `Not adopting the existing row — see IdentityEmailConflictError.`
        );
        throw new IdentityEmailConflictError();
      }

      lastError = error;
      // Lost the insert race; loop and retry — the row exists now.
    }
  }
  throw lastError;
}

// Ensure the user has a default Organization (+ OWNER membership), returning the
// organizationId and whether WE created it.
//
// The org + its OWNER membership are created together in a single transaction so
// they are atomic (never an org without its owner). The slug is deterministic
// (`workspace-<uuid8>`), so two concurrent first-time requests generate the SAME
// slug: the first commits, the loser hits P2002 on Organization.slug. On that
// loss the winner has already created the org + membership, so we re-fetch and
// continue with the winner's org (`created: false`). If the winner's transaction
// isn't visible yet (rare), we retry a bounded number of times, then fail with a
// real error rather than a misleading 401.
async function ensureOrganization(
  userId: string
): Promise<{ organizationId: string; created: boolean }> {
  for (let attempt = 0; attempt < MAX_PROVISION_ATTEMPTS; attempt++) {
    try {
      const newOrg = await prisma.$transaction((tx) =>
        tx.organization.create({
          data: {
            name: 'My Workspace',
            slug: `workspace-${userId.slice(0, 8)}`,
            members: {
              create: {
                userId,
                role: 'OWNER',
              },
            },
          },
        })
      );
      return { organizationId: newOrg.id, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Lost the provisioning race: the winner already created the org + OWNER
      // membership for this user. Re-fetch and continue with the winner's org.
      const memberships = await prisma.membership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'asc' },
        take: 1,
      });
      if (memberships.length > 0) {
        return { organizationId: memberships[0].organizationId, created: false };
      }
      // Winner's transaction not yet visible — loop and retry.
    }
  }
  throw new Error(
    `Failed to provision an organization for user ${userId} after ${MAX_PROVISION_ATTEMPTS} attempts`
  );
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed access token' });
  }

  const token = authHeader.split(' ')[1];

  // Genuine authentication failures (invalid/expired token) are handled inline
  // with an explicit 401 below. Everything inside this try that THROWS is an
  // unexpected/transient fault (DB blip, Prisma timeout, an unrecovered P2002,
  // etc.) — those are forwarded to the global errorHandler via next(error) so
  // they surface honestly (e.g. P2002 → 409, otherwise → 500), instead of
  // masquerading as "Invalid or expired token".
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[AuthMiddleware] Supabase Auth Error:', authError?.message || 'User not found');
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const userId = user.id;
    const email = user.email || '';

    // Refuse BEFORE anything is written. `User.email` is unique and NOT NULL, so
    // the empty string is a real, claimable value that exactly one row may hold —
    // see IdentityEmailMissingError for why this refuses instead of defaulting.
    //
    // Emptiness is tested on the TRIMMED form so a whitespace-only address cannot
    // slip past, but `email` itself is passed through UNTRIMMED below. That keeps
    // the write byte-identical to today for every address that already works: a
    // normalising trim would be a genuine value change on the next request, and a
    // genuine change is the one thing that can make the update path collide.
    //
    // Returned via next() directly rather than thrown into the catch below: this
    // is a deliberate refusal, and routing it through a handler whose log line
    // says "Unexpected error during authentication/provisioning" would file a
    // decision as a fault.
    if (!email.trim()) {
      console.error(
        `[AuthMiddleware] IDENTITY_EMAIL_MISSING: identity ${userId} authenticated with no ` +
          `email address. Refusing rather than writing '' into User.email, which is unique ` +
          `and NOT NULL — see IdentityEmailMissingError. Nothing was written.`
      );
      return next(new IdentityEmailMissingError());
    }

    // SaaS Flow: Ensure the user exists and has at least one Organization.
    const dbUser = await ensureUser(userId, email);

    let organizationId: string;

    if (dbUser.memberships.length === 0) {
      // userId, not email. This line means "a first-time user is being
      // provisioned"; the Supabase UUID identifies them for every downstream
      // lookup and is already the key ensureUser/ensureOrganization work from.
      // The email added nothing the UUID does not, and it put an address in
      // stdout on every genuine first login.
      console.log(`[AuthMiddleware] Provisioning default organization for user: ${userId}`);
      const { organizationId: orgId, created } = await ensureOrganization(userId);
      organizationId = orgId;

      // Best-effort, one-time welcome email. Reached ONLY when WE actually
      // created the org on genuine first-time provisioning — never on the race
      // recovery path (created === false), where the winner provisions and is
      // the one that sends. Pre-existing users always have a membership and
      // never enter this branch, so they are never emailed. The helper awaits
      // only its atomic claim (a fast UPDATE) and fires the actual send
      // detached; it never throws, so the auth response below is unaffected by
      // any email outcome (sent/skipped/failed).
      if (created) {
        await sendWelcomeEmailOnce(userId, email);
      }
    } else {
      // For MVP, just use the first organization found.
      organizationId = dbUser.memberships[0].organizationId;
    }

    req.user = {
      id: userId,
      email,
      organizationId
    };

    next();
  } catch (error: any) {
    // `error?.message` was the whole payload here, and for a Prisma known error
    // the message can be whitespace-only while `code`/`meta` sit on the object —
    // which is exactly how this line logged a bare label all day on 2026-08-24.
    // The bounded projection reads the object, and collapses to one line so the
    // label can never be separated from its content by a newline in the payload.
    console.error(
      `[AuthMiddleware] Unexpected error during authentication/provisioning: ${formatErrorForLog(error)}`
    );
    return next(error);
  }
};
