import { PrismaClient } from '@prisma/client';

export interface RuleResult {
  decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED';
  reasons: string[];
}

export class RuleEngineService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Evaluates a set of business rules against the extracted facts for a document.
   * Priority: FLAGGED > NEEDS_REVIEW > APPROVED.
   */
  public async evaluate(
    documentId: string,
    organizationId: string,
    facts: any[],
    merchantName: string | null
  ): Promise<RuleResult> {
    const reasons: string[] = [];
    let decision: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED' = 'APPROVED';

    // 1. Resolve amount based on priority: manual_amount > TOTAL_AMOUNT > amount
    const amount = this.resolveAmount(facts);

    // 2. Helper to extract category (already persisted as fact)
    const categoryFact = facts.find(f => f.key === 'category');
    const category = categoryFact?.valueString ?? null;

    const priority = { FLAGGED: 3, NEEDS_REVIEW: 2, APPROVED: 1 };

    // Function to safely update the decision if the new one is higher priority
    const setDecision = (newD: 'APPROVED' | 'NEEDS_REVIEW' | 'FLAGGED') => {
      if (priority[newD] > priority[decision]) {
        decision = newD;
      }
    };

    // Rule A: amount > 500 -> NEEDS_REVIEW
    if (amount !== null && amount > 500) {
      setDecision('NEEDS_REVIEW');
      reasons.push('Amount exceeds threshold');
    }

    // Rule B: category = "Food" OR merchant is food-related AND amount > 50 -> FLAGGED
    if (amount !== null && amount > 50 && (category === 'Food' || this.isFoodMerchant(merchantName))) {
      setDecision('FLAGGED');
      reasons.push('High food expense');
    }

    // Rule C: missing amount -> NEEDS_REVIEW
    // Only trigger if ALL possible amount sources are missing
    if (amount === null) {
      setDecision('NEEDS_REVIEW');
      reasons.push('Missing amount');
    }

    // Rule D: duplicate merchant + amount -> FLAGGED
    if (merchantName && amount !== null) {
      const isDuplicate = await this.checkDuplicate(documentId, organizationId, merchantName, amount);
      if (isDuplicate) {
        setDecision('FLAGGED');
        reasons.push('Possible duplicate expense');
      }
    }

    return { decision, reasons };
  }

  /**
   * Resolves the "single source of truth" amount using the following priority:
   * 1. manual_amount (User correction)
   * 2. TOTAL_AMOUNT (Stronger AI signal)
   * 3. amount (Default AI extraction)
   */
  private resolveAmount(facts: any[]): number | null {
    const manualAmount = facts.find(f => f.key === 'manual_amount')?.valueNumber;
    if (manualAmount != null) return manualAmount;

    const totalAmount = facts.find(f => f.key === 'TOTAL_AMOUNT')?.valueNumber;
    if (totalAmount != null) return totalAmount;

    const amount = facts.find(f => f.key === 'amount')?.valueNumber;
    return amount ?? null;
  }

  /**
   * Conservative duplicate check: Same merchant name, same amount, different document, same organization.
   * It checks against both raw AI 'amount' and 'manual_amount' in existing documents.
   */
  private async checkDuplicate(
    documentId: string,
    organizationId: string,
    merchantName: string,
    amount: number
  ): Promise<boolean> {
    // Find documents in the same organization with the same vendor name and amount
    const duplicate = await this.prisma.document.findFirst({
      where: {
        organizationId,
        id: { not: documentId },
        documentEntities: {
          some: {
            role: 'VENDOR',
            entity: {
              canonicalName: {
                equals: merchantName,
                mode: 'insensitive'
              }
            }
          }
        },
        facts: {
          some: {
            key: { in: ['amount', 'manual_amount', 'TOTAL_AMOUNT'] },
            valueNumber: amount
          }
        }
      }
    });

    return !!duplicate;
  }

  /**
   * Identifies if a merchant name is likely food or restaurant related.
   * Keywords exclude 'grocery' as per specific business requirements.
   */
  private isFoodMerchant(name: string | null): boolean {
    if (!name) return false;
    const normalized = name.toLowerCase();
    const foodKeywords = [
      'starbucks', 'mcdonalds', 'restaurant', 'cafe', 'uber eats', 'grubhub', 
      'deli', 'bakery', 'fast food', 'pizza', 'burger', 'taco', 'sushi', 
      'grill', 'pub', 'bar', 'bistro', 'steakhouse', 'ramen', 'cafeteria'
    ];
    return foodKeywords.some(keyword => normalized.includes(keyword));
  }
}
