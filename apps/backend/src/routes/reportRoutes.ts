import { Router } from 'express';
import { ReportController } from '../controllers/reportController';

const router = Router();

router.get('/:id', ReportController.getReport);

export default router;
