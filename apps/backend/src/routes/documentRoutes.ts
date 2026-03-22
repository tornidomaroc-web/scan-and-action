import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/documentController';
import { UploadController } from '../controllers/uploadController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), UploadController.uploadDocument);
router.get('/:id', DocumentController.getDocumentDetail);

export default router;
router.get('/review', DocumentController.getReviewQueue);