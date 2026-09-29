import jwt from 'jsonwebtoken';

// ============================================================================
// Sign in with Apple: revoke a user's authorization when the account is deleted.
//
// Apple ("Offering account deletion in your app", read 2026-09-26): apps that
// support Sign in with Apple should use the Sign in with Apple REST API to
// revoke user tokens. Revoking needs a token Apple issued for THIS app and THIS
// user, and the only way to get one is to exchange an authorization code from a
// fresh Sign in with Apple. The app never kept one: sign-in hands Apple's ID
// token to Supabase and drops the code. So deletion on iOS asks for one more
// Apple sheet, the client sends the code with DELETE /api/account, and this
// service does the two calls Apple documents:
//
//   POST https://appleid.apple.com/auth/token   code -> access + refresh token
//   POST https://appleid.apple.com/auth/revoke  refresh token -> 200
//
// Both calls authenticate the app with a client secret: an ES256 JWT signed
// with the Sign in with Apple key (APPLE_SIWA_PRIVATE_KEY, key id
// APPLE_SIWA_KEY_ID), issued by the team (APPLE_TEAM_ID), for the client that
// Apple put in the code's audience: the bundle id for a native sheet
// (APPLE_CLIENT_ID = com.scanaction.app). Minted per call, five minutes long;
// Apple allows up to six months, and there is no reason to mint one that lives
// longer than the request that uses it.
//
// NOTHING IS STORED. The code lives for five minutes and is single-use; the
// tokens Apple returns are used once and dropped. Nothing here is logged
// beyond a reason word and an HTTP status: not the code, not a token, not the
// secret, not Apple's response body verbatim.
//
// The caller decides what a failure means for the deletion. This service only
// reports one of four outcomes.
// ============================================================================

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export type RevocationOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'exchange_refused'; status: number; error?: string }
  | { ok: false; reason: 'revoke_refused'; status: number }
  | { ok: false; reason: 'network'; message: string };

interface AppleConfig {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKey: string;
}

/** The four variables, or null when any is missing. Read per call, never cached,
 *  so a rotation in Railway takes effect on the next request. */
export function readAppleConfig(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const clientId = env.APPLE_CLIENT_ID?.trim();
  const keyId = env.APPLE_SIWA_KEY_ID?.trim();
  // Railway keeps the PEM's newlines; a copy pasted with literal "\n" is
  // accepted too, since both spell the same key.
  const privateKey = env.APPLE_SIWA_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!teamId || !clientId || !keyId || !privateKey) return null;
  return { teamId, clientId, keyId, privateKey };
}

export const appleRevocationConfigured = (): boolean => readAppleConfig() !== null;

/** Apple's client secret: ES256, kid = the key id, iss = team, sub = client, aud = Apple. */
export function mintClientSecret(config: AppleConfig, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  return jwt.sign({ iat, exp: iat + 5 * 60 }, config.privateKey, {
    algorithm: 'ES256',
    keyid: config.keyId,
    issuer: config.teamId,
    subject: config.clientId,
    audience: 'https://appleid.apple.com',
  });
}

const form = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

const post = (url: string, body: string, fetchImpl: typeof fetch) =>
  fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });

/**
 * Exchange a fresh authorization code and revoke the tokens it yields.
 * Never throws: every failure is an outcome the caller can record.
 */
export async function revokeAppleAuthorization(
  authorizationCode: string,
  deps: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {}
): Promise<RevocationOutcome> {
  const config = readAppleConfig(deps.env);
  if (!config) return { ok: false, reason: 'not_configured' };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const clientSecret = mintClientSecret(config);

  let tokenRes: Response;
  try {
    tokenRes = await post(
      APPLE_TOKEN_URL,
      form({ client_id: config.clientId, client_secret: clientSecret, code: authorizationCode, grant_type: 'authorization_code' }),
      fetchImpl
    );
  } catch (err) {
    return { ok: false, reason: 'network', message: err instanceof Error ? err.message : String(err) };
  }
  if (!tokenRes.ok) {
    // Apple's error body is {"error":"invalid_grant"} and the like: one word,
    // no user data. Anything else in it stays out of the outcome.
    const body = (await tokenRes.json().catch(() => ({}))) as { error?: unknown };
    const error = typeof body.error === 'string' ? body.error.slice(0, 40) : undefined;
    return { ok: false, reason: 'exchange_refused', status: tokenRes.status, error };
  }
  const tokens = (await tokenRes.json().catch(() => ({}))) as { refresh_token?: unknown; access_token?: unknown };
  const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;
  const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : null;
  const token = refreshToken ?? accessToken;
  if (!token) return { ok: false, reason: 'exchange_refused', status: tokenRes.status, error: 'no_token_in_response' };

  let revokeRes: Response;
  try {
    revokeRes = await post(
      APPLE_REVOKE_URL,
      form({
        client_id: config.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: refreshToken ? 'refresh_token' : 'access_token',
      }),
      fetchImpl
    );
  } catch (err) {
    return { ok: false, reason: 'network', message: err instanceof Error ? err.message : String(err) };
  }
  if (!revokeRes.ok) return { ok: false, reason: 'revoke_refused', status: revokeRes.status };
  return { ok: true };
}
