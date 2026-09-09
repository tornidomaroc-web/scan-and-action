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

/**
 * The floating alias. RETIRED FROM THE PRODUCTION PATH — it is reachable only
 * as the comparison arm of a deliberate A/B, never as a default or a fallback.
 *
 * Retired on evidence, not on principle. The A/B ran n=10 interleaved through
 * one four-minute window on 2026-09-08: pinned 6/6 succeeded, alias 0/4, and
 * every single alias failure was RATE_LIMITED. Complete separation, Fisher
 * 1/C(10,6) = 0.005. Because pinned calls succeeded in the same minutes alias
 * calls were throttled, the 429 binds PER MODEL rather than per project.
 */
export const ALIAS_MODEL = 'models/gemini-flash-latest';

/**
 * The pinned model. Confirmed present via ListModels against this project on
 * 2026-09-08: `models/gemini-3.5-flash`, version `3.5-flash-05-2026`, with
 * `generateContent` among its supported methods.
 *
 * MOVED OFF gemini-2.5-flash, and the reason the earlier choice was right is
 * the same reason it stopped being right. 2.5-flash was picked as the most
 * ESTABLISHED model in the listing, because the binding constraint was a
 * 5-RPD-per-model free-tier ceiling and newer models looked more contended.
 * The project moved to paid tier (1000 RPM / 10000 RPD), that ceiling is gone,
 * and the property optimised for became the liability: the oldest model is the
 * one that gets retired. 2.5-flash is scheduled for deprecation 2026-10-16.
 *
 * AND NOTHING IN THE API WILL WARN US. ListModels exposes no lifecycle field at
 * all — the complete field set across all 54 models is description,
 * displayName, inputTokenLimit, maxTemperature, name, outputTokenLimit,
 * supportedGenerationMethods, temperature, thinking, topK, topP, version.
 * `v1` returns the same as `v1beta`. A retiring model reads as perfectly
 * healthy right up until it disappears, and this pin fails CLOSED (404/400 →
 * CLIENT_ERROR → every extraction fails at once). So the move happens on the
 * published schedule, with margin, not on a signal that does not exist.
 *
 * WHY 3.5 AND NOT 3.8. It is the oldest non-preview, non-`-lite` model in the
 * 3.x line (3.6-flash 07-2026, 3.7-flash 08-2026, 3.8-flash are each newer).
 * Taking the newest would recreate exactly the `-latest` exposure that four PRs
 * went into escaping. Recent enough to be far from retirement, settled enough
 * not to be the bleeding edge.
 *
 * VALIDATED BEFORE THE MOVE, ten fixtures 2026-09-09T01:52-01:53Z: every amount
 * 2.5-flash had resolved was reproduced exactly — doc01 2029.60, doc02 1141.55,
 * doc03 7282.31, doc04 1799.50 (identical across three sessions and two models)
 * — plus five more that 2.5-flash never reached because it hit its quota wall,
 * and zero errors of any class at a 5-second upload cadence.
 */
export const DEFAULT_PINNED_MODEL = 'models/gemini-3.5-flash';

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
 * The single entry point the pipeline uses.
 *
 * THE POLARITY IS INVERTED FROM THE EXPERIMENT, AND THAT IS THE POINT. This
 * previously returned the ALIAS arm whenever the flag was unset, which was
 * correct for an experiment that must not disturb production — but it meant the
 * flag could express "split" or "alias everyone" and never "pin everyone".
 * After the A/B that made unsetting the variable the most dangerous action
 * available: it would have routed 100% of traffic to the arm that failed 4 of 4.
 *
 * Now the default is PINNED. Unset is the safe steady state, and the flag
 * survives with a precise meaning — "put roughly half the traffic back on the
 * alias for a comparison" — which is how the next A/B runs.
 *
 * FAIL-CLOSED, DELIBERATELY. When this pinned version is eventually retired the
 * API answers 404/400, which classifies as CLIENT_ERROR, and every extraction
 * fails at once. That is the failure mode chosen over the alternative: the
 * alias fails OPEN by silently moving to another model, which is what produced
 * 173 empty documents from 2026-06-22 onward that nobody could explain. A loud
 * uniform outage is diagnosable in one query against extraction_model; a silent
 * drift is not diagnosable at all. Falling back to the alias on CLIENT_ERROR is
 * rejected for the same reason — it would reintroduce the silent drift exactly
 * when the system is already degraded, and make the arm record lie about which
 * model actually served the call.
 */
export function resolveModelForDocument(documentId: string): { arm: Arm; modelId: string } {
  const arm: Arm = abEnabled() ? selectArm(documentId) : 'ab_pinned';
  return { arm, modelId: modelForArm(arm) };
}
