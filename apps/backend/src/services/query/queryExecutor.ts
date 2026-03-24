import { PrismaClient, Prisma } from '@prisma/client';
import { QueryPlan, QueryIntent, QueryResultDto } from '../../types/querySchemas';

export class QueryExecutor {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Translates internal QueryPlan into strictly deterministic Prisma/SQL calls.
   * Guarantees application of all plan filters globally via safe ID sub-scoping.
   */
  public async execute(userId: string, organizationId: string, rawQueryText: string, sourceLanguage: string, intent: QueryIntent, plan: QueryPlan): Promise<QueryResultDto> {
    const startTime = Date.now();
    let status = 'SUCCESS';
    let errorMessage = null;
    let data: any = null;
    let resultCount = 0;
    const metadata: any = {};

    try {
      if (plan.requiresClarification) {
         data = { message: 'CLARIFICATION_REQUIRED' };
         return this.formatResult(intent, plan, data, 0, startTime, sourceLanguage, metadata, plan.explanation);
      }

      // We explicitly compile ALL planner logical constraints into a rigid base document filter constraint.
      const baseWhere: any = { organizationId, AND: [] };
      
      for (const filter of plan.filters) {
          if (filter.field === 'Document.documentType') {
             if (filter.operator === 'eq') {
                baseWhere.AND.push({ documentType: filter.value });
             } else {
                baseWhere.AND.push({ documentType: { in: filter.value } });
             }
          } else if (filter.field === 'Document.uploadedAt') {
             baseWhere.AND.push({ uploadedAt: { [filter.operator]: filter.value } });
          } else if (filter.field === 'Entity.canonicalName') {
             baseWhere.AND.push({ documentEntities: { some: { entity: { canonicalName: { in: filter.value } } } } });
          } else if (filter.field === 'Document.status') {
             if (filter.operator === 'eq') {
                baseWhere.AND.push({ status: filter.value });
             } else {
                baseWhere.AND.push({ status: { in: filter.value } });
             }
          } else if (filter.field === 'ExpenseCategory') {
             baseWhere.AND.push({ facts: { some: { key: 'EXPENSE_CATEGORY', valueString: { in: filter.value } } } });
          }
      }

      if (baseWhere.AND.length === 0) delete baseWhere.AND;

      switch (intent.intent) {
        
        case 'sum_expenses': {
           const amounts = await this.prisma.documentFact.groupBy({
             by: ['currency'],
             _sum: { valueNumber: true },
             where: { 
               factType: 'AMOUNT',
               key: 'TOTAL_AMOUNT',
               document: baseWhere
             }
           });
           
           data = amounts.map(a => ({ currency: a.currency || 'UNKNOWN', sum: a._sum.valueNumber || 0 }));
           metadata.currencies = data.map((d: any) => d.currency);
           metadata.isMixedCurrency = data.length > 1;
           resultCount = data.length;
           break;
        }

        case 'group_expenses': {
           const validDocs = await this.prisma.document.findMany({ select: { id: true }, where: baseWhere });
           const docIds = validDocs.map(d => d.id);
           
           if (docIds.length === 0) {
             data = [];
             break;
           }

           const rawGroups = await this.prisma.$queryRaw<any[]>`
             SELECT 
               cat."valueString" as "category",
               amt."currency" as "currency",
               SUM(amt."valueNumber") as "sum"
             FROM "DocumentFact" amt
             JOIN "DocumentFact" cat ON amt."documentId" = cat."documentId"
             WHERE amt."key" = 'TOTAL_AMOUNT' 
               AND cat."key" = 'EXPENSE_CATEGORY'
               AND amt."documentId"::text = ANY(${docIds})
             GROUP BY cat."valueString", amt."currency"
           `;
           data = rawGroups.map(r => ({
              category: r.category || 'UNCATEGORIZED',
              currency: r.currency || 'UNKNOWN',
              sum: Number(r.sum)
           }));
           resultCount = data.length;
           metadata.groupingContext = 'EXPENSE_CATEGORY';
           break;
        }

        case 'count_documents': {
           data = { count: await this.prisma.document.count({ where: baseWhere }) };
           resultCount = 1;
           break;
        }

        case 'latest_document':
        case 'list_documents':
        case 'timeline': {
           data = await this.prisma.document.findMany({
             where: baseWhere,
             take: plan.limit || 50,
             orderBy: { [plan.sort?.field.split('.').pop() || 'uploadedAt']: plan.sort?.direction || 'desc' },
             include: { facts: true, documentEntities: { include: { entity: true } } }
           });
           resultCount = data.length;
           break;
        }

        case 'extract_contacts': {
           data = await this.prisma.documentEntity.findMany({
             where: { 
               document: baseWhere,
               entity: { entityType: { in: ['PERSON', 'VENDOR', 'CONTACT'] } }
             },
             include: { entity: true }
           });
           resultCount = data.length;
           break;
        }

        case 'find_upcoming_appointments': {
           data = await this.prisma.documentFact.findMany({
             where: { 
               document: baseWhere,
               key: 'APPOINTMENT_DATE', 
               valueDate: { gte: new Date() } 
             },
             include: { document: true },
             orderBy: { valueDate: 'asc' },
             take: plan.limit || 10
           });
           resultCount = data.length;
           break;
        }

        default:
          data = [];
      }

    } catch (err: any) {
      status = 'EXECUTION_ERROR';
      errorMessage = err.message;
      console.error(`[QueryExecutor ERROR]: ${err.message}`);
    } finally {
      const executionTimeMs = Date.now() - startTime;
      
      try {
        await this.prisma.queryLog.create({
          data: {
            userId,
            rawQueryText,
            sourceLanguage,
            parsedIntentJson: JSON.parse(JSON.stringify(intent)),
            queryPlanJson: JSON.parse(JSON.stringify(plan)),
            executionTimeMs,
            resultCount,
            status,
            errorMessage
          }
        });
      } catch (logErr: any) {
        console.error('CRITICAL: Failed to write to QueryLog:', logErr.message);
      }
    }

    if (errorMessage && status === 'EXECUTION_ERROR') {
       throw new Error(`Data Executor Failed: ${errorMessage}`);
    }

    return this.formatResult(intent, plan, data, resultCount, startTime, sourceLanguage, metadata, plan.explanation);
  }

  private formatResult(intent: QueryIntent, plan: QueryPlan, data: any, resultCount: number, startTime: number, sourceLanguage: string, metadata: any, explanation?: string): QueryResultDto {
     return {
         intent: intent.intent,
         outputFormat: plan.outputMode,
         requiresClarification: !!plan.requiresClarification,
         data,
         resultCount,
         executionTimeMs: Date.now() - startTime,
         sourceLanguage,
         explanation,
         metadata
     };
  }
}
