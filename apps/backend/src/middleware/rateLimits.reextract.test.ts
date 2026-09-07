import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reextractOrgLimiter } from './rateLimits';

// ============================================================================
// reextractOrgLimiter — the brake that ships WITH its trigger.
// ============================================================================
// POST /api/documents/:id/reextract triggers a paid Gemini extraction. Until the
// retry button existed, the route was unmetered but unreachable — nothing in the
// app called it. The button is what makes an unmetered paid call reachable from
// a tap, so the limiter lands in the same change, not after it.
//
// The conditional claim inside the controller already prevents hammering ONE
// document (the second caller loses the claim and gets 409). It does nothing
// about a sweep across MANY documents, which is precisely what a limiter is for.
//
// Shape copied from uploadOrgLimiter: org-keyed, IPv6-safe IP fallback, same
// RATE_LIMITED envelope. Cap is deliberately tight — re-extraction is a recovery
// action, not a workflow.
// ============================================================================

// Drives the middleware directly. express-rate-limit's handler is a plain
// (req, res, next), so no HTTP server and no new dependency is needed.
function fakeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = String(v);
      return this;
    },
    getHeader(k: string) {
      return this.headers[k];
    },
    removeHeader(k: string) {
      delete this.headers[k];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    send(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const hit = (organizationId: string, ip = '203.0.113.7') =>
  new Promise<{ res: any; passed: boolean }>(resolve => {
    const req: any = { ip, user: { organizationId }, headers: {}, method: 'POST', url: '/x' };
    const res = fakeRes();
    let settled = false;
    const done = (passed: boolean) => {
      if (!settled) {
        settled = true;
        resolve({ res, passed });
      }
    };
    // next() => under the limit. A response written instead => blocked.
    const next = () => done(true);
    const origStatus = res.status.bind(res);
    res.status = (code: number) => {
      origStatus(code);
      if (code === 429) setTimeout(() => done(false), 0);
      return res;
    };
    Promise.resolve(reextractOrgLimiter(req, res, next)).then(() => {
      setTimeout(() => done(res.statusCode !== 429), 0);
    });
  });

describe('reextractOrgLimiter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('is exported as middleware', () => {
    expect(typeof reextractOrgLimiter).toBe('function');
  });

  it('allows a normal recovery burst and then blocks with 429', async () => {
    const org = `org-burst-${Math.random()}`;
    let blockedAt = -1;

    // Well past any plausible human recovery session. If the cap were absent
    // this loop would never block and the test fails on blockedAt === -1.
    for (let i = 1; i <= 60; i++) {
      const { passed } = await hit(org);
      if (!passed) {
        blockedAt = i;
        break;
      }
    }

    expect(blockedAt).toBeGreaterThan(0);
    // Tight: a recovery action, not a workflow. A handful of retries is normal;
    // dozens is a script.
    expect(blockedAt).toBeLessThanOrEqual(31);
  });

  it('keys per ORGANIZATION — one org exhausting its budget does not block another', async () => {
    const noisy = `org-noisy-${Math.random()}`;
    const quiet = `org-quiet-${Math.random()}`;

    let noisyBlocked = false;
    for (let i = 1; i <= 60; i++) {
      const { passed } = await hit(noisy);
      if (!passed) {
        noisyBlocked = true;
        break;
      }
    }
    expect(noisyBlocked).toBe(true);

    // Same IP, different org: must still be allowed. This is what proves the
    // key is the organization and not the address.
    const other = await hit(quiet);
    expect(other.passed).toBe(true);
  });

  it('answers a blocked request with the shared RATE_LIMITED envelope', async () => {
    const org = `org-envelope-${Math.random()}`;
    let blocked: any = null;

    for (let i = 1; i <= 60; i++) {
      const { res, passed } = await hit(org);
      if (!passed) {
        blocked = res;
        break;
      }
    }

    expect(blocked).not.toBeNull();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'RATE_LIMITED' });
    expect(typeof blocked.body.message).toBe('string');
  });

  it('falls back to the IP when there is no authenticated org', async () => {
    // Defensive: the route sits behind authMiddleware so req.user is normally
    // set, but the limiter must not throw (or key everything together under
    // `undefined`) if it ever is not.
    const req: any = { ip: '198.51.100.9', headers: {}, method: 'POST', url: '/x' };
    const res = fakeRes();
    let called = false;
    await Promise.resolve(reextractOrgLimiter(req, res, () => { called = true; }));
    expect(called).toBe(true);
  });
});
