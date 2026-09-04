# Production data fix — parking the address held by orphan `1e1c8482`

**Written BEFORE the statement ran.** This file is the durable record the undo
depends on. Nothing in it is a plan; the pre-state below was read from
production and the statement below is the exact text that was executed.

---

## The old address is NOT written down here, deliberately

**This repository is PUBLIC.** Committing a real user's email address to it
would publish that address permanently, in git history, for a person who is
already having a bad experience with this product — and it would contradict the
policy this codebase enforces everywhere else (`redaction.ts` strips addresses
from error payloads; `authMiddleware.ts:34-37` and `:214` deliberately stopped
putting an address and a filename in stdout).

**It does not need to be written down.** The value is preserved byte-identically
on the live auth identity that collides with it, and that identity is untouched
by this change:

| | |
|---|---|
| App row being changed | `1e1c8482-16bb-474c-89d0-5f3e65d1f186` |
| Where the old value survives | `auth.users.email` on `c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae` |
| Verified byte-identical before the write | `u.email = a.email` → **true** |
| Shape, for confirming a recovered value | `fe***@gmail.com`, length **27** |

**Undo, one statement, no PII anywhere:**

```sql
UPDATE "User"
   SET email = (SELECT email FROM auth.users
                 WHERE id = 'c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae')
 WHERE id = '1e1c8482-16bb-474c-89d0-5f3e65d1f186';
```

**The one durability caveat:** the undo is only available while
`c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae` exists in `auth.users`. That identity is
the locked-out user's own live account, so there is no reason to delete it — but
if it is ever deleted, this recovery path goes with it. **Do not delete that
identity.**

---

## Pre-state, read from production before the write

| Fact | Value |
|---|---|
| App row | `1e1c8482-16bb-474c-89d0-5f3e65d1f186`, created 2026-03-24…2026-07-28 window (row created 2026-07-28) |
| Has its own auth identity | **no** — this is what makes it an orphan |
| Memberships | 1 |
| Documents in any org it belongs to | **0** |
| Its organization | solo, FREE, `planOverride` null, 0 subscriptions, 0 documents |
| Address also held by | live identity `c521aa92-…`, confirmed, last sign-in 2026-08-26 15:39 |

## Why this row is being changed

`c521aa92` re-registered on 2026-08-24 at an address that `1e1c8482` still held
in `public."User"`, which is `String @unique` and NOT NULL. `ensureUser` keys on
`id`, so the upsert misses forever and the create violates `User.email` forever:
`IDENTITY_EMAIL_CONFLICT`, and because `authMiddleware` is mounted on the `/api`
prefix (`app.ts:92`), **every** authenticated endpoint fails for them. Locked out
since 2026-08-24 14:36. #171's guard does not reach this — it is the create path,
which #171 deliberately leaves refusing.

Freeing the address ends the collision. Their next authenticated request takes
the create path cleanly and provisions a fresh organization. Their old
organization held nothing, so nothing is lost.

## The parked value, and why it is safe

```
orphan-1e1c8482-16bb-474c-89d0-5f3e65d1f186@parked.invalid
```

- **Unregistrable by construction.** `.invalid` is reserved by **RFC 2606 §2**
  specifically to never resolve. It cannot receive a confirmation link, and this
  project requires email confirmation — proven from the data, not from a
  document: three accounts sit `email_confirmed_at IS NULL` and have **never**
  held a session, while all 28 confirmed accounts have. So no signup can ever
  reach this address, and it can never collide with a future user. This is a
  stricter standard than the domains that disarm the other three orphans:
  `example.com` is a real registered domain that merely declines mail, whereas
  `.invalid` cannot exist at all.
- **Unique by construction.** It embeds the row's own uuid, so it cannot collide
  with another parked value or with anything else in the column.
- **Obviously deliberate.** Anyone scanning the table reads `orphan-…@parked.invalid`
  as an operator action, not as data.

**The tension with #167, named rather than hidden.** #167 argued against writing
a synthetic placeholder into `User.email`. That argument was about an
**automatic, silent, recurring** placeholder written by the request path for
every emailless identity — residue nobody would ever find. This is a **single,
recorded, operator-authorised** action on one dead row, and it is legible
precisely because it looks wrong. The objection stands for the code path and
does not extend to this.

## The statement, guarded

The guard is inside the statement, so a changed world affects **zero** rows
rather than the wrong one. It runs inside a transaction that **rolls back unless
exactly one row is affected**.

```sql
UPDATE "User" u
   SET email = 'orphan-1e1c8482-16bb-474c-89d0-5f3e65d1f186@parked.invalid'
 WHERE u.id = '1e1c8482-16bb-474c-89d0-5f3e65d1f186'
   AND u.email = (SELECT a.email FROM auth.users a
                   WHERE a.id = 'c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae')
   AND NOT EXISTS (SELECT 1 FROM auth.users s WHERE s.id = u.id)
   AND NOT EXISTS (SELECT 1 FROM "Document" d
                    WHERE d."organizationId" IN (SELECT m."organizationId"
                                                   FROM "Membership" m
                                                  WHERE m."userId" = u.id));
```

Each clause asserts a fact this decision rests on: the exact row; that its
address is still the one colliding with `c521aa92`; that it is still an orphan;
and that its organization still holds no documents.

**Row-level DML only. No DDL, no schema change, no Prisma migration.**
`c521aa92` is not touched. The other three orphans are not touched.

## Outcome — executed 2026-09-05

The filename carries 2026-09-04, the date the decision and this record were
written. The statement itself ran just after midnight, on **2026-09-05**. The
file is not renamed, because the name is already referenced from
`LAUNCH_TODO.md` and a stale pointer is worse than a stale date.

```
AFFECTED ROWS: 1
exactly 1 — committing
COMMITTED
```

Run inside an interactive transaction that throws — and therefore rolls back —
on any count other than 1. It did not have to.

### Verified afterwards, read-only, eight checks

| # | Check | Result |
|---|---|---|
| 1 | The parked row | `email = orphan-1e1c8482-…@parked.invalid`; `createdAt 2026-07-28` and `welcomeEmailSentAt` **preserved** |
| 2 | **Global**: live identities whose address is held by a different app row | **1 → 0** |
| 3 | `c521aa92` untouched | same address (length 27, `fe***@gmail.com`), same `created_at`, same `last_sign_in_at`, still confirmed |
| 4 | Undo source intact | length still matches the recorded shape |
| 5 | App row for `c521aa92` | **does not exist yet** |
| 6 | The parked row's organization | unchanged — solo, FREE, 0 documents |
| 7 | The other three orphans | untouched |
| 8 | Totals | `User 31`, `auth.users 31`, `Document 338` — unchanged; nothing created, nothing destroyed |

### What this does NOT prove

**A free address is not a working account.** Check 5 is the honest limit:
nobody has signed in, so no app row exists for `c521aa92` and no request has
exercised the create path. What is proven is the **precondition** — the
collision that refused them is gone, globally, and no other row can now trigger
it. That the create path then succeeds follows from the unique constraint, but
it follows by reasoning, not by observation.

**The only proof of the unlock is their next sign-in**, and it is one query:

```sql
SELECT EXISTS(SELECT 1 FROM "User"
               WHERE id = 'c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae') AS unlocked;
```

`true` means they returned and were provisioned normally. Until then the
correct statement is *"the obstacle is removed"*, never *"the user is fixed"*.
