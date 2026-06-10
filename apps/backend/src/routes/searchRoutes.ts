import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { searchLimiter } from '../middleware/rateLimits';

const router = Router();

router.post('/', searchLimiter, SearchController.executeSearch);

export default router;
