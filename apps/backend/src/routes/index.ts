import { Router } from 'express';
import searchRoutes from './searchRoutes';
import reportRoutes from './reportRoutes';
import documentRoutes from './documentRoutes';
import { DocumentController } from '../controllers/documentController';

const router = Router();

router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/documents', documentRoutes);

// Extract review to top level as requested: GET /api/review
router.get('/review', DocumentController.getReviewQueue);

export default router;
