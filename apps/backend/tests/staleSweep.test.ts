import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/prismaClient', () => ({
  prisma: {
    document: { updateMany: vi.fn() },
  },
}));

import { prisma } from '../src/prismaClient';
import {
  sweepStaleProcessing,
  isStaleProcessing,
  STALE_PROCESSING_THRESHOLD_MS,
} from '../src/services/staleSweepService';

const NOW = new Date('2026-06-13T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

describe('isStaleProcessing — what the sweep may touch', () => {
  it('a PROCESSING doc older than the threshold is stale', () => {
    expect(isStaleProcessing({ status: 'PROCESSING', uploadedAt: minutesAgo(16) }, NOW)).toBe(true);
    expect(isStaleProcessing({ status: 'PROCESSING', uploadedAt: minutesAgo(120) }, NOW)).toBe(true);
  });

  it('a PROCESSING doc within the window is legitimately still working — left alone', () => {
    expect(isStaleProcessing({ status: 'PROCESSING', uploadedAt: minutesAgo(14) }, NOW)).toBe(false);
    expect(isStaleProcessing({ status: 'PROCESSING', uploadedAt: minutesAgo(1) }, NOW)).toBe(false);
    // exactly at the threshold is not yet stale (strict >)
    expect(
      isStaleProcessing(
        { status: 'PROCESSING', uploadedAt: new Date(NOW.getTime() - STALE_PROCESSING_THRESHOLD_MS) },
        NOW
      )
    ).toBe(false);
  });

  it('COMPLETED / NEEDS_REVIEW / REJECTED docs are never stale regardless of age', () => {
    for (const status of ['COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED']) {
      expect(isStaleProcessing({ status, uploadedAt: minutesAgo(600) }, NOW)).toBe(false);
    }
  });
});

describe('sweepStaleProcessing — the database write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.document.updateMany as any).mockResolvedValue({ count: 2 });
  });

  it('updates only PROCESSING rows older than the cutoff, to FAILED with processedAt', async () => {
    const count = await sweepStaleProcessing(NOW);

    expect(prisma.document.updateMany).toHaveBeenCalledTimes(1);
    const arg = (prisma.document.updateMany as any).mock.calls[0][0];

    // status filter makes COMPLETED/NEEDS_REVIEW/REJECTED unreachable
    expect(arg.where.status).toBe('PROCESSING');
    // cutoff is exactly now - threshold, so in-window docs can't match
    expect(arg.where.uploadedAt.lt.getTime()).toBe(NOW.getTime() - STALE_PROCESSING_THRESHOLD_MS);
    // writes what the upload controller's failure path writes
    expect(arg.data).toEqual({ status: 'FAILED', processedAt: NOW });

    expect(count).toBe(2);
  });

  it('is idempotent: a second run issues the same self-limiting query', async () => {
    await sweepStaleProcessing(NOW);
    (prisma.document.updateMany as any).mockResolvedValue({ count: 0 });
    const second = await sweepStaleProcessing(NOW);

    expect(second).toBe(0);
    const [first, secondArg] = (prisma.document.updateMany as any).mock.calls;
    expect(secondArg[0].where).toEqual(first[0].where);
  });
});
