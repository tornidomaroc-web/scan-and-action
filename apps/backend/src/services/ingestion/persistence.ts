import { PrismaClient } from '@prisma/client';
import { GeminiExtractionResult } from '../../types/schemas';
import { EntityResolutionService } from '../normalization/entityResolution';
import { NormalizationService } from '../normalization/normalizationService';
import { ExpenseCategorizationService } from '../expenseCategorizationService';
import { RuleEngineService } from '../ruleEngineService';
import { formatErrorForLog } from '../../redaction';

const CONFIDENCE_THRESHOLD = 0.98; // Anything below this requires human review

export class PersistenceService {
  private prisma: PrismaClient;
  private entityResolver: EntityResolutionService;
  private normalizer: NormalizationService;
  private categorizationService: ExpenseCategorizationService;
  private ruleEngine: RuleEngineService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.entityResolver = new EntityResolutionService(this.prisma);
    this.normalizer = new NormalizationService();
    this.categorizationService = new ExpenseCategorizationService();
    this.ruleEngine = new RuleEngineService(this.prisma);
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
    extraction: GeminiExtractionResult,
    // Whether this run should consume one of the organization's scans.
    //
    // Defaults to TRUE so the upload path is unchanged and cannot be silently
    // disarmed by a caller that forgets the argument. Only re-extraction passes
    // false: it re-runs the pipeline over a document the user already has, and
    // must not bill them a second time for it.
    //
    // Note this is NOT redundant with the scanChargedAt gate below. A FAILED row
    // — the only kind re-extraction accepts — is never stamped, because every
    // writer of FAILED (markAsFailed, staleSweepService, the uploadController
    // background catch) is reached only after the charge transaction rolled
    // back. Left to itself the gate would see null, claim it, and charge. The
    // caller has to say so explicitly.
    chargeScan: boolean = true
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
      const category = await this.categorizeAndSave(tx, documentId, merchantFact, extraction.rawText, extraction.facts);

      // Part 2: Rule Engine Evaluation
      //
      // The keys handed to the rule engine MUST be the canonical ones, because
      // resolveAmount (ruleEngineService.ts:90-99) matches 'manual_amount',
      // 'TOTAL_AMOUNT' and 'amount' by exact string. `extraction.facts` carries
      // the RAW adapter keys — geminiAdapter.ts:227 emits 'Total Amount' — and
      // the canonical form is produced by normalizeFactKey when the row is
      // WRITTEN (:118), which happens after this array used to be built from the
      // raw values. So the engine was matching 'TOTAL_AMOUNT' against
      // 'Total Amount' and never resolving an amount at all: measured at 201 of
      // 201 ingestion decisions reporting "Missing amount", 54 of them on
      // documents that demonstrably held one. The re-evaluation path
      // (documentController.ts:466-476) always passed DB rows and was always
      // correct — the same transform, applied here, makes the two agree.
      const canonicalFacts = extraction.facts.map(f => ({
        ...f,
        key: this.normalizer.normalizeFactKey(f.key)
      }));
      const allFacts = [...canonicalFacts, { key: 'category', valueString: category }];
      await this.evaluateRulesAndSave(tx, documentId, organizationId, merchantFact, allFacts);

      // Claim the scan charge for THIS document, once and only once.
      //
      // This method rewrites an existing stub, so it is re-runnable against the
      // same documentId; before scanChargedAt existed, every re-run incremented
      // the organization again because nothing on the row recorded that it had
      // already paid. `updateMany` with `scanChargedAt: null` in the where is a
      // single conditional UPDATE: it matches only an unstamped row, so a
      // re-persist matches nothing and reports count 0. The row is locked by
      // this transaction for the rest of it, so two concurrent persists of the
      // same document cannot both claim.
      //
      // Both statements run on `tx`, so the stamp and the increment commit
      // together or roll back together — the atomicity of the charge with the
      // extraction write is unchanged, which is the property this must not
      // regress. Order matters: claim first, so a LIMIT_REACHED throw below
      // takes the stamp down with it and the document stays chargeable.
      const scanCharge = chargeScan
        ? await tx.document.updateMany({
            where: { id: documentId, scanChargedAt: null },
            data: { scanChargedAt: new Date() }
          })
        : { count: 0 };

      if (!chargeScan) {
        // Re-extraction. scanChargedAt is deliberately left as it was — NULL for
        // a FAILED row — because the column means "this document consumed a
        // scan", and it did not. Stamping it here to make the gate idempotent
        // would be recording a charge that never happened.
        console.log(`[Persistence] Re-extraction of ${documentId}: charging skipped by caller.`);
      } else if (scanCharge.count === 0) {
        console.log(`[Persistence] Document ${documentId} was already charged a scan; not charging again.`);
      } else {
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
      const category2 = await this.categorizeAndSave(tx, doc.id, merchantFact2, extraction.rawText, extraction.facts);

      // Part 2: Rule Engine Evaluation
      // Canonical keys, for the same reason as the sibling site above. Kept
      // identical so the two paths cannot drift apart again.
      const canonicalFacts2 = extraction.facts.map(f => ({
        ...f,
        key: this.normalizer.normalizeFactKey(f.key)
      }));
      const allFacts2 = [...canonicalFacts2, { key: 'category', valueString: category2 }];
      await this.evaluateRulesAndSave(tx, doc.id, organizationId, merchantFact2, allFacts2);

      // Same claim-then-charge gate as updateDocumentWithExtraction. Here the
      // document was created a few statements ago inside this transaction, so
      // the claim always matches and this is not a de-duplication in practice.
      // It is kept identical on purpose: it makes "scanChargedAt is non-null iff
      // this document has consumed a scan" true for EVERY row this codebase
      // writes, so a document created down this path cannot later be re-persisted
      // through the sibling method and charged a second time.
      const scanCharge = await tx.document.updateMany({
        where: { id: doc.id, scanChargedAt: null },
        data: { scanChargedAt: new Date() }
      });

      if (scanCharge.count === 0) {
        console.log(`[Persistence] Document ${doc.id} was already charged a scan; not charging again.`);
      } else {
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
   * Records that extraction failed, so a failed extraction is distinguishable
   * from a genuinely blank document.
   *
   * Today they are identical in the database: both leave rawText '' and
   * overallConfidence 0, and the only trace of a failure is a console.error in
   * Railway stdout, which rotates and cannot be queried. 172 of 343 production
   * documents (50.1%) carry that shape and nothing separates them.
   *
   * Written OUTSIDE the persist transaction on purpose: if the extraction write
   * also rolls back, the record of the failure must still stand — otherwise the
   * worst failures are the ones that leave the least evidence.
   *
   * `errorClass` is the error's constructor name, never its message. A vendor
   * error can echo the storage key, which embeds the sanitized filename
   * (redaction.ts ERROR-OBJECT POLICY), so nothing user-derived is persisted;
   * the class plus the attempt count is enough to group failures.
   */
  public async recordExtractionFailure(
    documentId: string,
    errorClass: string,
    attempts: number
  ): Promise<void> {
    // Replace rather than accumulate: DocumentFact carries no timestamp, so two
    // rows would be indistinguishable. Same idiom as the rule-result facts.
    await this.prisma.documentFact.deleteMany({
      where: { documentId, key: 'extraction_error' }
    });
    await this.prisma.documentFact.create({
      data: {
        documentId,
        factType: 'EXTRACTION_ERROR',
        key: 'extraction_error',
        valueString: errorClass,
        valueNumber: attempts,
        confidence: 1.0,
        sourceSpan: 'extraction_failure',
        isReviewed: false
      }
    });
    console.warn(`[Persistence] Recorded extraction failure for ${documentId}: ${errorClass} after ${attempts} attempt(s).`);
  }

  /**
   * Records which A/B arm ran for this document, and what the vendor said the
   * model actually was.
   *
   * NO SCHEMA CHANGE: this rides DocumentFact as a keyed row, exactly as
   * extraction_error does (:436-450), for the same reasons — additive, no
   * migration, and nothing outside the experiment reads it.
   *
   * Written for EVERY document that attempted extraction, success or failure.
   * That is the point, not thoroughness: the metric is extraction-call success
   * rate per arm, so a document that records nothing drops out of the
   * denominator — and if only successes recorded, the better arm would lose
   * more rows and the experiment would manufacture its own result.
   *
   * `sourceSpan` carries the arm because that is the column the existing
   * provenance families already use ('extraction_failure', 'user_status_change')
   * and because it stays readable when the resolved version does not.
   *
   * The requested id is stored EXPLICITLY rather than recomputed from the arm:
   * GEMINI_PINNED_MODEL is overridable at runtime, so arm -> model is a stable
   * mapping only until someone retunes it, and a record that cannot be re-read
   * afterwards is not a record.
   *
   * Nothing user-derived is persisted — a model id and an arm, both drawn from
   * closed vocabularies we control (redaction.ts ERROR-OBJECT POLICY).
   */
  public async recordExtractionModel(
    documentId: string,
    arm: string,
    requestedModelId: string,
    resolvedModelVersion: string | null
  ): Promise<void> {
    // Replace rather than accumulate: DocumentFact carries no timestamp, so two
    // rows would be indistinguishable. Same idiom as extraction_error.
    await this.prisma.documentFact.deleteMany({
      where: { documentId, key: 'extraction_model' }
    });
    await this.prisma.documentFact.create({
      data: {
        documentId,
        factType: 'EXTRACTION_MODEL',
        key: 'extraction_model',
        valueString: `${requestedModelId} -> ${resolvedModelVersion || 'unavailable'}`,
        confidence: 1.0,
        sourceSpan: arm,
        isReviewed: false
      }
    });
    console.log(`[Persistence] Recorded extraction model for ${documentId}: arm=${arm} requested=${requestedModelId} resolved=${resolvedModelVersion || 'unavailable'}`);
  }

  /**
   * Terminal fallback for when markAsNeedsReview ITSELF failed.
   *
   * NEEDS_REVIEW is unreachable at that point by construction — the call that
   * writes it is the call that just threw — and the row would otherwise be left
   * in PROCESSING with nothing working on it, because processUploadAsync
   * swallows the failure and resolves.
   *
   * This writes exactly what staleSweepService.ts writes for the same rows
   * (status FAILED + processedAt), 15-20 minutes earlier. It is not a new
   * state, it is the same state on time.
   */
  public async markAsFailed(documentId: string): Promise<void> {
    console.warn(`[Persistence] Terminal fallback: Marking document ${documentId} as FAILED.`);
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'FAILED',
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
  ): Promise<string> {
    try {
      // 1. Check if category already exists to avoid overwriting
      const existing = await tx.documentFact.findFirst({
        where: { documentId, key: 'category' }
      });

      if (existing) return existing.valueString || 'Other';

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
          // REQUIRED by schema.prisma:167 — its absence is what made this whole
          // method inert. Prisma rejected the create CLIENT-SIDE ("Argument
          // `sourceSpan` is missing"), so no query ever reached Postgres, the
          // transaction was never poisoned, and the catch below swallowed it: no
          // CATEGORY fact has ever been written and every document has been
          // categorized 'Other' since the feature shipped.
          //
          // A sentinel, because a categorization has no natural span in the
          // document. That is the settled convention here, not an invention —
          // ':475/:489' use 'rule_engine', documentController.ts uses
          // 'user_correction' (:420), 'user_justification' (:439),
          // 'review_flow' (:457) and 'rule_engine_reval' (:491, :504), and
          // geminiAdapter.ts:222/:232/:242 use descriptive spans of their own.
          sourceSpan: 'auto_categorization',
          isReviewed: confidence >= CONFIDENCE_THRESHOLD
        }
      });

      return category;
    } catch (err) {
      // THE SWALLOW STAYS, deliberately. Categorization is a secondary
      // enrichment; the extracted text, facts and entities are the primary
      // artifact. This runs INSIDE the caller's $transaction, so rethrowing
      // would roll the whole persist back — ingestionService would catch it and
      // force NEEDS_REVIEW, leaving a row with rawText '' and confidence 0. That
      // row is then content-dead: NEEDS_REVIEW is deliberately excluded from
      // re-extraction v1, so the only recovery is re-uploading, which creates a
      // new row and consumes a scan. Failing a whole document because an
      // enrichment failed is a strictly worse outcome than shipping it
      // uncategorized.
      //
      // What was actually wrong was the SILENCE, not the swallow: the line below
      // handed the raw error object to console.error (against the ERROR-OBJECT
      // POLICY in redaction.ts, the one #181/#182 enforced elsewhere) and said
      // nothing about the consequence, so it read as noise for the entire life
      // of the bug. It now names the outcome, so an inert categorizer is
      // greppable rather than inferable.
      console.error(
        `[Persistence] Auto-categorization failed for ${documentId}; document will have NO category:`,
        formatErrorForLog(err)
      );
      return 'Other';
    }
  }

  /**
   * Evaluates business rules and saves the decision result.
   */
  private async evaluateRulesAndSave(
    tx: any,
    documentId: string,
    organizationId: string,
    merchantName: string | null,
    facts: any[]
  ): Promise<void> {
    try {
      const result = await this.ruleEngine.evaluate(documentId, organizationId, facts, merchantName);

      // Clean up existing rule result facts to avoid duplicates on re-processing
      await tx.documentFact.deleteMany({
        where: {
          documentId,
          key: { in: ['decision', 'decision_reason'] }
        }
      });

      // Store Decision Fact
      await tx.documentFact.create({
        data: {
          documentId,
          factType: 'RULE_RESULT',
          key: 'decision',
          valueString: result.decision,
          confidence: 1.0,
          sourceSpan: 'rule_engine',
          isReviewed: false
        }
      });

      // Store Reasons Fact
      if (result.reasons.length > 0) {
        await tx.documentFact.create({
          data: {
            documentId,
            factType: 'RULE_RESULT',
            key: 'decision_reason',
            valueString: result.reasons.join(', '),
            confidence: 1.0,
            sourceSpan: 'rule_engine',
            isReviewed: false
          }
        });
      }

      console.log(`[Persistence] Rule evaluation complete for ${documentId}. Decision: ${result.decision}`);
    } catch (err) {
      // Same ERROR-OBJECT POLICY fix as the sibling catch above, and the same
      // reasoning for keeping the swallow: this also runs inside the caller's
      // transaction, so rethrowing would discard the extraction over a failed
      // enrichment. Leaving one raw-error log beside a corrected one is how the
      // policy erodes, so both are routed through formatErrorForLog.
      console.error(
        `[Persistence] Rule evaluation failed for ${documentId}; document will have NO decision fact:`,
        formatErrorForLog(err)
      );
    }
  }
}