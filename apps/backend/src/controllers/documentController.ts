import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { mapDocumentToDto, mapDocumentListToDto } from '../dto/documentDto';

export class DocumentController {
  
  public static async getDocumentDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id as string },
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

      return res.status(200).json(mapDocumentToDto(doc));
    } catch (error) {
      next(error);
    }
  }

  public static async getReviewQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await prisma.document.findMany({
        where: {
          OR: [
            { status: 'NEEDS_REVIEW' },
            { overallConfidence: { lt: 0.8 } }
          ]
        },
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
}
