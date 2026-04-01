import { PrismaClient } from '@prisma/client';

export class ExpenseSummaryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public async getSummary(organizationId: string) {
    // 1. Fetch all documents with their relevant facts and entities
    const documents = await this.prisma.document.findMany({
      where: { organizationId },
      include: {
        facts: {
          where: {
            OR: [
              { key: 'amount' },
              { key: 'category' }
            ]
          }
        },
        documentEntities: {
          include: {
            entity: true
          },
          where: {
            role: 'VENDOR'
          }
        }
      }
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalExpenses = 0;
    let totalDocuments = documents.length;
    let last7DaysCount = 0;

    const categoryBreakdown: Record<string, number> = {
      Food: 0,
      Transport: 0,
      Travel: 0,
      Office: 0,
      Software: 0,
      Other: 0
    };

    const merchantSpend: Record<string, number> = {};

    for (const doc of documents) {
      if (doc.uploadedAt >= sevenDaysAgo) {
        last7DaysCount++;
      }

      // Safe amount extraction: Highest confidence amount fact
      const amountFact = doc.facts
        .filter(f => f.key === 'amount' && f.valueNumber !== null)
        .sort((a, b) => b.confidence - a.confidence)[0];

      const amount = amountFact?.valueNumber || 0;
      totalExpenses += amount;

      // Category extraction
      const categoryFact = doc.facts.find(f => f.key === 'category');
      const category = categoryFact?.valueString || 'Other';

      if (categoryBreakdown.hasOwnProperty(category)) {
        categoryBreakdown[category] += amount;
      } else {
        categoryBreakdown['Other'] += amount;
      }

      // Merchant extraction
      const merchantEntity = doc.documentEntities.find(de => de.role === 'VENDOR')?.entity;
      const merchantName = merchantEntity?.canonicalName || 'Unknown';

      if (merchantName !== 'Unknown') {
        merchantSpend[merchantName] = (merchantSpend[merchantName] || 0) + amount;
      }
    }

    // Find top merchant by spend
    let topMerchant = 'None';
    let maxSpend = -1;
    for (const [merchant, spend] of Object.entries(merchantSpend)) {
      if (spend > maxSpend) {
        maxSpend = spend;
        topMerchant = merchant;
      }
    }

    return {
      totalExpenses: Number(totalExpenses.toFixed(2)),
      totalDocuments,
      averageExpense: totalDocuments > 0 ? Number((totalExpenses / totalDocuments).toFixed(2)) : 0,
      categoryBreakdown: {
        Food: Number(categoryBreakdown.Food.toFixed(2)),
        Transport: Number(categoryBreakdown.Transport.toFixed(2)),
        Travel: Number(categoryBreakdown.Travel.toFixed(2)),
        Office: Number(categoryBreakdown.Office.toFixed(2)),
        Software: Number(categoryBreakdown.Software.toFixed(2)),
        Other: Number(categoryBreakdown.Other.toFixed(2))
      },
      topMerchant,
      last7DaysCount
    };
  }
}
