import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  readAppleConfig,
  mintClientSecret,
  revokeAppleAuthorization,
  APPLE_TOKEN_URL,
  APPLE_REVOKE_URL,
} from '../src/services/appleRevocationService';

// ============================================================================
// Sign in with Apple revocation, with Apple replaced by a fetch double. What
// is pinned: the client secret's shape (Apple rejects anything else with
// invalid_client), the two calls and their bodies, the four outcomes, and
// that neither the code nor a token nor the key ever reaches a log line.
// ============================================================================

const pair = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const PEM = pair.privateKey;
const PUB = pair.publicKey;

const ENV = {
  APPLE_TEAM_ID: 'NQ23SMHXJV',
  APPLE_CLIENT_ID: 'com.scanaction.app',
  APPLE_SIWA_KEY_ID: 'KEYID12345',
  APPLE_SIWA_PRIVATE_KEY: PEM,
};
const CODE = 'c0de.from.the.apple.sheet.ABCDEF';

type Call = { url: string; body: URLSearchParams };
function appleDouble(script: Array<{ status: number; json: unknown } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    const next = script.shift();
    if (!next) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.json } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('readAppleConfig', () => {
  it('needs all four variables (positive control: the full set reads back)', () => {
    expect(readAppleConfig(ENV)).toMatchObject({ teamId: 'NQ23SMHXJV', clientId: 'com.scanaction.app', keyId: 'KEYID12345' });
    for (const k of Object.keys(ENV)) expect(readAppleConfig({ ...ENV, [k]: '' }), k).toBeNull();
  });
  it('accepts a key whose newlines were pasted as the two characters backslash-n', () => {
    const escaped = PEM.replace(/\n/g, '\\n');
    expect(readAppleConfig({ ...ENV, APPLE_SIWA_PRIVATE_KEY: escaped })!.privateKey).toBe(PEM.trim());
  });
});

describe('mintClientSecret', () => {
  it('is an ES256 JWT with kid, iss = team, sub = client, aud = Apple, five minutes long, verifiable with the public key', () => {
    const now = new Date('2026-09-30T00:00:00Z');
    const secret = mintClientSecret(readAppleConfig(ENV)!, now);
    // Verified at the minting instant, not at the wall clock: without
    // clockTimestamp this test passed only until 2026-09-30T00:05Z, five
    // minutes after the fixed `now`, and went red on main the same morning.
    const decoded = jwt.verify(secret, PUB, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'NQ23SMHXJV',
      clockTimestamp: Math.floor(now.getTime() / 1000),
    }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('com.scanaction.app');
    expect(decoded.exp! - decoded.iat!).toBe(300);
    const header = JSON.parse(Buffer.from(secret.split('.')[0], 'base64url').toString());
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEYID12345' });
  });
});

describe('revokeAppleAuthorization', () => {
  it('success: exchanges the code, revokes the refresh token, and reports ok', async () => {
    const apple = appleDouble([
      { status: 200, json: { access_token: 'acc-1', refresh_token: 'ref-1', id_token: 'x.y.z' } },
      { status: 200, json: {} },
    ]);
    const out = await revokeAppleAuthorization(CODE, { fetchImpl: apple.fetchImpl, env: ENV });
    expect(out).toEqual({ ok: true });
    expect(apple.calls.map((c) => c.url)).toEqual([APPLE_TOKEN_URL, APPLE_REVOKE_URL]);
    const exchange = apple.calls[0].body;
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('code')).toBe(CODE);
    expect(exchange.get('client_id')).toBe('com.scanaction.app');
    expect(exchange.get('client_secret')!.split('.')).toHaveLength(3);
    const revoke = apple.calls[1].body;
    expect(revoke.get('token')).toBe('ref-1');
    expect(revoke.get('token_type_hint')).toBe('refresh_token');
    expect(revoke.get('client_id')).toBe('com.scanaction.app');
  });

  it('falls back to the access token when Apple returns no refresh token', async () => {
    const apple = appleDouble([{ status: 200, json: { access_token: 'acc-only' } }, { status: 200, json: {} }]);
    await revokeAppleAuthorization(CODE, { fetchImpl: apple.fetchImpl, env: ENV });
    expect(apple.calls[1].body.get('token')).toBe('acc-only');
    expect(apple.calls[1].body.get('token_type_hint')).toBe('access_token');
  });

  it('Apple refuses the code: exchange_refused with the status and the one-word error, no revoke call', async () => {
    const apple = appleDouble([{ status: 400, json: { error: 'invalid_grant', error_description: 'The code has expired.' } }]);
    const out = await revokeAppleAuthorization(CODE, { fetchImpl: apple.fetchImpl, env: ENV });
    expect(out).toEqual({ ok: false, reason: 'exchange_refused', status: 400, error: 'invalid_grant' });
    expect(apple.calls).toHaveLength(1);
  });

  it('Apple refuses the revoke: revoke_refused with the status', async () => {
    const apple = appleDouble([{ status: 200, json: { refresh_token: 'ref-1' } }, { status: 400, json: { error: 'invalid_request' } }]);
    const out = await revokeAppleAuthorization(CODE, { fetchImpl: apple.fetchImpl, env: ENV });
    expect(out).toEqual({ ok: false, reason: 'revoke_refused', status: 400 });
  });

  it('network failure on either call: the outcome is network, never a throw', async () => {
    const first = appleDouble([new Error('getaddrinfo ENOTFOUND appleid.apple.com')]);
    await expect(revokeAppleAuthorization(CODE, { fetchImpl: first.fetchImpl, env: ENV })).resolves.toEqual({
      ok: false, reason: 'network', message: 'getaddrinfo ENOTFOUND appleid.apple.com',
    });
    const second = appleDouble([{ status: 200, json: { refresh_token: 'ref-1' } }, new Error('socket hang up')]);
    await expect(revokeAppleAuthorization(CODE, { fetchImpl: second.fetchImpl, env: ENV })).resolves.toMatchObject({ ok: false, reason: 'network' });
  });

  it('not configured: reports so without calling Apple', async () => {
    const apple = appleDouble([]);
    const out = await revokeAppleAuthorization(CODE, { fetchImpl: apple.fetchImpl, env: { ...ENV, APPLE_SIWA_KEY_ID: '' } });
    expect(out).toEqual({ ok: false, reason: 'not_configured' });
    expect(apple.calls).toHaveLength(0);
  });

  it('no outcome carries the code, a token or the key (what a caller may log)', async () => {
    const outcomes = await Promise.all([
      revokeAppleAuthorization(CODE, { fetchImpl: appleDouble([{ status: 200, json: { refresh_token: 'ref-SECRET' } }, { status: 200, json: {} }]).fetchImpl, env: ENV }),
      revokeAppleAuthorization(CODE, { fetchImpl: appleDouble([{ status: 400, json: { error: 'invalid_grant', code: CODE } }]).fetchImpl, env: ENV }),
      revokeAppleAuthorization(CODE, { fetchImpl: appleDouble([{ status: 200, json: { refresh_token: 'ref-SECRET' } }, { status: 500, json: {} }]).fetchImpl, env: ENV }),
    ]);
    const text = JSON.stringify(outcomes);
    expect(text).not.toContain(CODE);
    expect(text).not.toContain('ref-SECRET');
    expect(text).not.toContain('PRIVATE KEY');
    // positive control: the same serialisation does carry the reason words
    expect(text).toContain('exchange_refused');
    expect(text).toContain('revoke_refused');
  });
});
