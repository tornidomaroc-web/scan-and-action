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

      // Create a stub record immediately so we can return fast
      const stubDoc = await prisma.document.create({
        data: {
          organizationId: organizationId!,
          userId: userId!,
          fileUrl: filePath,
          originalFileName: file.originalname,
          documentType: 'UNKNOWN',
          detectedLanguage: 'en',
          rawText: '',
          normalizedText: '',
          overallConfidence: 0,
          status: 'PROCESSING',
        }
      });

      console.log(`[UploadController] Stub document created: ${stubDoc.id}. Returning 202.`);
      res.status(202).json({ documentId: stubDoc.id, status: 'PROCESSING' });

      // Fire extraction in background — after response is sent
      const fileBuffer = file.buffer;
      const mimeType = file.mimetype;
      const originalFileName = file.originalname;
      const documentId = stubDoc.id;

      setImmediate(() => {
        ingestionService
          .processUploadAsync(documentId, userId!, organizationId!, fileBuffer, mimeType, originalFileName, filePath)
          .catch(async (err: any) => {
            console.error(`[Background] Extraction failed for ${documentId}:`, err.message || err);
            try {
              await prisma.document.update({
                where: { id: documentId },
                data: { status: 'FAILED', processedAt: new Date() }
              });
            } catch (updateErr: any) {
              console.error(`[Background] Could not set FAILED status for ${documentId}:`, updateErr.message);
            }
          });
      });

    } catch (error: any) {
      console.error('[UploadController] Error during upload flow:', error.message || error);
      next(error);
    }
  }
}