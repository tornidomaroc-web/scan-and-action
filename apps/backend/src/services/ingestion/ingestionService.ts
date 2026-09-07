import { GeminiExtractionAdapter } from '../extraction/geminiAdapter';
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
  public async validateSingleDocument(buffer: Buffer, mimeType: string): Promise<boolean> {
    return this.geminiAdapter.isSingleDocument(buffer, mimeType);
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
    fileUrl: string
  ): Promise<void> {
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

    // Step 1: Validation Signal - Ensure single document (Async check)
    const isSingleDoc = await this.validateSingleDocument(targetFileBuffer, mimeType);
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

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Background] Attempt ${attempt}/${MAX_ATTEMPTS} for document ${documentId}... elapsedMs=${elapsedMs()}`);
        extractionResult = await this.geminiAdapter.extractFromImage(targetFileBuffer, mimeType);

        // If we got a reasonably complete extraction (confidence >= 0.6), break the loop
        if (extractionResult && extractionResult.overallConfidence >= 0.6) {
          console.log(`[Background] Extraction successful on attempt ${attempt}. elapsedMs=${elapsedMs()}`);
          break;
        }

        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[Background] Attempt ${attempt} returned low confidence. Retrying...`);
        }
      } catch (error: any) {
        console.error(`[Background] Attempt ${attempt} failed with error: ${formatErrorForLog(error)}`);
        if (attempt === MAX_ATTEMPTS) {
          console.error(`[Background] All ${MAX_ATTEMPTS} attempts failed for ${documentId}.`);
        } else {
          console.log(`[Background] Retrying extraction for ${documentId}...`);
        }
      }
    }

    // Fallback to a safe empty result if everything failed
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
      await this.persistenceService.updateDocumentWithExtraction(documentId, userId, organizationId, fileUrl, originalFileName, extractionResult);
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
