import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/documentController';
import { UploadController } from '../controllers/uploadController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/stats', DocumentController.getStats);
router.get('/review', DocumentController.getReviewQueue);
router.get('/export.csv', DocumentController.exportCsv);
router.get('/recent', DocumentController.getRecentDocuments);
router.get('/:id', DocumentController.getDocumentDetail);
router.patch('/:id/status', DocumentController.updateStatus);
router.post('/upload', upload.single('file'), UploadController.uploadDocument);

export default router;