import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ExpenseSummaryService } from '../services/expenseSummaryService';

const prisma = new PrismaClient();
const summaryService = new ExpenseSummaryService(prisma);

export class ExpenseController {
  
  public async getSummary(req: Request, res: Response) {
    try {
      // Organization ID extraction from user memberships
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
      }

      // We assume the user belongs to at least one organization for this demo
      const membership = await prisma.membership.findFirst({
        where: { userId }
      });

      if (!membership) {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }

      const organizationId = membership.organizationId;
      const summary = await summaryService.getSummary(organizationId);

      return res.json(summary);
    } catch (error: any) {
      console.error('[ExpenseController] Failed to fetch summary:', error);
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
}
