// SCRATCH FILE — safe to delete. Not committed, not part of the suite's intent.
//
// This was a throwaway tool used to render the real ReviewQueueScreen and
// DocumentDetailScreen with fixture data and dump their HTML, so a browser
// (which has a bidi engine, unlike jsdom) could resolve the result. The dump is
// done; the body is skipped so it cannot affect a local run.
//
// I could not delete this file — the sandbox denied `rm` and `Remove-Item`.
// Please delete it:  apps/frontend/tests/__dumpFixture.test.tsx
import { describe, it, expect } from 'vitest';

describe.skip('scratch fixture dump (inert — delete this file)', () => {
  it('does nothing', () => {
    expect(true).toBe(true);
  });
});
