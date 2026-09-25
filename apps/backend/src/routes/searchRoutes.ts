import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { ReceiptSearchController } from '../controllers/receiptSearchController';
import { searchLimiter } from '../middleware/rateLimits';

const router = Router();

// GET /api/search?q=&category=&month=&tz= : the Search screen of the
// 2026-09-25 redraw (#250). A read on the ledger's rules, like GET /api/ledger,
// and like it unlimited: the screen asks on every settled keystroke. Merged
// ahead of that screen so the new frontend never reaches a backend without it.
router.get('/', ReceiptSearchController.search);

// POST /api/search: the ask path, which the Search screen on main still calls
// and the Android closed-testing build calls until that build is superseded.
router.post('/', searchLimiter, SearchController.executeSearch);

export default router;
