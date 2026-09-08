import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ALIAS_MODEL,
  DEFAULT_PINNED_MODEL,
  abEnabled,
  pinnedModelId,
  selectArm,
  modelForArm,
  resolveModelForDocument,
} from './modelArm';

// ============================================================================
// Arm assignment must be INTERLEAVED, DETERMINISTIC and RECOMPUTABLE.
// ============================================================================
// Sequential arms (all-alias then all-pinned) would be confounded by the
// vendor's minute-to-minute state — the same trap that made the concurrency
// dose-response look real until it was split by era, at which point concurrency
// held at 1 read 7.3% healthy vs 50% outage and the gradient mostly dissolved.
//
// So the arm is a PURE FUNCTION OF THE DOCUMENT ID. That buys three things a
// counter cannot: it survives process restarts, it is unaffected by
// concurrency, and anyone can recompute which arm a document was in from its id
// alone — the assignment is auditable after the fact, from the database.
//
// It is NOT strict alternation. Strict alternation needs shared mutable state,
// which breaks under exactly the conditions this experiment runs in. Hash
// parity decorrelates arm from time, which is the property that matters.
// ============================================================================

describe('arm selection is deterministic and recomputable', () => {
  it('returns the same arm for the same id, every time', () => {
    const id = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607';
    const first = selectArm(id);
    for (let i = 0; i < 50; i++) {
      expect(selectArm(id)).toBe(first);
    }
  });

  it('assigns both arms across a realistic set of uuids (it interleaves)', () => {
    const ids = Array.from({ length: 200 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    const arms = ids.map(selectArm);
    expect(arms).toContain('ab_pinned');
    expect(arms).toContain('ab_alias');
  });

  it('splits roughly evenly — neither arm starves at n=200', () => {
    const ids = Array.from({ length: 200 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    const pinned = ids.map(selectArm).filter(a => a === 'ab_pinned').length;
    // 200 ids: anything inside 30-70% is a usable split for a 20-upload run.
    expect(pinned).toBeGreaterThan(60);
    expect(pinned).toBeLessThan(140);
  });

  it('is case-insensitive, so a uuid rendered either way audits the same', () => {
    const lower = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607';
    expect(selectArm(lower)).toBe(selectArm(lower.toUpperCase()));
  });
});

describe('arm maps to a concrete model id', () => {
  it('the alias arm uses the floating alias', () => {
    expect(modelForArm('ab_alias')).toBe(ALIAS_MODEL);
    expect(ALIAS_MODEL).toBe('models/gemini-flash-latest');
  });

  it('the pinned arm uses an EXPLICIT version, never a -latest alias', () => {
    const pinned = modelForArm('ab_pinned');
    expect(pinned).toBe(DEFAULT_PINNED_MODEL);
    expect(pinned).not.toMatch(/-latest$/);
    // Confirmed present in ListModels on 2026-09-08 for this project.
    expect(pinned).toBe('models/gemini-2.5-flash');
  });
});

// ============================================================================
// THE DEFAULT INVERTED. This block previously asserted the opposite, and that
// was correct then: an experiment must not change production, so OFF meant
// everyone took the alias.
//
// The A/B settled it. n=10, interleaved through one 4-minute window:
// pinned 6/6 succeeded, alias 0/4 — every alias call RATE_LIMITED. Complete
// separation, Fisher 1/C(10,6) = 0.005. Pinned calls succeeded in the same
// minutes alias calls were throttled, so the 429 binds PER MODEL, not per
// project.
//
// That makes the old polarity actively dangerous: with the flag unset,
// resolveModelForDocument returned 'ab_alias' for EVERY document, so removing
// the variable would route 100% of traffic to the arm that failed 4 of 4. The
// flag could express "split" or "alias everyone", and never "pin everyone" —
// which is the state production actually wants.
//
// So OFF now means PINNED, and the alias survives only as the comparison arm
// for a future A/B. Unset is now the safe state rather than the failing one.
// ============================================================================
describe('the PIN is the default; the alias is no longer the production fallback', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.GEMINI_AB_ENABLED;
    delete process.env.GEMINI_PINNED_MODEL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('abEnabled is false when the variable is absent', () => {
    expect(abEnabled()).toBe(false);
  });

  it('abEnabled is false for anything other than the exact string "true"', () => {
    for (const v of ['', '1', 'yes', 'TRUE', 'false']) {
      process.env.GEMINI_AB_ENABLED = v;
      expect(abEnabled()).toBe(false);
    }
  });

  it('with the experiment OFF, EVERY document gets the PINNED model', () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    for (const id of ids) {
      const { arm, modelId } = resolveModelForDocument(id);
      expect(arm).toBe('ab_pinned');
      expect(modelId).toBe(DEFAULT_PINNED_MODEL);
    }
  });

  it('the alias is UNREACHABLE through the production path when the flag is unset', () => {
    const ids = Array.from({ length: 200 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    const models = new Set(ids.map(id => resolveModelForDocument(id).modelId));
    expect(models.has(ALIAS_MODEL)).toBe(false);
    expect([...models]).toEqual([DEFAULT_PINNED_MODEL]);
  });

  it('with the experiment ON, both arms appear', () => {
    process.env.GEMINI_AB_ENABLED = 'true';
    const ids = Array.from({ length: 100 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    const arms = ids.map(id => resolveModelForDocument(id).arm);
    expect(arms).toContain('ab_pinned');
    expect(arms).toContain('ab_alias');
  });

  it('the alias REMAINS available as the comparison arm for the next A/B', () => {
    // The flag is not meaningless after the inversion — it is correctly
    // polarised. It still expresses "put half the traffic back on the alias",
    // which is exactly how the next comparison runs.
    expect(modelForArm('ab_alias')).toBe(ALIAS_MODEL);
    process.env.GEMINI_AB_ENABLED = 'true';
    const ids = Array.from({ length: 100 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    );
    const models = new Set(ids.map(id => resolveModelForDocument(id).modelId));
    expect(models.has(ALIAS_MODEL)).toBe(true);
    expect(models.has(DEFAULT_PINNED_MODEL)).toBe(true);
  });

  it('the pinned target is overridable without a deploy, and the override is used', () => {
    process.env.GEMINI_AB_ENABLED = 'true';
    process.env.GEMINI_PINNED_MODEL = 'models/gemini-3.5-flash';
    expect(pinnedModelId()).toBe('models/gemini-3.5-flash');
    const pinnedIds = Array.from({ length: 100 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-1234-4abc-8def-0123456789ab`
    ).map(id => resolveModelForDocument(id)).filter(r => r.arm === 'ab_pinned');
    expect(pinnedIds.length).toBeGreaterThan(0);
    expect(pinnedIds.every(r => r.modelId === 'models/gemini-3.5-flash')).toBe(true);
  });
});
