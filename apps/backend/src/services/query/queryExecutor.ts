import { PrismaClient, Prisma } from '@prisma/client';
import { QueryPlan, QueryIntent, QueryResultDto } from '../../types/querySchemas';
import { scrubString } from '../../redaction';
import { judge, LEDGER_FACT_KEYS } from '../ledger/ledgerCore';

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
          }
      }

      if (baseWhere.AND.length === 0) delete baseWhere.AND;

      switch (intent.intent) {
        
        case 'sum_expenses': {
           // The ledger's rules, applied by the ledger's own judge: a REJECTED
           // or unread row does not count, a flagged duplicate does not count
           // until it is kept, a correction beats the extraction, and the
           // currency is normalised. Until 2026-09-25 this summed every
           // TOTAL_AMOUNT fact the documents carried, whatever the status,
           // which read USD 64,825.49 for an organisation whose ledger says
           // 32,992.35 (board item (f)). The remaining difference from
           // GET /api/ledger is the period: the planner's date filters are
           // on uploadedAt, the ledger's month is the printed date.
           const rows = await this.prisma.document.findMany({
             where: baseWhere,
             select: {
               id: true, status: true, uploadedAt: true,
               facts: {
                 where: { key: { in: [...LEDGER_FACT_KEYS] } },
                 select: { key: true, valueString: true, valueNumber: true, valueDate: true, currency: true, sourceSpan: true },
               },
             },
           });
           const milli = new Map<string, number>();
           for (const d of rows) {
             const v = judge({ ...d, merchant: null }, 'UTC');
             if (!v.counted) continue;
             const currency = v.currency ?? 'UNKNOWN';
             milli.set(currency, (milli.get(currency) ?? 0) + Math.round(v.receipt.amount * 1000));
           }
           data = [...milli.entries()].map(([currency, m]) => ({ currency, sum: m / 1000 }));
           metadata.currencies = data.map((d: any) => d.currency);
           metadata.isMixedCurrency = data.length > 1;
           resultCount = data.length;
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

        default:
          data = [];
      }

    } catch (err: any) {
      status = 'EXECUTION_ERROR';
      errorMessage = err.message;
      // Scrubbed: a Prisma error here can embed the filter VALUE derived from
      // what the user typed (a merchant, a name). Same scrubber as Sentry.
      console.error(`[QueryExecutor ERROR]: ${scrubString(err.message ?? String(err))}`);
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
