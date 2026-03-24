import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prismaClient';
import { IntentParserService } from '../services/query/intentParser';
import { QueryPlanner } from '../services/query/queryPlanner';
import { QueryExecutor } from '../services/query/queryExecutor';
import { AnswerFormatter } from '../services/query/answerFormatter';
const intentParser = new IntentParserService();
const queryPlanner = new QueryPlanner();
const queryExecutor = new QueryExecutor(prisma);
const answerFormatter = new AnswerFormatter();

const SearchRequestSchema = z.object({
  query: z.string().min(1),
  language: z.enum(['en', 'fr', 'ar']).default('en')
});

export class SearchController {
  public static async executeSearch(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Validation & Input extraction
      const parsedBody = SearchRequestSchema.parse(req.body);
      const { query, language } = parsedBody;

      // Temporary Auth layer MVP header fallback
      const userId = (req as any).user.id;
      const organizationId = (req as any).user.organizationId;

      // 2. Parse NLP Intent (Language-aware)
      const intent = await intentParser.parseUserQuery(query, language);

      // 3. Generate Plan
      const plan = queryPlanner.generatePlan(intent);

      // 4. strictly Execute DB binding User & Plan
      const executionResult = await queryExecutor.execute(userId, organizationId, query, language, intent, plan);

      // 5. Format securely via Template guarantees
      const formattedResponse = await answerFormatter.formatAnswer(executionResult);

      // Final Assembly for frontend DTO matching
      const finalPayload = {
        ...executionResult,
        data: formattedResponse.payload,
        answerText: formattedResponse.answerText,
        metadata: formattedResponse.metadata
      };

      return res.status(200).json(finalPayload);
    } catch (error) {
       next(error);
    }
  }
}
