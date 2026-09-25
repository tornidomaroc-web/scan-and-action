import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { readReceiptSearch } from '../services/ledger/receiptSearchService';
import { isCategory } from '../services/ledger/receiptSearch';
import { isValidMonth, isValidTimeZone } from '../services/ledger/ledgerCore';

const MAX_QUERY_LENGTH = 200;

export class ReceiptSearchController {
  /**
   * GET /api/search?q=<text>&category=<one of eight>&month=YYYY-MM&tz=<IANA zone>
   *
   * Every parameter is optional; with none the response is the most recent
   * receipts. The organisation is the caller's, from authMiddleware, and
   * nothing else: no query field can name another one.
   */
  public static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, MAX_QUERY_LENGTH) : '';
      const category = req.query.category === undefined || req.query.category === '' ? null : req.query.category;
      const month = req.query.month === undefined || req.query.month === '' ? null : req.query.month;
      const tz = req.query.tz ?? 'UTC';
      if (category !== null && !isCategory(category)) return res.status(400).json({ error: 'INVALID_CATEGORY' });
      if (month !== null && !isValidMonth(month)) return res.status(400).json({ error: 'INVALID_MONTH' });
      if (!isValidTimeZone(tz)) return res.status(400).json({ error: 'INVALID_TIME_ZONE' });

      return res.status(200).json(await readReceiptSearch(prisma, organizationId, { q, category, month, timeZone: tz }));
    } catch (error) {
      next(error);
    }
  }
}
