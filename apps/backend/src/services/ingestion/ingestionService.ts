import { GeminiExtractionAdapter } from '../extraction/geminiAdapter';
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
    console.log(`[Background] Starting extraction for document ${documentId} (${originalFileName})...`);

    let extractionResult;
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Background] Attempt ${attempt}/${MAX_ATTEMPTS} for document ${documentId}...`);
        extractionResult = await this.geminiAdapter.extractFromImage(targetFileBuffer, mimeType);
        
        // If we got a reasonably complete extraction (confidence >= 0.6), break the loop
        if (extractionResult && extractionResult.overallConfidence >= 0.6) {
          console.log(`[Background] Extraction successful on attempt ${attempt}.`);
          break;
        }

        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[Background] Attempt ${attempt} returned low confidence. Retrying...`);
        }
      } catch (error: any) {
        console.error(`[Background] Attempt ${attempt} failed with error: ${error.message}`);
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

    console.log(`[Background] Persisting extraction result to document ${documentId}...`);
    await this.persistenceService.updateDocumentWithExtraction(documentId, userId, organizationId, fileUrl, originalFileName, extractionResult);

    console.log(`[Background] Workflow complete for ${documentId}. Result confidence: ${extractionResult.overallConfidence}`);
  }
}
