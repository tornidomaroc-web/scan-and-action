import { Router } from 'express';
import searchRoutes from './searchRoutes';
import reportRoutes from './reportRoutes';
import documentRoutes from './documentRoutes';
import userRoutes from './userRoutes';
import expenseRoutes from './expenseRoutes';
import accountRoutes from './accountRoutes';
import { DocumentController } from '../controllers/documentController';

const router = Router();

router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/documents', documentRoutes);
router.use('/user', userRoutes);
router.use('/expenses', expenseRoutes);
router.use('/account', accountRoutes);

// Extract review to top level as requested: GET /api/review
router.get('/review', DocumentController.getReviewQueue);

export default router;
