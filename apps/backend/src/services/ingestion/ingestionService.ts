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
   * Orchestrates the complete end-to-end ingestion pipeline.
   * Image -> Structured JSON -> Persistence
   */
  public async processUpload(userId: string, targetFileBuffer: Buffer, mimeType: string, originalFileName: string, fileUrl: string): Promise<{ documentId: string }> {
    console.log(`[Ingestion Core] Starting pipeline for ${originalFileName}...`);
    
    // Step 1: Pass image to Vision LLM. Enforces Zod schema internally.
    console.log(`[Ingestion Core] Extracting structured data via LLM...`);
    const extractionResult = await this.geminiAdapter.extractFromImage(targetFileBuffer, mimeType);

    // Step 2: Push to Persistence Layer which handles Translation, Normalization, Entity Resolution 
    // and flagging for NEEDS_REVIEW.
    console.log(`[Ingestion Core] Normalizing and saving to Database...`);
    const documentId = await this.persistenceService.persistIngestionResult(userId, fileUrl, originalFileName, extractionResult);

    console.log(`[Ingestion Core] Pipeline Complete. Document ID: ${documentId}`);
    return { documentId };
  }
}
