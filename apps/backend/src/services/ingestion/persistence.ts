import { PrismaClient } from '@prisma/client';
import { GeminiExtractionResult } from '../../types/schemas';
import { EntityResolutionService } from '../normalization/entityResolution';
import { NormalizationService } from '../normalization/normalizationService';
import { ExpenseCategorizationService } from '../expenseCategorizationService';

const CONFIDENCE_THRESHOLD = 0.98; // Anything below this requires human review

export class PersistenceService {
  private prisma: PrismaClient;
  private entityResolver: EntityResolutionService;
  private normalizer: NormalizationService;
  private categorizationService: ExpenseCategorizationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.entityResolver = new EntityResolutionService(this.prisma);
    this.normalizer = new NormalizationService();
    this.categorizationService = new ExpenseCategorizationService();
  }

  /**
   * Updates an existing PROCESSING stub document with AI extraction results.
   * Used by the background async flow after the HTTP response is already sent.
   */
  public async updateDocumentWithExtraction(
    documentId: string,
    userId: string,
    organizationId: string,
    fileUrl: string,
    originalFileName: string,
    extraction: GeminiExtractionResult
  ): Promise<void> {
    const rawConfidence = extraction.overallConfidence ?? 0;
    const normalizedOverallConfidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

    // Phase 2.3 & 2.4: Structural & Anchor Validation (Receipt Focus)
    // We prevent "Completed" status if core facts or commercial anchors are missing.
    const hasDate = extraction.facts.some(f => 
      f.factType === 'DATE' && (f.valueDate != null || (f.valueString != null && f.valueString.trim() !== ''))
    );
    const hasAmount = extraction.facts.some(f => 
      f.factType === 'AMOUNT' && (f.valueNumber != null || (f.valueString != null && f.valueString.trim() !== ''))
    );
    const isEmpty = extraction.facts.length === 0;

    const text = (extraction.rawText || '').toLowerCase();
    const anchors = ['total', 'subtotal', 'tax', 'vat', 'amount', 'item', 'receipt', 'invoice', 'cash', 'card', 'payment', 'merchant', 'store'];
    const foundAnchors = anchors.filter(anchor => text.includes(anchor));
    const hasAnchors = foundAnchors.length >= 2;

    const templateSignals = ['template', 'sample', 'example', 'your business name', 'lorem ipsum'];
    const hasTemplateSignal = templateSignals.some(signal => text.includes(signal));

    const repeatedMarkers = ['invoice', 'receipt', 'subtotal', 'total', 'tax', 'thank you'];
    const repeatedCount = repeatedMarkers.filter(marker => text.split(marker).length - 1 > 1).length;
    const hasMultiDocumentSignal = repeatedCount >= 2;

    const isWeak = normalizedOverallConfidence < 0.6 || isEmpty || !hasDate || !hasAmount || !hasAnchors || hasTemplateSignal || hasMultiDocumentSignal;

    let documentStatus = 'COMPLETED';
    if (normalizedOverallConfidence < CONFIDENCE_THRESHOLD || isWeak) {
      documentStatus = 'NEEDS_REVIEW';
    }

    // DEBUG LOGGING - PHASE 2.4.2 INVESTIGATION
    console.log(`[Persistence DEBUG] Doc: ${documentId}`);
    console.log(`[Persistence DEBUG] Confidence: ${normalizedOverallConfidence} (Threshold: ${CONFIDENCE_THRESHOLD})`);
    console.log(`[Persistence DEBUG] Anchors: [${foundAnchors.join(', ')}] (Count: ${foundAnchors.length}, met: ${hasAnchors})`);
    console.log(`[Persistence DEBUG] Structure: hasDate=${hasDate}, hasAmount=${hasAmount}, isEmpty=${isEmpty}`);
    console.log(`[Persistence DEBUG] Final Decision: isWeak=${isWeak} => Status=${documentStatus}`);

    console.log(`[Persistence] Updating stub document ${documentId} with extraction results...`);
    await this.prisma.$transaction(async (tx) => {
      const englishNormalizedText = this.normalizer.normalizeTextToEnglish(
        extraction.rawText,
        extraction.detectedLanguage
      );

      await tx.document.update({
        where: { id: documentId },
        data: {
          documentType: this.normalizer.normalizeDocumentType(extraction.documentType),
          documentSubtype: extraction.documentSubtype,
          detectedLanguage: extraction.detectedLanguage,
          rawText: extraction.rawText,
          normalizedText: englishNormalizedText,
          summary: extraction.summary,
          overallConfidence: extraction.overallConfidence,
          status: documentStatus,
          processedAt: new Date(),
        }
      });

      for (const rawFact of extraction.facts) {
        const canonicalKey = this.normalizer.normalizeFactKey(rawFact.key);
        const isReviewed = rawFact.confidence >= CONFIDENCE_THRESHOLD;

        if (!isReviewed && documentStatus !== 'NEEDS_REVIEW') {
          documentStatus = 'NEEDS_REVIEW';
          await tx.document.update({
            where: { id: documentId },
            data: { status: 'NEEDS_REVIEW' }
          });
        }

        await tx.documentFact.create({
          data: {
            documentId,
            factType: rawFact.factType,
            key: canonicalKey,
            valueString: rawFact.valueString,
            valueNumber: rawFact.valueNumber,
            valueDate: rawFact.valueDate ? new Date(rawFact.valueDate) : null,
            currency: this.normalizer.normalizeCurrency(rawFact.currency),
            confidence: rawFact.confidence,
            sourceSpan: rawFact.sourceSpan,
            isReviewed,
          }
        });
      }

      for (const rawEntity of extraction.entities) {
        const globalEntity = await this.entityResolver.resolveOrGenerateEntity(organizationId, rawEntity);
        const canonicalRole = rawEntity.role.toUpperCase().replace(/\s+/g, '_');

        await tx.documentEntity.create({
          data: {
            documentId,
            entityId: globalEntity.id,
            role: canonicalRole,
            confidence: rawEntity.confidence,
          }
        });
      }
      
      // Part 1: Auto Categorization (SAFE EXTENSION)
      const merchantFact = extraction.entities.find(e => e.entityType === 'VENDOR')?.name || null;
      await this.categorizeAndSave(tx, documentId, merchantFact, extraction.rawText, extraction.facts);

      // Increment organization scanCount conditionally to enforce limit
      try {
        await tx.organization.update({
          where: { 
            id: organizationId,
            OR: [
              { plan: { not: 'FREE' } },
              { scanCount: { lt: 10 } }
            ]
          },
          data: {
            scanCount: { increment: 1 }
          }
        });
      } catch (error: any) {
        // P2025 is thrown if the where condition fails (limit reached or record missing)
        if (error.code === 'P2025') {
          console.warn(`[Persistence] Scan limit reached or Org missing for: ${organizationId}. Aborting update.`);
          throw new Error('LIMIT_REACHED');
        }
        throw error;
      }

      console.log(`[Persistence] Update transaction successful for ${documentId}. Status: ${documentStatus}`);
    });
  }

  public async persistIngestionResult(
    userId: string,
    organizationId: string,
    fileUrl: string,
    originalFileName: string,
    extraction: GeminiExtractionResult
  ): Promise<string> {

    // 1. Determine Document Status based on normalized overall confidence
    const rawConfidence = extraction.overallConfidence ?? 0;

    // Normalize to 0..1 in case the source returns 73 instead of 0.73
    const normalizedOverallConfidence =
      rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

    let documentStatus = 'COMPLETED';
    if (normalizedOverallConfidence < CONFIDENCE_THRESHOLD) {
      documentStatus = 'NEEDS_REVIEW';
    }

    // Wrap in a transaction so we don't save partial documents
    console.log(`[Persistence] Starting Prisma transaction...`);
    const docId = await this.prisma.$transaction(async (tx) => {

      // 2. Create the Document
      console.log(`[Persistence] Creating document record...`);
      const englishNormalizedText = this.normalizer.normalizeTextToEnglish(
        extraction.rawText,
        extraction.detectedLanguage
      );

      const doc = await tx.document.create({
        data: {
          organizationId,
          userId,
          fileUrl,
          originalFileName,
          documentType: this.normalizer.normalizeDocumentType(extraction.documentType),
          documentSubtype: extraction.documentSubtype,
          detectedLanguage: extraction.detectedLanguage,
          rawText: extraction.rawText,
          normalizedText: englishNormalizedText,
          summary: extraction.summary,
          overallConfidence: extraction.overallConfidence,
          status: documentStatus,
          processedAt: new Date()
        }
      });

      // 3. Persist Facts
      console.log(`[Persistence] Persisting ${extraction.facts.length} facts...`);
      for (const rawFact of extraction.facts) {
        const canonicalKey = this.normalizer.normalizeFactKey(rawFact.key);
        const isReviewed = rawFact.confidence >= CONFIDENCE_THRESHOLD;

        if (!isReviewed && documentStatus !== 'NEEDS_REVIEW') {
          await tx.document.update({
            where: { id: doc.id },
            data: { status: 'NEEDS_REVIEW' }
          });
        }

        await tx.documentFact.create({
          data: {
            documentId: doc.id,
            factType: rawFact.factType,
            key: canonicalKey,
            valueString: rawFact.valueString,
            valueNumber: rawFact.valueNumber,
            valueDate: rawFact.valueDate ? new Date(rawFact.valueDate) : null,
            currency: this.normalizer.normalizeCurrency(rawFact.currency),
            confidence: rawFact.confidence,
            sourceSpan: rawFact.sourceSpan,
            isReviewed: isReviewed
          }
        });
      }

      // 4. Persist Entities & DocumentEntities (Roles)
      console.log(`[Persistence] Persisting ${extraction.entities.length} entities...`);
      for (const rawEntity of extraction.entities) {
        const globalEntity = await this.entityResolver.resolveOrGenerateEntity(organizationId, rawEntity);
        const canonicalRole = rawEntity.role.toUpperCase().replace(/\s+/g, '_');

        await tx.documentEntity.create({
          data: {
            documentId: doc.id,
            entityId: globalEntity.id,
            role: canonicalRole,
            confidence: rawEntity.confidence
          }
        });
      }
      
      // Part 1: Auto Categorization (SAFE EXTENSION)
      const merchantFact2 = extraction.entities.find(e => e.entityType === 'VENDOR')?.name || null;
      await this.categorizeAndSave(tx, doc.id, merchantFact2, extraction.rawText, extraction.facts);

      // Increment organization scanCount conditionally to enforce limit
      try {
        await tx.organization.update({
          where: { 
            id: organizationId,
            OR: [
              { plan: { not: 'FREE' } },
              { scanCount: { lt: 10 } }
            ]
          },
          data: {
            scanCount: { increment: 1 }
          }
        });
      } catch (error: any) {
        // P2025 is thrown if the where condition fails (limit reached or record missing)
        if (error.code === 'P2025') {
          console.warn(`[Persistence] Scan limit reached or Org missing for: ${organizationId}. Aborting update.`);
          throw new Error('LIMIT_REACHED');
        }
        throw error;
      }

      console.log(`[Persistence] Transaction successful.`);
      return doc.id;
    });

    console.log(`[Persistence] Result saved with ID: ${docId}`);
    return docId;
  }

  /**
   * Emergency fallback to force a document out of PROCESSING state.
   * Used when the main transaction fails due to data constraints or DB hiccups.
   */
  public async markAsNeedsReview(documentId: string): Promise<void> {
    console.warn(`[Persistence] Emergency fallback: Marking document ${documentId} as NEEDS_REVIEW.`);
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'NEEDS_REVIEW',
        processedAt: new Date()
      }
    });
  }

  /**
   * Safe extension to add auto-categorization fact if it doesn't already exist.
   */
  private async categorizeAndSave(
    tx: any,
    documentId: string,
    merchantName: string | null,
    rawText: string,
    facts: any[]
  ): Promise<void> {
    try {
      // 1. Check if category already exists to avoid overwriting
      const existing = await tx.documentFact.findFirst({
        where: { documentId, key: 'category' }
      });

      if (existing) return;

      // 2. Get categorization result
      const { category, confidence } = this.categorizationService.categorize({
        merchantName,
        rawText,
        facts
      });

      // 3. Persist as a new Fact
      await tx.documentFact.create({
        data: {
          documentId,
          factType: 'CATEGORY',
          key: 'category',
          valueString: category,
          confidence: confidence,
          isReviewed: confidence >= CONFIDENCE_THRESHOLD
        }
      });
    } catch (err) {
      console.error(`[Persistence] Failed auto-categorization for ${documentId}:`, err);
    }
  }
}