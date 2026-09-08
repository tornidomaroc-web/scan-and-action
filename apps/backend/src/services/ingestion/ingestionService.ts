import { GeminiExtractionAdapter } from '../extraction/geminiAdapter';
import { resolveModelForDocument } from '../extraction/modelArm';
import { formatErrorForLog } from '../../redaction';
import { PersistenceService } from './persistence';
import { PrismaClient } from '@prisma/client';

export class IngestionService {
  private geminiAdapter: GeminiExtractionAdapter;
  private persistenceService: PersistenceService;

  constructor(prisma: PrismaClient) {
    this.geminiAdapter = new GeminiExtractionAdapter();
    this.persistenceService = new PersistenceService(prisma);
  }

  /**
   * Pre-check to ensure the image contains only one document.
   */
  public async validateSingleDocument(
    buffer: Buffer,
    mimeType: string,
    // The A/B arm's model, so the validation call runs in the same arm as the
    // extraction call. Optional, defaulting to the adapter's alias, so this
    // method's existing contract is unchanged.
    modelId?: string
  ): Promise<boolean> {
    return this.geminiAdapter.isSingleDocument(buffer, mimeType, modelId);
  }

  /**
   * Background async extraction for an existing PROCESSING stub document.
   * Runs after the HTTP response is already sent.
   * Updates the document to COMPLETED or NEEDS_REVIEW.
   */
  public async processUploadAsync(
    documentId: string,
    userId: string,
    organizationId: string,
    targetFileBuffer: Buffer,
    mimeType: string,
    originalFileName: string,
    fileUrl: string,
    // Re-extraction (documentController.reextractDocument) passes
    // { chargeScan: false }: the pipeline runs identically, but the document
    // must not consume a second scan. Default is to charge, so the upload path
    // is unchanged and a caller that omits this cannot accidentally give scans
    // away. Threaded straight through to updateDocumentWithExtraction.
    opts: { chargeScan?: boolean } = {}
  ): Promise<void> {
    const chargeScan = opts.chargeScan !== false;
    // The FILENAME is not logged (this used to interpolate `originalFileName`).
    // documentId is the handle every other line in this workflow already uses,
    // and it resolves to the row that holds the name if it is ever needed.
    // STAGE DURATIONS. Every line below already sits on a stage boundary; each
    // now carries the milliseconds elapsed since this function began. Railway
    // timestamps the lines, but those timestamps live only as long as the
    // deployment's logs — nothing in the application recorded a duration, which
    // is why the 2026-09-04 wait became an argument instead of a number.
    //
    // Locals and interpolation only. No new log line, no new try/catch, no new
    // await, and no change to the retry loop or the error paths — this function
    // runs detached inside setImmediate after the HTTP response is already sent
    // (uploadController.ts:106), so there is no request latency to affect either
    // way. `elapsedMs` is cumulative from entry; the deltas between consecutive
    // lines are the per-stage costs.
    const t0 = Date.now();
    const elapsedMs = () => Date.now() - t0;

    console.log(
      `[Background] Starting validation and extraction for document ${documentId} (${mimeType}, ${targetFileBuffer.length} bytes)... elapsedMs=0`
    );

    // The A/B arm is resolved ONCE per document and drives both Gemini calls.
    //
    // Derived from the documentId rather than a counter, so it survives process
    // restarts and concurrency, and — the property that matters after the run —
    // can be recomputed from the id alone to audit the split against the
    // database. Returns the alias arm for every document while
    // GEMINI_AB_ENABLED is unset, so this is inert until switched on.
    const { arm, modelId } = resolveModelForDocument(documentId);
    console.log(`[Background] Model arm for ${documentId}: arm=${arm} model=${modelId}`);

    // Step 1: Validation Signal - Ensure single document (Async check)
    const isSingleDoc = await this.validateSingleDocument(targetFileBuffer, mimeType, modelId);
    if (!isSingleDoc) {
      console.warn(`[Background] Multi-document detected for ${documentId}. Aborting extraction.`);
      // If the NEEDS_REVIEW write itself fails, force FAILED rather than
      // returning and leaving the row in PROCESSING. NEEDS_REVIEW is not
      // reachable here — it is precisely the write that just threw — and this
      // function is about to resolve, so nothing else will move the row until
      // staleSweepService picks it up 15-20 minutes later. Same state, on time.
      await this.persistenceService.markAsNeedsReview(documentId).catch(async err => {
        console.error(`[Background] Failed to mark ${documentId} as NEEDS_REVIEW:`, formatErrorForLog(err));
        // try/catch, not .catch(): this must swallow a SYNCHRONOUS throw from
        // the call as well as a rejected promise. Anything escaping this
        // callback rejects processUploadAsync and would newly reach
        // uploadController's .catch — a separate behaviour change. When both
        // writes are gone, staleSweepService remains the backstop.
        try {
          await this.persistenceService.markAsFailed(documentId);
        } catch (failErr) {
          console.error(`[Background] Could not force ${documentId} to FAILED either:`, formatErrorForLog(failErr));
        }
      });
      return;
    }

    let extractionResult;
    const MAX_ATTEMPTS = 2;
    // The error CLASS of the last failure, never its message (redaction.ts
    // ERROR-OBJECT POLICY). Stays null when the loop exhausts without throwing —
    // the low-confidence path — which is its own kind of failure and is recorded
    // under a distinct class so the two are separable later.
    let lastErrorClass: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Background] Attempt ${attempt}/${MAX_ATTEMPTS} for document ${documentId}... elapsedMs=${elapsedMs()}`);
        extractionResult = await this.geminiAdapter.extractFromImage(targetFileBuffer, mimeType, modelId);

        // If we got a reasonably complete extraction (confidence >= 0.6), break the loop
        if (extractionResult && extractionResult.overallConfidence >= 0.6) {
          console.log(`[Background] Extraction successful on attempt ${attempt}. elapsedMs=${elapsedMs()}`);
          break;
        }

        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[Background] Attempt ${attempt} returned low confidence. Retrying...`);
        }
      } catch (error: any) {
        lastErrorClass = error?.constructor?.name || error?.name || 'UnknownError';
        console.error(`[Background] Attempt ${attempt} failed with error: ${formatErrorForLog(error)}`);
        if (attempt === MAX_ATTEMPTS) {
          console.error(`[Background] All ${MAX_ATTEMPTS} attempts failed for ${documentId}.`);
        } else {
          console.log(`[Background] Retrying extraction for ${documentId}...`);
        }
      }
    }

    // Record the ARM unconditionally — success and failure alike — and outside
    // the persist transaction, on the same principle as recordExtractionFailure.
    //
    // Unconditional is the whole point. The metric is extraction-call success
    // rate per arm; a document that records no arm drops out of the denominator,
    // and if only one outcome recorded, the arm that produced it would be
    // systematically over- or under-counted. That bias would run in the exact
    // direction that manufactures a result, so it is pinned by a test.
    //
    // `.catch` for the same reason as below: this runs detached in a
    // setImmediate after the 202 was sent, and an experiment's bookkeeping must
    // never become a new way for the pipeline to die.
    await this.persistenceService
      .recordExtractionModel(documentId, arm, modelId, (extractionResult as any)?.modelVersion ?? null)
      .catch((err: any) =>
        console.error(`[Background] Could not record extraction model for ${documentId}:`, formatErrorForLog(err))
      );

    // Record the failure BEFORE persisting, and outside the persist transaction,
    // so the evidence survives even if the persist itself rolls back.
    //
    // Two distinct failures land here and both must be recorded, because the
    // empty fallback below only fires for the first: every attempt THREW
    // (extractionResult undefined), or every attempt returned below the 0.6
    // confidence bar without throwing (extractionResult set but unusable). The
    // second was previously invisible in every sense — no fallback, no marker,
    // just a weak document indistinguishable from a genuinely poor scan.
    const extractionFailed = !extractionResult || extractionResult.overallConfidence < 0.6;
    if (extractionFailed) {
      // Precedence matters, and the first branch is the one that fires in
      // production. The adapter self-catches and RETURNS its empty result with a
      // `failureCause` (geminiAdapter.ts:249-280), so it never throws and
      // `lastErrorClass` — captured in the catch above — is unreachable here.
      // The repo's own test names that path ":85 ... (defensive: unreachable in
      // production)". Reaching for it first is exactly why the first real
      // failure recorded 'LowConfidence' when the adapter had already derived
      // PARSE_ERROR.
      //
      // 'LowConfidence' survives as the LAST resort because it is still true for
      // the case it names: the adapter succeeded, returned real text, and simply
      // scored under the 0.6 bar. That is a poor document, not a vendor failure,
      // and the two must not be collapsed.
      const cause = extractionResult?.failureCause ?? lastErrorClass ?? 'LowConfidence';
      await this.persistenceService
        .recordExtractionFailure(documentId, cause, MAX_ATTEMPTS)
        .catch((err: any) =>
          // Diagnostics must never become a new way for the pipeline to die:
          // this runs detached in a setImmediate after the 202 was sent.
          console.error(`[Background] Could not record extraction failure for ${documentId}:`, formatErrorForLog(err))
        );
    }

    // Fallback to a safe empty result if everything failed.
    //
    // ⚠ THIS BRANCH IS UNREACHABLE IN PRODUCTION, and is kept only as a guard
    // against a future adapter that throws. `extractFromImage` self-catches and
    // RETURNS an empty result on every error path (geminiAdapter.ts:249-280), so
    // `extractionResult` is always assigned and never undefined. The empty
    // document you see in the database is the ADAPTER's empty result, not this
    // one — and the two are byte-identical (`documentType: 'Unknown'`,
    // rawText '', confidence 0), so they cannot be told apart after the fact.
    //
    // Do not read this branch as evidence of where empty documents come from.
    // Assuming it was the source is what put the failure-class capture on the
    // unreachable catch above, and cost a production failure recorded as
    // 'LowConfidence' when the real cause had already been computed upstream.
    if (!extractionResult) {
      extractionResult = {
        detectedLanguage: 'en',
        documentType: 'Unknown',
        rawText: '',
        summary: '',
        facts: [],
        entities: [],
        overallConfidence: 0.0
      };
    }

    try {
      console.log(`[Background] Persisting extraction result to document ${documentId}... elapsedMs=${elapsedMs()}`);
      await this.persistenceService.updateDocumentWithExtraction(documentId, userId, organizationId, fileUrl, originalFileName, extractionResult, chargeScan);
    } catch (persistError: any) {
      console.error(`[CRITICAL] Persistence failed for ${documentId}. Forcing NEEDS_REVIEW. Error: ${formatErrorForLog(persistError)}`);
      await this.persistenceService.markAsNeedsReview(documentId).catch(async finalErr => {
        console.error(`[FATAL] Even emergency fallback failed for ${documentId}:`, formatErrorForLog(finalErr));
        // Same reasoning as the multi-document site above, try/catch included.
        try {
          await this.persistenceService.markAsFailed(documentId);
        } catch (failErr) {
          console.error(`[Background] Could not force ${documentId} to FAILED either:`, formatErrorForLog(failErr));
        }
      });
    }

    console.log(`[Background] Workflow complete for ${documentId}. Result confidence: ${extractionResult.overallConfidence} elapsedMs=${elapsedMs()}`);
  }
}
