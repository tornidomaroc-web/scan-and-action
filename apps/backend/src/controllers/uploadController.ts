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

      // Emergency Organization Block (Phase-1)
      const blockedIds = (process.env.BLOCKED_ORGANIZATION_IDS || '').split(',').map(id => id.trim());
      if (organizationId && blockedIds.includes(organizationId)) {
        console.warn(`[UploadController] Blocked access for Organization: ${organizationId}`);
        return res.status(403).json({
          error: "ACCOUNT_RESTRICTED",
          message: "Your account access has been temporarily restricted. Please contact support."
        });
      }

      console.log(`[UploadController] Received upload request for user: ${userId} (Org: ${organizationId})`);

      // Early guard for FREE plan limits
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true, scanCount: true }
      });

      if (organization?.plan === 'FREE' && organization.scanCount >= 10) {
        console.warn(`[UploadController] Limit reached for Org: ${organizationId}`);
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: 'Free plan limit reached (10 scans). Please upgrade to PRO.'
        });
      }

      // Rolling 24h Daily Safety Cap (Phase-1)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dailyCount = await prisma.document.count({
        where: {
          organizationId: organizationId,
          uploadedAt: { gte: twentyFourHoursAgo }
        }
      });

      const PRO_DAILY_LIMIT = 200;
      if (organization?.plan === 'PRO' && dailyCount >= PRO_DAILY_LIMIT) {
        console.warn(`[UploadController] PRO Daily Limit reached for Org: ${organizationId}`);
        return res.status(429).json({
          error: 'DAILY_LIMIT_REACHED',
          message: `You have reached your daily upload limit (${PRO_DAILY_LIMIT} scans). Processing will resume in 24 hours.`
        });
      }

      if (!file) {
        console.warn('[UploadController] No file provided in request');
        return res.status(400).json({ error: 'No image file uploaded' });
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

            const isLimitReached = err.message === 'LIMIT_REACHED';
            const finalStatus = isLimitReached ? 'LIMIT_REACHED' : 'FAILED';

            try {
              await prisma.document.update({
                where: { id: documentId },
                data: { status: finalStatus, processedAt: new Date() }
              });
            } catch (updateErr: any) {
              console.error(`[Background] Could not set ${finalStatus} status for ${documentId}:`, updateErr.message);
            }
          });
      });

    } catch (error: any) {
      console.error('[UploadController] Error during upload flow:', error.message || error);
      next(error);
    }
  }
}