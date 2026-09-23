import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { readLedgerMonth } from '../services/ledger/ledgerService';
import { isValidMonth, isValidTimeZone } from '../services/ledger/ledgerCore';

export class LedgerController {
  /**
   * GET /api/ledger?month=YYYY-MM&tz=<IANA zone, default UTC>
   *
   * The organisation is the caller's, from authMiddleware, and nothing else:
   * no query or body field can name another one.
   */
  public static async getMonth(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) return res.status(401).json({ error: 'UNAUTHORIZED' });

      const { month } = req.query;
      const tz = req.query.tz ?? 'UTC';
      if (!isValidMonth(month)) return res.status(400).json({ error: 'INVALID_MONTH' });
      if (!isValidTimeZone(tz)) return res.status(400).json({ error: 'INVALID_TIME_ZONE' });

      return res.status(200).json(await readLedgerMonth(prisma, organizationId, month, tz));
    } catch (error) {
      next(error);
    }
  }
}
