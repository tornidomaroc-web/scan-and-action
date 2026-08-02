/**
 * Password policy — ONE number, both screens.
 *
 * WHY THIS MODULE EXISTS. Until this commit the minimum lived as a local
 * constant in screens/ResetPasswordScreen.tsx and the signup path in
 * screens/AuthScreen.tsx had no length check at all. The app therefore enforced
 * 8 on reset and nothing on signup, so a user could create an account with a
 * 6-character password and then be refused that same password at reset time.
 * The number is shared from here so the two screens cannot drift apart again;
 * a future divergence has to be a deliberate act, not an omission.
 *
 * D1: the catalog states this number in WORDS (passwordTooShort) rather than
 * interpolating it, so no digit is spliced into Arabic at render time.
 * resetPasswordLocalization.test.tsx pins the constant and the three catalog
 * strings together, so neither can move without the other.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * What the PLATFORM enforces on the signup path — OBSERVED, not read off a
 * settings page.
 *
 * The dashboard minimum (Authentication -> Sign In/Providers -> Email) was
 * raised 6 -> 8 on 2026-08-02. The field reading alone would NOT justify this
 * constant: a settings page is a claim about behaviour, not the behaviour. It
 * was therefore exercised directly against production the same day, unminified
 * and without the browser, using VITE_SUPABASE_ANON_KEY from apps/frontend/.env:
 *
 *   POST /auth/v1/signup  {"password":"abc123"}  (six characters)
 *   -> HTTP 422
 *      {"code":422,"error_code":"weak_password",
 *       "msg":"Password should be at least 8 characters.",
 *       "weak_password":{"reasons":["length"]}}
 *
 * That is the real signup endpoint our browser client calls, answering with our
 * number. Enforcement is observed. No account was created (422), so the probe
 * left nothing behind. Re-run that one curl to re-verify; it is cheap, it needs
 * no dashboard access, and it beats reading the field again.
 *
 * WHAT IS NOT ENFORCED, also observed 2026-08-02: creating a user from
 * Authentication -> Users with a SIX-character password SUCCEEDED while this
 * setting read 8. The admin API bypasses the project password policy. So this
 * constant describes the anon signup path — the only path our app can reach —
 * and says nothing about service-role writes.
 *
 * IT IS STILL NOT PINNED BY THIS COMMIT. It is dashboard configuration: it
 * moved yesterday through a web UI with no PR, no test and no revert trail,
 * exactly like the GitHub-side state quarantined in
 * docs/OPEN_ITEMS_RECON_2026-07-31.md section 6. The observation above has a
 * date on it for that reason.
 *
 * THIS DOES NOT MAKE AuthScreen's CHECK REDUNDANT — do not delete it on the
 * strength of this number being equal to MIN_PASSWORD_LENGTH. Three reasons,
 * because the equality is exactly the argument a future reader will make:
 *   1. The client check renders the CATALOG string in the user's language.
 *      Deleting it trades a localized in-place error for a round-trip and an
 *      English server sentence. That was the point of #132.
 *   2. This number is one dashboard visit from being 6 again, and nothing in
 *      CI would notice. The client check is the layer that cannot silently move.
 *   3. Without it, weak_password becomes the first thing a signing-up user
 *      meets, and the signup/reset asymmetry #132 closed reopens.
 */
export const PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH = 8;

/**
 * The shortest password a REAL EXISTING ACCOUNT can have. Frozen history — not
 * a policy, and never again a copy of the number above.
 *
 * Accounts were created against the old 6-character minimum before 2026-08-02.
 * Raising a dashboard field does not retroactively lengthen anybody's password,
 * so those accounts still exist at six characters and must still be able to
 * SIGN IN. That was confirmed on production, not assumed: an account holding
 * the six-character password `abc123` signed in successfully on 2026-08-02
 * while the dashboard minimum read 8. The minimum applies when a password is
 * SET (signup, updateUser, recovery) and never when one is VERIFIED, so the
 * raise locked nobody out. Observed, no longer inferred from reading GoTrue.
 *
 * WHY THIS IS A SEPARATE CONSTANT. Until 2026-08-02 this number and the
 * platform minimum were both 6, and one constant served both jobs. The
 * dashboard change split them, and they must never be re-merged: the
 * authPasswordLength.test.tsx sign-in tests use THIS number to prove the login
 * path is not gated on length. Raise it to match the platform and those tests
 * start typing a password that is already long enough to pass
 * MIN_PASSWORD_LENGTH — they would keep passing while asserting nothing, and
 * the only guard against locking every legacy user out of their own account
 * would be silently gone. Both files assert against that; see the vacuity
 * guard inside the sign-in test and the tripwire at the bottom of it.
 *
 * WHAT WOULD LET THIS MOVE — and why it is harder than it sounds. Not an
 * audit: passwords are stored as bcrypt hashes, so nothing can measure how
 * long any existing password is, and no query will ever tell you whether a
 * short one is still out there. The only sound method is a cohort force-reset
 * of every account with created_at before 2026-08-02, which is a product
 * decision (it logs real users out and mails them all) rather than a cleanup.
 * Until that has actually run, this is 6 forever. Treat any argument that
 * "there probably aren't any left" as unfalsifiable, because it is.
 */
export const SHORTEST_EXISTING_PASSWORD_LENGTH = 6;
