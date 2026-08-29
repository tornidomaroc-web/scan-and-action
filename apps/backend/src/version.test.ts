import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

// ============================================================================
// GET /api/version — the two controls that make the instrument falsifiable
// ============================================================================
// This route exists so that "the backend is running commit X" stops resting on
// a deployment dashboard, which is well-formed, confident and quotable and
// prompts no second look. Replacing one unfalsifiable source with another would
// be no gain at all, so the route ships with the controls that can show it
// wrong:
//
//   NEGATIVE CONTROL — with no commit in the environment it must report 503 and
//   `{"commit":null}`. It must never manufacture a value, and must never answer
//   200 with a placeholder string, because a 200 is what a reader skims past.
//
//   POSITIVE CONTROL — with a commit in the environment that is NOT this repo's
//   HEAD, it must return exactly that. This is what proves the source reads the
//   environment rather than a constant compiled into the artifact.
//
// SCOPE OF WHAT THESE PROVE. They constrain the SOURCE in this repository. They
// say nothing about whether the platform injects a value that tracks the
// deployment — that hypothesis is only testable across two deploys, when a
// route that already exists is observed still serving the old commit before it
// flips, and it is untested until then. Do not cite this file for it.
//
// The app is booted on a real socket rather than the handler being called with
// a fake req/res, because two of the properties under test are properties of
// the MOUNT, not of the handler: that the route answers with no Authorization
// header (it sits above the `/api` auth mount in app.ts — move it below and
// these tests go red), and that the response carries no ETag.
// ============================================================================

// Booting the real app imports the whole route tree, and a few modules assert
// their configuration at import time (e.g. services/storage/getSignedFileUrl).
// `vi.hoisted` runs before the hoisted `import app` below, which plain
// statements would not. These are placeholders for module-load checks only —
// the Supabase client itself is mocked immediately below and no network call is
// made by anything this file exercises.
vi.hoisted(() => {
  process.env.SUPABASE_URL ||= 'http://localhost/supabase-not-used-in-this-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-not-used-in-this-test';
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: vi.fn() } }),
}));
vi.mock('./prismaClient', () => ({ prisma: {} }));

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from './app';

const VAR = 'RAILWAY_GIT_COMMIT_SHA';

// Deliberately synthetic and deliberately not this repo's HEAD (6abbefd...).
// If the route ever returns something else while this is set, it is not reading
// the environment.
const SYNTHETIC_SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

let server: Server;
let base: string;
const original = process.env[VAR];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  if (original === undefined) delete process.env[VAR];
  else process.env[VAR] = original;
});

// No Authorization header anywhere in this file — that omission is the point.
const get = () => fetch(`${base}/api/version`);

describe('GET /api/version', () => {
  it('NEGATIVE CONTROL: reports 503 and a null commit rather than inventing one', async () => {
    // One control, several ways of having nothing usable: absent entirely, and
    // the near-misses that a fallback chain or a loose check would wave through.
    const unusable = [
      undefined, // the variable is not set at all
      '', // set but empty
      'unknown', // a placeholder someone typed in
      '6abbefd', // an abbreviated sha — the shape a human would paste
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbee', // 39 chars
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefa', // 41 chars
      'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // uppercase; Railway emits lowercase
      ` ${SYNTHETIC_SHA} `, // padded
      `${SYNTHETIC_SHA}\n`, // trailing newline, as a shell would leave it
    ];

    for (const value of unusable) {
      if (value === undefined) delete process.env[VAR];
      else process.env[VAR] = value;

      const res = await get();

      expect(res.status, `input: ${JSON.stringify(value)}`).toBe(503);
      expect(await res.json()).toEqual({ commit: null });
    }
  });

  it('POSITIVE CONTROL: returns exactly the commit in the environment, publicly and uncacheably', async () => {
    process.env[VAR] = SYNTHETIC_SHA;

    const res = await get();

    // 200 with no Authorization header sent: the route is above the auth mount.
    expect(res.status).toBe(200);

    // Exactly the environment's value — not HEAD, not a constant, not a prefix.
    expect(await res.json()).toEqual({ commit: SYNTHETIC_SHA });

    // Nothing else in the body. A version route that also reports the
    // environment name, database reachability or uptime is a different, larger
    // thing with a different threat model.
    expect(Object.keys(await (await get()).json())).toEqual(['commit']);

    // Uncacheable, and no validator for an intermediary to revalidate against:
    // a 304 here would serve a stale commit, which is the one failure mode this
    // route exists to prevent.
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
  });
});
