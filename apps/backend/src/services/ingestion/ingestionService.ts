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
   * Updates the document to COMPLETED, NEEDS_REVIEW, or FAILED.
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

    const extractionResult = await this.geminiAdapter.extractFromImage(targetFileBuffer, mimeType);

    console.log(`[Background] Extraction done. Persisting to document ${documentId}...`);
    await this.persistenceService.updateDocumentWithExtraction(documentId, userId, organizationId, fileUrl, originalFileName, extractionResult);

    console.log(`[Background] Extraction complete for ${documentId}.`);
  }
}
