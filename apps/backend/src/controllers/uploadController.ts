import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { IngestionService } from '../services/ingestion/ingestionService';

const ingestionService = new IngestionService(prisma);

export class UploadController {
  public static async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      const userId = (req as any).user.id;

      if (!file) {
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      const fileUrl = `https://local.storage.mock/${file.originalname}`;

      const result = await ingestionService.processUpload(
        userId,
        file.buffer,
        file.mimetype,
        file.originalname,
        fileUrl
      );

      return res.status(201).json({
        message: 'Document ingested and structured successfully',
        documentId: result.documentId
      });
    } catch (error) {
      next(error);
    }
  }
}