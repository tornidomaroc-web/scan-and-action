import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { IngestionService } from '../services/ingestion/ingestionService';
import { uploadToSupabase } from '../services/storage/supabaseStorage';

const ingestionService = new IngestionService(prisma);

export class UploadController {
  public static async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      const userId = req.user?.id;
      const organizationId = req.user?.organizationId;

      console.log(`[UploadController] Received upload request for user: ${userId} (Org: ${organizationId})`);

      if (!file) {
        console.warn('[UploadController] No file provided in request');
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      console.log(`[UploadController DEBUG] Calling validateSingleDocument...`);
      const isSingleDoc = await ingestionService.validateSingleDocument(file.buffer, file.mimetype);
      console.log(`[UploadController DEBUG] isSingleDoc result: ${isSingleDoc}`);

      if (!isSingleDoc) {
        console.warn('[UploadController] Blocked upload: multi-document image detected');
        return res.status(422).json({
          error: 'Please upload a single document per image'
        });
      }

      console.log(`[UploadController] Uploading ${file.originalname} to Supabase storage...`);
      const filePath = await uploadToSupabase(file);
      console.log(`[UploadController] File uploaded to storage at: ${filePath}`);

      console.log(`[UploadController] Triggering ingestion pipeline...`);
      const result = await ingestionService.processUpload(
        userId,
        organizationId,
        file.buffer,
        file.mimetype,
        file.originalname,
        filePath
      );

      console.log(`[UploadController] Upload and ingestion complete for document: ${result.documentId}`);
      return res.status(201).json({
        message: 'Document ingested and structured successfully',
        documentId: result.documentId
      });
    } catch (error: any) {
      console.error('[UploadController] Error during upload flow:', error.message || error);
      next(error);
    }
  }
}