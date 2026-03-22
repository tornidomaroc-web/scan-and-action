import { PrismaClient } from '@prisma/client';
import { GeminiExtractionResult } from '../../../../../packages/shared/src/schemas';
import { EntityResolutionService } from '../normalization/entityResolution';
import { NormalizationService } from '../normalization/normalizationService';

const CONFIDENCE_THRESHOLD = 0.98; // Anything below this requires human review

export class PersistenceService {
  private prisma: PrismaClient;
  private entityResolver: EntityResolutionService;
  private normalizer: NormalizationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.entityResolver = new EntityResolutionService(this.prisma);
    this.normalizer = new NormalizationService();
  }

  public async persistIngestionResult(
    userId: string,
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
    const docId = await this.prisma.$transaction(async (tx) => {

      // 2. Create the Document
      const englishNormalizedText = this.normalizer.normalizeTextToEnglish(
        extraction.rawText,
        extraction.detectedLanguage
      );

      const doc = await tx.document.create({
        data: {
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
      for (const rawEntity of extraction.entities) {
        const globalEntity = await this.entityResolver.resolveOrGenerateEntity(userId, rawEntity);
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

      return doc.id;
    });

    return docId;
  }
}