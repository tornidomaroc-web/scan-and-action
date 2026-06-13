import { prisma } from '../prismaClient';

// Documents get stuck in PROCESSING forever when the process dies
// mid-extraction: the upload controller's catch handler (which writes
// FAILED + processedAt) never runs. This sweep finishes that interrupted
// write. Real extractions complete in seconds and the frontend stops
// polling after 90s, so anything past this threshold cannot still be
// working.
export const STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export const isStaleProcessing = (
  doc: { status: string; uploadedAt: Date },
  now: Date
): boolean =>
  doc.status === 'PROCESSING' &&
  now.getTime() - doc.uploadedAt.getTime() > STALE_PROCESSING_THRESHOLD_MS;

// Idempotent by construction: the WHERE clause only matches rows still in
// PROCESSING, so repeated or concurrent sweeps are harmless and
// COMPLETED / NEEDS_REVIEW / REJECTED documents can never be touched.
// It writes exactly what the upload controller's failure path writes.
// No document content is read or returned, so org isolation is unaffected.
export async function sweepStaleProcessing(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_THRESHOLD_MS);
  const result = await prisma.document.updateMany({
    where: { status: 'PROCESSING', uploadedAt: { lt: cutoff } },
    data: { status: 'FAILED', processedAt: now },
  });
  if (result.count > 0) {
    console.log(
      `[StaleSweep] Marked ${result.count} stuck document(s) FAILED (uploaded before ${cutoff.toISOString()})`
    );
  }
  return result.count;
}

export function startStaleSweep(): ReturnType<typeof setInterval> {
  const run = () =>
    sweepStaleProcessing().catch((err: any) =>
      console.error('[StaleSweep] Sweep failed:', err.message || err)
    );
  // Run once at boot — a restart is exactly when stranded documents exist —
  // then on an interval. unref() keeps the timer from blocking shutdown.
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
