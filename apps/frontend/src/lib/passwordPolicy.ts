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
 * What the PLATFORM actually enforces — NOT what we require.
 *
 * Read from the Supabase dashboard (Authentication -> Sign In/Providers ->
 * Email) on 2026-08-01: minimum password length 6 (the Supabase default, never
 * raised), "Password requirements" unset so there is no character-class rule,
 * and "Prevent use of leaked passwords" off and unavailable on our plan.
 *
 * NOT PINNED BY THIS COMMIT. It is dashboard configuration: it can be changed
 * through a web UI without a line of code moving, exactly like the GitHub-side
 * state quarantined in docs/OPEN_ITEMS_RECON_2026-07-31.md section 6. Re-read
 * it before relying on it.
 *
 * This constant validates nothing, deliberately. It exists so that the gap is
 * recorded in the same file as the 8: MIN_PASSWORD_LENGTH is what OUR screens
 * require, and it is NOT what production enforces. Signup calls Supabase
 * directly from the browser (there is no backend auth surface at all), so the
 * check in AuthScreen is a constraint on a choice, not an enforcement boundary.
 * The only person who can route around it is the account owner, and the only
 * account weakened is their own — but the repository must not be read as
 * claiming 8 is enforced when 6 is.
 *
 * CLOSING THE GAP is a dashboard change, not a code change, and it is
 * deliberately deferred: raising the number takes effect in production
 * instantly, outside any PR, with no test, no review and no revert trail. The
 * minimum applies when a password is SET (signup, updateUser, recovery), never
 * when one is VERIFIED at sign-in, so raising it locks nobody out — but that
 * reading is worth confirming empirically before it is trusted: sign up a
 * throwaway account with a 6-character password, raise the setting to 8,
 * confirm the throwaway still signs in, then keep or revert on the spot.
 */
export const PLATFORM_ENFORCED_MIN_PASSWORD_LENGTH = 6;
