import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { QueryExecutor } from '../services/query/queryExecutor';
import { AnswerFormatter } from '../services/query/answerFormatter';
import { QueryPlan } from '../types/querySchemas';

const queryExecutor = new QueryExecutor(prisma);
const answerFormatter = new AnswerFormatter();

export class ReportController {
  public static async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const language = (req.query.language as string) || 'en';
      const userId = (req as any).user.id;
      const organizationId = (req as any).user.organizationId;

      let plan: QueryPlan;

      // `monthly_expenses` was removed 2026-09-23: it grouped on the fact key
      // EXPENSE_CATEGORY, which nothing has ever written, and had no date
      // filter. The month's money is GET /api/ledger.
      switch (id) {
        case 'recent_cards':
          plan = {
            sourceTables: ['Document'],
            joins: [],
            filters: [
              { field: 'Document.documentType', operator: 'eq', value: 'BUSINESS_CARD' }
            ],
            outputMode: 'table'
          };
          break;
        default:
          return res.status(404).json({ error: `Report blueprint ${id} not found.` });
      }

      // Execute natively through execution engine bypassing LLM Parser completely
      const intent: any = { 
        intent: 'list_documents',
        outputFormat: plan.outputMode, 
        confidence: 1, 
        needsClarification: false 
      };
      
      const executionResult = await queryExecutor.execute(userId, organizationId, `report:${id}`, language, intent, plan);
      const resultDto = await answerFormatter.formatAnswer(executionResult);

      return res.status(200).json(resultDto);
    } catch (error) {
      next(error);
    }
  }
}
