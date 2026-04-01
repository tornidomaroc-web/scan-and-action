import { Router } from 'express';
import { ExpenseController } from '../controllers/expenseController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
const controller = new ExpenseController();

// GET /api/expenses/summary
router.get('/summary', authMiddleware, (req, res) => controller.getSummary(req, res));

export default router;
