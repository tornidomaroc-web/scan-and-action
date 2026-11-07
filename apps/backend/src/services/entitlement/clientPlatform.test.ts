import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlanType } from '@prisma/client';

// ============================================================================
// THE iOS APP IS HELD TO THE FREE TIER; THE WEB AND ANDROID ARE NOT.
// ============================================================================
// The matrix: Origin x X-Client-Platform x stored plan, read through
// effectivePlan, and then through the three places that serve a plan (the
// upload gate, the stats payload, GET /user/me).
//
// The control that makes this a test: a PRO workspace read from the web
// origin must stay PRO and must pass the upload gate at 192 scans. A clamp
// applied to everyone turns those rows red; a clamp applied to no one turns
// the iOS rows red.
// ============================================================================

const mocks = vi.hoisted(() => ({
  orgFindUnique: vi.fn(),
  docCount: vi.fn(),
  docCreate: vi.fn(),
  uploadToSupabase: vi.fn(),
  processUploadAsync: vi.fn(),
}));

vi.mock('../../prismaClient', () => ({
  prisma: {
    organization: { findUnique: mocks.orgFindUnique },
    document: {
      count: mocks.docCount,
      create: mocks.docCreate,
      update: vi.fn(),
      aggregate: vi.fn(async () => ({ _avg: { overallConfidence: 0.9 } })),
    },
  },
}));
vi.mock('../dashboardStatsService', () => ({
  computeDashboardAnalytics: vi.fn(async () => ({ statusBreakdown: {}, monthlySeries: [], periods: {} })),
}));
vi.mock('../storage/getSignedFileUrl', () => ({ getSignedFileUrl: vi.fn() }));
vi.mock('../ruleEngineService', () => ({ RuleEngineService: class {} }));
vi.mock('../storage/supabaseStorage', () => ({ uploadToSupabase: mocks.uploadToSupabase, downloadFromSupabase: vi.fn() }));
vi.mock('../ingestion/ingestionService', () => ({
  IngestionService: class { processUploadAsync = mocks.processUploadAsync; },
}));

import { effectivePlan, isIOSAppRequest } from './clientPlatform';
import { UploadController } from '../../controllers/uploadController';
import userRoutes from '../../routes/userRoutes';
import { DocumentController } from '../../controllers/documentController';

const ORIGINS = {
  iosApp: 'capacitor://localhost',
  androidApp: 'https://localhost',
  web: 'https://www.scan-action.com',
  none: undefined,
} as const;
const PLATFORM_HEADER = { ios: 'ios', iosUpper: 'iOS', android: 'android', none: undefined } as const;
const STORED: PlanType[] = ['FREE', 'PRO', 'ENTERPRISE'];

function req(origin?: string, platform?: string, extra: Record<string, unknown> = {}): any {
  const headers: Record<string, string> = {};
  if (origin !== undefined) headers.origin = origin;
  if (platform !== undefined) headers['x-client-platform'] = platform;
  return { headers, user: { id: 'u-1', email: 'u@example.com', organizationId: 'org-1' }, ...extra };
}

function res(): any {
  const r: any = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}

describe('effectivePlan: the full matrix', () => {
  for (const [oName, origin] of Object.entries(ORIGINS)) {
    for (const [hName, platform] of Object.entries(PLATFORM_HEADER)) {
      for (const stored of STORED) {
        const ios = origin === ORIGINS.iosApp || platform === 'ios' || platform === 'iOS';
        const want: PlanType = ios ? 'FREE' : stored;
        it(`origin=${oName} header=${hName} stored=${stored} -> ${want}`, () => {
          expect(isIOSAppRequest(req(origin, platform))).toBe(ios);
          expect(effectivePlan(stored, req(origin, platform))).toBe(want);
        });
      }
    }
  }

  it('a missing stored plan reads FREE on every platform, as before', () => {
    expect(effectivePlan(null, req(ORIGINS.web))).toBe('FREE');
    expect(effectivePlan(undefined, req(ORIGINS.iosApp))).toBe('FREE');
  });

  it('CONTROL: the iOS signals are exact, not substrings', () => {
    expect(isIOSAppRequest(req('capacitor://localhost.evil.com'))).toBe(false);
    expect(isIOSAppRequest(req('https://capacitor.localhost'))).toBe(false);
    expect(isIOSAppRequest(req(undefined, 'ios-ish'))).toBe(false);
  });

  it('a request object with no headers at all reads the stored plan (Rule 5)', () => {
    expect(effectivePlan('PRO', { } as any)).toBe('PRO');
  });
});

describe('the upload gate serves the effective plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docCount.mockResolvedValue(0);
    mocks.uploadToSupabase.mockResolvedValue('uploads/x.jpg');
    mocks.docCreate.mockResolvedValue({ id: 'doc-1' });
    mocks.processUploadAsync.mockResolvedValue(undefined);
  });

  async function upload(origin: string | undefined, platform: string | undefined, plan: PlanType, scanCount: number) {
    mocks.orgFindUnique.mockResolvedValue({ plan, scanCount });
    const r = res();
    await UploadController.uploadDocument(
      req(origin, platform, { file: { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1, originalname: 'r.jpg' } }),
      r,
      vi.fn() as any,
    );
    return r;
  }

  it('CONTROL: a PRO workspace on the web passes the gate at 192 scans', async () => {
    const r = await upload(ORIGINS.web, undefined, 'PRO', 192);
    expect(r.status).not.toHaveBeenCalledWith(403);
    expect(mocks.uploadToSupabase).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a PRO workspace in the Android app passes the gate at 192 scans', async () => {
    const r = await upload(ORIGINS.androidApp, 'android', 'PRO', 192);
    expect(r.status).not.toHaveBeenCalledWith(403);
    expect(mocks.uploadToSupabase).toHaveBeenCalledTimes(1);
  });

  for (const [label, origin, platform] of [
    ['Origin capacitor://localhost', ORIGINS.iosApp, undefined],
    ['X-Client-Platform ios with no Origin', undefined, 'ios'],
    ['both signals', ORIGINS.iosApp, 'ios'],
  ] as const) {
    for (const stored of ['PRO', 'ENTERPRISE'] as PlanType[]) {
      it(`the iOS app (${label}) is stopped at 10 scans even when ${stored} is stored`, async () => {
        const r = await upload(origin, platform, stored, 192);
        expect(r.status).toHaveBeenCalledWith(403);
        expect(r.json).toHaveBeenCalledWith({ error: 'LIMIT_REACHED', message: 'Scan limit reached (10 scans).' });
        expect(mocks.uploadToSupabase).not.toHaveBeenCalled();
      });
    }
  }

  it('the iOS app below 10 scans uploads normally', async () => {
    const r = await upload(ORIGINS.iosApp, 'ios', 'PRO', 6);
    expect(r.status).not.toHaveBeenCalledWith(403);
    expect(mocks.uploadToSupabase).toHaveBeenCalledTimes(1);
  });

  it('a FREE workspace on the web is still stopped at 10, with the neutral message (fix 4)', async () => {
    const r = await upload(ORIGINS.web, undefined, 'FREE', 10);
    expect(r.status).toHaveBeenCalledWith(403);
    const body = r.json.mock.calls[0][0];
    expect(body.error).toBe('LIMIT_REACHED');
    expect(body.message).not.toMatch(/upgrade|pro\b/i);
  });

  it('the PRO daily cap still applies on the web', async () => {
    mocks.docCount.mockResolvedValue(200);
    const r = await upload(ORIGINS.web, undefined, 'PRO', 50);
    expect(r.status).toHaveBeenCalledWith(429);
  });

  it('the gate never writes the plan', async () => {
    await upload(ORIGINS.iosApp, 'ios', 'PRO', 192);
    expect(mocks.orgFindUnique).toHaveBeenCalledWith(expect.objectContaining({ select: { plan: true, scanCount: true } }));
  });
});

describe('GET /user/me serves the effective plan and hasActiveBilling', () => {
  const handler = (userRoutes as any).stack.find((l: any) => l.route?.path === '/me').route.stack[0].handle;

  async function me(origin: string | undefined, platform: string | undefined, plan: PlanType, activeSubs: number) {
    mocks.orgFindUnique.mockResolvedValue({ plan, subscriptions: Array.from({ length: activeSubs }, (_, i) => ({ id: `s${i}` })) });
    const r = res();
    await handler(req(origin, platform), r, vi.fn());
    return r.json.mock.calls[0][0];
  }

  it('CONTROL: PRO on the web reads PRO', async () => {
    expect((await me(ORIGINS.web, undefined, 'PRO', 1)).plan).toBe('PRO');
  });
  it('PRO in the iOS app reads FREE', async () => {
    expect((await me(ORIGINS.iosApp, 'ios', 'PRO', 1)).plan).toBe('FREE');
  });
  it('hasActiveBilling follows the ACTIVE subscription rows, on every platform', async () => {
    expect((await me(ORIGINS.iosApp, 'ios', 'PRO', 1)).hasActiveBilling).toBe(true);
    expect((await me(ORIGINS.web, undefined, 'PRO', 1)).hasActiveBilling).toBe(true);
    expect((await me(ORIGINS.iosApp, 'ios', 'PRO', 0)).hasActiveBilling).toBe(false);
  });
  it('it asks only for ACTIVE subscriptions', async () => {
    await me(ORIGINS.web, undefined, 'PRO', 0);
    const arg = mocks.orgFindUnique.mock.calls.at(-1)![0];
    expect(arg.select.subscriptions.where).toEqual({ status: 'ACTIVE' });
  });
});

describe('GET /documents/stats serves the effective plan', () => {
  async function stats(origin: string | undefined, platform: string | undefined, plan: PlanType) {
    mocks.docCount.mockResolvedValue(3);
    mocks.orgFindUnique.mockResolvedValue({ plan });
    const r = res();
    const rq = req(origin, platform);
    rq.user.organizationId = '22d51116-0000-4000-8000-000000000000';
    await DocumentController.getStats(rq, r, vi.fn() as any);
    expect(r.status).toHaveBeenCalledWith(200);
    return r.json.mock.calls[0][0];
  }

  it('CONTROL: PRO on the web reads PRO', async () => {
    expect((await stats(ORIGINS.web, undefined, 'PRO')).plan).toBe('PRO');
  });
  it('CONTROL: PRO in the Android app reads PRO', async () => {
    expect((await stats(ORIGINS.androidApp, 'android', 'PRO')).plan).toBe('PRO');
  });
  it('PRO in the iOS app reads FREE, by Origin alone and by header alone', async () => {
    expect((await stats(ORIGINS.iosApp, undefined, 'PRO')).plan).toBe('FREE');
    expect((await stats(undefined, 'ios', 'PRO')).plan).toBe('FREE');
  });
});
