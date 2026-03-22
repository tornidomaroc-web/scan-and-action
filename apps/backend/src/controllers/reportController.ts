import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { QueryExecutor } from '../services/query/queryExecutor';
import { AnswerFormatter } from '../services/query/answerFormatter';
import { QueryPlan } from '../../../../packages/shared/src/querySchemas';

const queryExecutor = new QueryExecutor(prisma);
const answerFormatter = new AnswerFormatter();

export class ReportController {
  public static async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const language = (req.query.language as string) || 'en';
      const userId = (req as any).user.id;

      let plan: QueryPlan;

      switch (id) {
        case 'monthly_expenses':
          plan = {
            sourceTables: ['Document', 'DocumentFact'],
            joins: [],
            intent: 'group_expenses',
            filters: [],
            aggregation: { operation: 'SUM', field: 'TOTAL_AMOUNT' },
            groupBy: ['ExpenseCategory'],
            outputMode: 'chart_ready_data',
            requiresClarification: false
          };
          break;
        case 'recent_cards':
          plan = {
            sourceTables: ['Document', 'DocumentEntity'],
            joins: [],
            intent: 'extract_contacts',
            filters: [
              { field: 'Document.documentType', operator: 'eq', value: 'BUSINESS_CARD' }
            ],
            outputMode: 'table',
            requiresClarification: false
          };
          break;
        default:
          return res.status(404).json({ error: `Report blueprint ${id} not found.` });
      }

      // Execute natively through execution engine bypassing LLM Parser completely
      const intent = { intent: plan.intent, outputFormat: plan.outputMode, confidence: 1, needsClarification: false };
      const executionResult = await queryExecutor.execute(userId, `report:${id}`, language, intent as any, plan);
      const resultDto = await answerFormatter.formatAnswer(executionResult);

      return res.status(200).json(resultDto);
    } catch (error) {
      next(error);
    }
  }
}
