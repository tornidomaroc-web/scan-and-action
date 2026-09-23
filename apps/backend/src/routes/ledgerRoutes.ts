import { Router } from 'express';
import { LedgerController } from '../controllers/ledgerController';

const router = Router();

// GET /api/ledger?month=YYYY-MM&tz=Africa/Casablanca
router.get('/', LedgerController.getMonth);

export default router;
