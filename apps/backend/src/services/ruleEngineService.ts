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

    // 1. Helper to extract amount
    const amountFact = facts.find(f => f.key === 'amount');
    const amount = amountFact?.valueNumber ?? null;

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

    // Rule B: category = "Food" AND amount > 50 -> FLAGGED
    if (category === 'Food' && amount !== null && amount > 50) {
      setDecision('FLAGGED');
      reasons.push('High food expense');
    }

    // Rule C: missing amount -> NEEDS_REVIEW
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
   * Conservative duplicate check: Same merchant name, same amount, different document, same organization.
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
            key: 'amount',
            valueNumber: amount
          }
        }
      }
    });

    return !!duplicate;
  }
}
