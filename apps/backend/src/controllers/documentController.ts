import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { mapDocumentToDto, mapDocumentListToDto } from '../dto/documentDto';
import { getSignedFileUrl } from '../services/storage/getSignedFileUrl';

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
      const organizationId = (req as any).user?.organizationId;
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

      const [totalCount, pendingCount, avgResult] = await Promise.all([
        prisma.document.count({ where: { organizationId: organizationId as string } as any }),
        prisma.document.count({
          where: {
            organizationId,
            status: 'NEEDS_REVIEW'
          } as any
        }),
        prisma.document.aggregate({
          where: { organizationId } as any,
          _avg: { overallConfidence: true }
        })
      ]);

      const averageConfidence = (avgResult && avgResult._avg) 
        ? (avgResult._avg.overallConfidence ?? 0) 
        : 0;

      const payload = {
        totalCount: totalCount || 0,
        pendingCount: pendingCount || 0,
        averageConfidence: Number(averageConfidence)
      };
      
      console.log(`[DocumentController] Stats computed successfully for ${organizationId}`);
      return res.status(200).json(payload);
    } catch (error) {
      console.error('[DocumentController] FATAL: Stats execution failed:', error);
      next(error);
    }
  }

  public static async getRecentDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.document.findMany({
        where: {
          organizationId: req.user.organizationId
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
}