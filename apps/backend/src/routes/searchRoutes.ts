import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { ReceiptSearchController } from '../controllers/receiptSearchController';
import { searchLimiter } from '../middleware/rateLimits';

const router = Router();

// GET /api/search?q=&category=&month=&tz= : the Search screen since the
// 2026-09-25 redraw. A read on the ledger's rules, like GET /api/ledger, and
// like it unlimited: the screen asks on every settled keystroke.
router.get('/', ReceiptSearchController.search);

// POST /api/search: the ask path of the Search screen before the redraw. No
// screen in this bundle calls it; the Android closed-testing build of that
// screen still does (Capacitor ships the bundle it was built with), so it
// stays until that build is superseded.
router.post('/', searchLimiter, SearchController.executeSearch);

export default router;
