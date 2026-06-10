import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/documentController';
import { UploadController } from '../controllers/uploadController';
import { uploadIpLimiter, uploadOrgLimiter } from '../middleware/rateLimits';

const router = Router();

// Upload constraints:
// - 10 MB per file: receipts/invoices photographed on a phone stay well under this.
// - 1 file per request: matches the existing upload.single() API contract; the
//   frontend batch UI sends one request per file, and the multi-document
//   pre-check operates on a single image.
// - Mimetype allowlist: only formats the Gemini Vision pipeline can process.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(null, true);
    }
    const err: any = new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF.`);
    err.status = 415;
    cb(err);
  }
});

router.get('/stats', DocumentController.getStats);
router.get('/review', DocumentController.getReviewQueue);
router.get('/export.csv', DocumentController.exportCsv);
router.get('/recent', DocumentController.getRecentDocuments);
router.get('/all', DocumentController.getAllDocuments);
router.get('/:id', DocumentController.getDocumentDetail);
router.patch('/:id/status', DocumentController.updateStatus);
router.post('/:id/action', DocumentController.applyFixAction);
router.post('/upload', uploadIpLimiter, uploadOrgLimiter, upload.single('file'), UploadController.uploadDocument);

export default router;