/**
 * A/B arm selection for the model-pin experiment.
 *
 * WHY THIS EXISTS. The empty extractions are a regime change, not a background
 * rate: the empty-shape rate was 4.8% in March and 5.0% in April, then 87.3% in
 * June and 61.6% in July, and the corpus shows the break at ~2026-06-22. No
 * commit touched apps/backend/src/services/extraction/ or .../ingestion/
 * between 2026-06-01 and 2026-07-10, and the model id itself last changed
 * 2026-03-25 (`git log -G'gemini-flash-latest'`). The onset happened with zero
 * change on our side, so whatever moved was external — and `-latest` is the
 * only external thing we point at by name.
 *
 * WHY AN ARM RATHER THAN JUST PINNING. A sequential before/after would be
 * confounded by the vendor's minute-to-minute state. That is not hypothetical
 * here: a clean monotonic dose-response between upload concurrency and failure
 * rate (10.6% at 1/min rising to ~100% at 7/min) survived until it was split by
 * era, at which point concurrency held at 1 read 7.3% healthy vs 50% outage and
 * the gradient largely dissolved into the calendar. Interleaving is what stops
 * this experiment making the same mistake.
 *
 * WHY A HASH RATHER THAN STRICT ALTERNATION. Strict alternation needs shared
 * mutable state, which breaks across process restarts and under concurrency —
 * both of which this runs in. A pure function of the document id decorrelates
 * arm from time just as well, and adds a property a counter cannot: the
 * assignment is RECOMPUTABLE from the id alone, so the split can be audited
 * from the database afterwards rather than trusted.
 */

/** The floating alias both call sites used unconditionally before this. */
export const ALIAS_MODEL = 'models/gemini-flash-latest';

/**
 * The pinned arm's default target.
 *
 * Confirmed present via ListModels against this project on 2026-09-08:
 * `models/gemini-2.5-flash`, displayName "Gemini 2.5 Flash", version "001".
 *
 * Chosen as the most established GA flash model in the listing — it predates
 * the entire 3.x ladder (3.5-flash 05-2026, 3.6-flash 07-2026, 3.7-flash
 * 08-2026, 3.8-flash) that `-latest` has evidently been climbing. The
 * hypothesis under test is that newer, more contended models shed heavy
 * requests with 503, so the pinned arm has to be the OPPOSITE end of that
 * ladder. Pinning to 3.8-flash — the console's current model line, and the
 * alias's likely resolution — would compare a model against itself.
 */
export const DEFAULT_PINNED_MODEL = 'models/gemini-2.5-flash';

export type Arm = 'ab_pinned' | 'ab_alias';

/**
 * OFF unless the variable is exactly 'true'.
 *
 * Deliberately strict, and deliberately default-off: with the experiment
 * disabled every document takes the alias, which is byte-identical to the
 * behaviour before this change. Merging this cannot alter production; turning
 * it on is a separate, reversible act.
 */
export function abEnabled(): boolean {
  return process.env.GEMINI_AB_ENABLED === 'true';
}

/** Overridable at runtime so the pinned target can be retuned without a deploy. */
export function pinnedModelId(): string {
  return process.env.GEMINI_PINNED_MODEL || DEFAULT_PINNED_MODEL;
}

/**
 * Pure, deterministic, stateless. Sums the hex digits of the id and takes the
 * parity. A v4 uuid's hex digits are uniformly distributed, so this splits
 * ~50/50 while remaining recomputable by anyone holding the id.
 *
 * Non-hex characters (the dashes) are skipped rather than folded in, so the
 * result does not depend on the id's punctuation.
 */
export function selectArm(documentId: string): Arm {
  let sum = 0;
  for (const ch of documentId.toLowerCase()) {
    const v = parseInt(ch, 16);
    if (!Number.isNaN(v)) sum += v;
  }
  return sum % 2 === 0 ? 'ab_pinned' : 'ab_alias';
}

export function modelForArm(arm: Arm): string {
  return arm === 'ab_pinned' ? pinnedModelId() : ALIAS_MODEL;
}

/**
 * The single entry point the pipeline uses. Returns the alias arm for every
 * document while the experiment is off.
 */
export function resolveModelForDocument(documentId: string): { arm: Arm; modelId: string } {
  const arm: Arm = abEnabled() ? selectArm(documentId) : 'ab_alias';
  return { arm, modelId: modelForArm(arm) };
}
