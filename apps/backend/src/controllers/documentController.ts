import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { mapDocumentToDto, mapDocumentListToDto } from '../dto/documentDto';
import { getSignedFileUrl } from '../services/storage/getSignedFileUrl';
import { downloadFromSupabase } from '../services/storage/supabaseStorage';
import { IngestionService } from '../services/ingestion/ingestionService';
import { formatErrorForLog } from '../redaction';
import { RuleEngineService } from '../services/ruleEngineService';
import { computeDashboardAnalytics } from '../services/dashboardStatsService';

const ingestionService = new IngestionService(prisma);

// The ONLY source state a re-extraction may start from.
//
// A whitelist, not a blacklist, so a status added later is refused by default
// rather than silently becoming re-extractable. Why each of the others is out:
//   PROCESSING    — something is already writing this row; two writers, no lock.
//   COMPLETED     — re-extraction would destroy reviewed data.
//   NEEDS_REVIEW  — these carry user-edited facts that a re-extraction would
//                   silently overwrite. Out of v1 by decision, not oversight.
//   LIMIT_REACHED — the row exists BECAUSE the org was over quota
//                   (uploadController.ts:127); re-running it for free would hand
//                   back the scan the limit just refused.
//   REJECTED      — a deliberate user decision; nothing to recover.
const REEXTRACTABLE_STATUS = 'FAILED';

export class DocumentController {
  public static async getDocumentDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await prisma.document.findFirst({
        where: { 
          id: req.params.id as string,
          organizationId: req.user.organizationId
        } as any,
        include: {
          facts: true,
          documentEntities: {
            include: { entity: true }
          }
        }
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const signedFileUrl = await getSignedFileUrl(doc.fileUrl);

      return res.status(200).json({
        ...mapDocumentToDto(doc),
        signedFileUrl
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getReviewQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.document.findMany({
        where: {
          organizationId: req.user.organizationId,
          status: 'NEEDS_REVIEW'
        } as any,
        include: {
          facts: true,
          documentEntities: {
            include: { entity: true }
          }
        },
        orderBy: { uploadedAt: 'desc' },
        take: 50
      });

      return res.status(200).json(mapDocumentListToDto(docs));
    } catch (error) {
      next(error);
    }
  }

  public static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user.organizationId;
      if (!organizationId) {
        console.error('[DocumentController] Missing organizationId in request user context');
        return res.status(401).json({ error: 'User organization context not found' });
      }

      console.log(`[DocumentController] Computing stats for org: ${organizationId}`);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(organizationId)) {
        console.error(`[DocumentController] INVALID UUID detected in getStats: ${organizationId}`);
        return res.status(400).json({ error: 'Invalid organization context' });
      }

      // UTC reference instant for the month-window analytics (PR-C1). Captured
      // once so every bucket boundary is computed against the same clock.
      const now = new Date();

      const [totalCount, pendingCount, avgResult, organization, analytics] = await Promise.all([
        prisma.document.count({
          where: {
            organizationId,
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          } as any
        }),
        prisma.document.count({
          where: {
            organizationId,
            status: 'NEEDS_REVIEW'
          } as any
        }),
        prisma.document.aggregate({
          where: {
            organizationId,
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          } as any,
          _avg: { overallConfidence: true }
        }),
        prisma.organization.findUnique({
          where: { id: organizationId as string },
          select: { plan: true }
        }),
        // Additive analytics block (statusBreakdown / monthlySeries / periods).
        // Org-scoped internally; runs concurrently with the queries above.
        computeDashboardAnalytics(organizationId, now)
      ]);

      const averageConfidence = (avgResult && avgResult._avg)
        ? (avgResult._avg.overallConfidence ?? 0)
        : 0;

      const payload = {
        // Unchanged legacy fields — old clients keep working.
        totalCount: totalCount || 0,
        pendingCount: pendingCount || 0,
        averageConfidence: Number(averageConfidence),
        plan: organization?.plan || 'FREE',
        // New additive analytics (PR-C1). Consumed by the dashboard in PR-C2.
        statusBreakdown: analytics.statusBreakdown,
        monthlySeries: analytics.monthlySeries,
        periods: analytics.periods
      };
      
      console.log(`[DocumentController] Stats computed successfully for ${organizationId} (Plan: ${payload.plan})`);
      return res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }

  public static async getAllDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.document.findMany({
        where: {
          organizationId: (req as any).user.organizationId
        } as any,
        orderBy: { uploadedAt: 'desc' },
        take: 100 // Minimal v1 cap
      });

      return res.status(200).json(mapDocumentListToDto(docs));
    } catch (error) {
      next(error);
    }
  }

  public static async getRecentDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.document.findMany({
        where: {
          organizationId: req.user.organizationId,
          status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
        } as any,
        orderBy: { uploadedAt: 'desc' },
        take: 10
      });

      return res.status(200).json(mapDocumentListToDto(docs));
    } catch (error) {
      next(error);
    }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const organizationId = req.user.organizationId;

      console.log(`[DocumentController] Updating document ${id} to status: ${status} for org: ${organizationId}`);

      if (!['COMPLETED', 'NEEDS_REVIEW', 'REJECTED'].includes(status)) {
        console.warn(`[DocumentController] Invalid status transition attempt: ${status}`);
        return res.status(400).json({ error: 'Invalid status transition' });
      }

      // We use findFirst then update if we want to be 100% sure of ownership without unique index constraints
      const doc = await prisma.document.findFirst({
        where: { id: id as string, organizationId: organizationId as string }
      });

      if (!doc) {
        console.error(`[DocumentController] Document not found or unauthorized: ${id} (Org: ${organizationId})`);
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      const updated = await prisma.document.update({
        where: { id: id as string },
        data: { status }
      });

      console.log(`[DocumentController] Status updated successfully for ${id}`);
      return res.status(200).json(mapDocumentToDto(updated));
    } catch (error: any) {
      console.error('[DocumentController] FATAL: updateStatus execution failed:', error.message || error);
      next(error);
    }
  }

  /**
   * POST /:id/reextract — re-run extraction over a FAILED document's stored
   * file, without a re-upload and without consuming a scan.
   *
   * The file is already in Supabase storage at the row's fileUrl, so recovery
   * needs no new bytes from the user. Before this endpoint the only route back
   * was uploading the file again, which creates a NEW row and charges a scan.
   *
   * ORDER MATTERS and is the safety property:
   *   1. findFirst scoped to { id, organizationId }  -> 404 on a miss. Same
   *      shape as getDocumentDetail and updateStatus; org isolation comes from
   *      the where clause, not from a role check (no endpoint here gates on
   *      role, and this one does not become the first).
   *   2. Source-state whitelist -> 409.
   *   3. DOWNLOAD, which is both the fetch and the existence probe, BEFORE any
   *      write. A missing object therefore leaves the row exactly as it was.
   *   4. Only then, a CONDITIONAL claim of the row (where status is still
   *      FAILED). Two concurrent callers cannot both win it, which matters
   *      because facts are created rather than upserted — a double run would
   *      append a duplicate set.
   */
  public static async reextractDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const doc = await prisma.document.findFirst({
        where: { id: id as string, organizationId: organizationId as string }
      });

      if (!doc) {
        console.warn(`[DocumentController] Re-extraction target not found or not in org: ${id}`);
        return res.status(404).json({ error: 'Document not found' });
      }

      if (doc.status !== REEXTRACTABLE_STATUS) {
        console.warn(`[DocumentController] Re-extraction refused for ${id}: status is ${doc.status}`);
        return res.status(409).json({
          error: `Only a ${REEXTRACTABLE_STATUS} document can be re-extracted; this one is ${doc.status}.`,
          code: 'INVALID_SOURCE_STATE'
        });
      }

      // The existence probe. Deliberately before any write: if the object is
      // gone, the row stays FAILED and no scan is consumed.
      let file: { buffer: Buffer; mimeType: string };
      try {
        file = await downloadFromSupabase(doc.fileUrl);
      } catch (downloadErr: any) {
        // The storage layer already logged a bounded projection; this line adds
        // the documentId, which is the handle that resolves back to the row.
        console.error(
          `[DocumentController] Re-extraction source unavailable for ${id}:`,
          formatErrorForLog(downloadErr)
        );
        return res.status(409).json({
          error: 'The stored file for this document is no longer available.',
          code: 'SOURCE_FILE_UNAVAILABLE'
        });
      }

      // Conditional claim — the lock. count 0 means the row moved out of FAILED
      // between the read above and here, i.e. someone else got there first.
      const claim = await prisma.document.updateMany({
        where: {
          id: id as string,
          organizationId: organizationId as string,
          status: REEXTRACTABLE_STATUS
        },
        data: { status: 'PROCESSING' }
      });

      if (claim.count === 0) {
        console.warn(`[DocumentController] Re-extraction claim lost for ${id}; another run has it.`);
        return res.status(409).json({
          error: 'A re-extraction for this document is already in progress.',
          code: 'REEXTRACTION_IN_PROGRESS'
        });
      }

      console.log(`[DocumentController] Re-extracting ${id} (${file.mimeType}, ${file.buffer.length} bytes). No scan will be charged.`);
      res.status(202).json({ documentId: doc.id, status: 'PROCESSING', reextracting: true });

      // Fire-and-forget, after the response is written. Not wrapped in
      // setImmediate (unlike uploadController): the download above already
      // awaited, so the response is written at the same point in the event loop
      // either way, and dispatching synchronously keeps the call observable
      // without a scheduling tick. The try/catch guards a SYNCHRONOUS throw the
      // way .catch guards a rejection — nothing here may touch `res` again.
      try {
        void ingestionService
          .processUploadAsync(
            doc.id,
            doc.userId,
            organizationId as string,
            file.buffer,
            file.mimeType,
            doc.originalFileName,
            doc.fileUrl,
            { chargeScan: false }
          )
          .catch((err: any) => {
            console.error(`[DocumentController] Background re-extraction failed for ${id}:`, formatErrorForLog(err));
          });
      } catch (dispatchErr: any) {
        console.error(`[DocumentController] Could not dispatch re-extraction for ${id}:`, formatErrorForLog(dispatchErr));
      }
      return;
    } catch (error: any) {
      console.error('[DocumentController] FATAL: reextractDocument execution failed:', formatErrorForLog(error));
      next(error);
    }
  }

  public static async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user.organizationId;
      
      const docs = await prisma.document.findMany({
        where: { organizationId: organizationId as string } as any,
        include: {
          facts: true,
          documentEntities: {
            include: { entity: true }
          }
        },
        orderBy: { uploadedAt: 'desc' }
      });

      const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const csvRows = [];

      // CSV Header - Using 'Merchant' as the primary entity semantic in this application
      csvRows.push(['Document ID', 'File Name', 'Status', 'Confidence', 'Uploaded At', 'Date', 'Merchant', 'Amount'].join(','));

      for (const doc of docs) {
        const dateFact = doc.facts.find(f => f.factType === 'DATE');
        const amountFact = doc.facts.find(f => f.factType === 'AMOUNT');
        const merchantEntity = doc.documentEntities.find(e => e.role === 'ISSUER' || e.role === 'Issuer' || e.role === 'VENDOR');

        const row = [
          escape(doc.id),
          escape(doc.originalFileName || 'unnamed_document'),
          escape(doc.status),
          escape(`${((doc.overallConfidence ?? 0) * 100).toFixed(1)}%`),
          escape(doc.uploadedAt instanceof Date ? doc.uploadedAt.toISOString() : ''),
          escape(dateFact?.valueDate ? (dateFact.valueDate instanceof Date ? dateFact.valueDate.toISOString().split('T')[0] : '') : (dateFact?.valueString || '')),
          escape((merchantEntity as any)?.entity?.canonicalName || ''),
          escape(amountFact?.valueNumber || '')
        ];
        csvRows.push(row.join(','));
      }

      const csvString = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="scan-action-export-${new Date().toISOString().split('T')[0]}.csv"`);
      
      return res.status(200).send(csvString);
    } catch (error) {
      console.error('[DocumentController] Export CSV failed:', error);
      next(error);
    }
  }

  public static async applyFixAction(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { actionType, payload } = req.body;
      const organizationId = (req as any).user.organizationId;
      const documentId = id as string;

      console.log(`[DocumentController] Applying fix action ${actionType} to document ${documentId} for org: ${organizationId}`);

      const doc = await prisma.document.findFirst({
        where: { id: documentId, organizationId: organizationId as string }
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      await prisma.$transaction(async (tx) => {
        if (actionType === 'amount_corrected') {
          const { amount } = payload;
          if (amount === undefined || amount === null) throw new Error('Missing amount');

          await tx.documentFact.deleteMany({
            where: { documentId, key: 'manual_amount' }
          });

          await tx.documentFact.create({
            data: {
              documentId,
              factType: 'AMOUNT',
              key: 'manual_amount',
              valueNumber: parseFloat(amount),
              confidence: 1.0,
              sourceSpan: 'user_correction',
              isReviewed: true
            }
          });
        } else if (actionType === 'marked_valid' || actionType === 'note_added') {
          const { justification } = payload;
          if (!justification) throw new Error('Missing justification');

          await tx.documentFact.deleteMany({
            where: { documentId, key: 'justification_note' }
          });

          await tx.documentFact.create({
            data: {
              documentId,
              factType: 'TEXT',
              key: 'justification_note',
              valueString: justification,
              confidence: 1.0,
              sourceSpan: 'user_justification',
              isReviewed: true
            }
          });
        }

        // Record the review action
        await tx.documentFact.deleteMany({
          where: { documentId, key: 'review_action' }
        });

        await tx.documentFact.create({
          data: {
            documentId,
            factType: 'TEXT',
            key: 'review_action',
            valueString: actionType,
            confidence: 1.0,
            sourceSpan: 'review_flow',
            isReviewed: true
          }
        });
      });

      // Part 3: Re-evaluation after user action
      if (actionType === 'amount_corrected' || actionType === 'marked_valid') {
        const updatedDoc = await prisma.document.findUnique({
          where: { id: documentId },
          include: { 
            facts: true,
            documentEntities: { include: { entity: true } }
          }
        });

        if (updatedDoc) {
          const ruleEngine = new RuleEngineService(prisma);
          // Same defect as checkDuplicate's, at the second of two call sites:
          // 'VENDOR' is an entityType, not a role (types/schemas.ts:16-17). Every
          // stored role is 'ISSUER' — 156 rows, zero 'VENDOR' — so this used to
          // resolve null on every re-evaluation, which also left
          // isFoodMerchant blind and reduced Rule B to its summary disjunct.
          const merchantName = updatedDoc.documentEntities.find(de => de.entity?.entityType === 'VENDOR')?.entity?.canonicalName || null;
          const result = await ruleEngine.evaluate(documentId, organizationId, updatedDoc.facts, merchantName);

          await prisma.$transaction(async (tx) => {
            // PART 4: Clean update of decision facts
            await tx.documentFact.deleteMany({
              where: { documentId, key: { in: ['decision', 'decision_reason'] } }
            });

            await tx.documentFact.create({
              data: {
                documentId,
                factType: 'RULE_RESULT',
                key: 'decision',
                valueString: result.decision,
                confidence: 1.0,
                sourceSpan: 'rule_engine_reval',
                isReviewed: true
              }
            });

            if (result.reasons.length > 0) {
              await tx.documentFact.create({
                data: {
                  documentId,
                  factType: 'RULE_RESULT',
                  key: 'decision_reason',
                  valueString: result.reasons.join(', '),
                  confidence: 1.0,
                  sourceSpan: 'rule_engine_reval',
                  isReviewed: true
                }
              });
            }
          });
        }
      }

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[DocumentController] Action failed:', error.message);
      res.status(400).json({ error: error.message });
    }
  }
}