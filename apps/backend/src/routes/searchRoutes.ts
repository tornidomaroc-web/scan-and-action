import { Router } from 'express';
import { SearchController } from '../controllers/searchController';

const router = Router();

router.post('/', SearchController.executeSearch);

export default router;
