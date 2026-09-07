import { PrismaClient } from '@prisma/client';
import { matchesAnyKeyword } from '../utils/textMatch';
import { canonicalizeEntityName } from '../utils/canonicalName';

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

    // 0. Fetch summary for fallback detection
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { summary: true }
    });
    const summary = doc?.summary || null;

    // 1. Resolve amount based on priority: manual_amount > TOTAL_AMOUNT > amount
    const amount = this.resolveAmount(facts);

    // 2. The `category` fact is deliberately NOT read here.
    //
    // Rule B used to accept `category === 'Food'` as a third way to flag a food
    // expense. That borrowed the CATEGORIZER's definition of food to make a
    // FLAGGING decision, and the two are not the same question: the categorizer
    // answers "what kind of expense is this?" — where groceries genuinely are
    // food — while this rule answers "should this be flagged as suspicious?",
    // where isFoodMerchant (:154) deliberately EXCLUDES grocery "as per specific
    // business requirements". The disjunct silently overrode that exclusion.
    //
    // It was inert while it lasted, because Rule B short-circuits on the amount
    // and the ingestion path never resolved one. Fixing that mismatch is exactly
    // what would have armed it, so the exclusion is honoured in the same change.
    // The fast-food chains the disjunct legitimately covered were moved into
    // isFoodMerchant instead — see the note there.

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

    // Rule B: merchant OR summary is food-related AND amount > 50 -> FLAGGED
    if (amount !== null && amount > 50 && (this.isFoodMerchant(merchantName) || this.isFoodSummary(summary))) {
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
    // Compare like-vs-like: the stored Entity.canonicalName is the normalized
    // matching key, so the incoming merchant name must be run through the SAME
    // canonical transform before comparing. Without this, the ingestion path
    // (which passes the raw vendor name) never matched an accented/punctuated
    // vendor against the stripped key, silently missing duplicates; only the
    // documentController re-eval path (which passed canonicalName) worked. Both
    // call sites now behave identically (canonicalize is idempotent on an
    // already-canonical value). (item B)
    const canonicalMerchant = canonicalizeEntityName(merchantName);
    // An empty canonical key (e.g. an all-punctuation name) is not a meaningful
    // vendor to dedup on — never flag on it.
    if (!canonicalMerchant) return false;

    // Find documents in the same organization with the same vendor name and amount
    const duplicate = await this.prisma.document.findFirst({
      where: {
        organizationId,
        id: { not: documentId },
        documentEntities: {
          some: {
            // 'VENDOR' is an entityType, NOT a role. types/schemas.ts:16-17
            // documents the two axes: entityType is the enum
            // ['VENDOR','CLIENT','PERSON','OTHER'], while role is free text for
            // the part the entity plays in the document ('Issuer', 'Billed To',
            // 'Attendee'). geminiAdapter.ts:240-241 emits entityType 'VENDOR'
            // with role 'Issuer', and persistence.ts:143 stores the role
            // upper-cased as 'ISSUER'.
            //
            // This filter used to read `role: 'VENDOR'`, a value that has never
            // existed in that column: measured in production, all 156
            // DocumentEntity rows hold role 'ISSUER' and none hold 'VENDOR'. So
            // this lookup never matched and Rule D has never fired once.
            //
            // Keyed on entityType it now agrees with persistence.ts:156, which
            // already picks the merchant that way. No stored row changes.
            entity: {
              entityType: 'VENDOR',
              canonicalName: {
                equals: canonicalMerchant,
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
    const foodKeywords = [
      'starbucks', 'mcdonalds', 'restaurant', 'cafe', 'uber eats', 'grubhub',
      'deli', 'bakery', 'fast food', 'pizza', 'burger', 'taco', 'sushi',
      'grill', 'pub', 'bar', 'bistro', 'steakhouse', 'ramen', 'cafeteria',
      // Moved here from the dropped `category === 'Food'` disjunct in Rule B.
      // These three are in the categorizer's Food list but were absent here, so
      // removing the disjunct without them would have LOST coverage rather than
      // just honouring the grocery exclusion. Exactly three, not four: 'burger
      // king' is already matched by 'burger' above — proven by the test for it
      // passing against unmodified source, before these were added.
      //
      // 'grocery', 'supermarket' and 'walmart' are the other entries in that
      // Food list and are deliberately NOT brought across: excluding them is the
      // documented requirement this rule exists to honour (see the comment above).
      //
      // 'subway' is the sandwich chain. The categorizer already classes it as
      // Food and not Transport, so this preserves the prior behaviour rather
      // than introducing a new judgement about transit receipts.
      'doordash', 'kfc', 'subway'
    ];
    // Accent- and word-boundary-aware: "Café" matches 'cafe', but 'bar' does NOT
    // match "Barber". See utils/textMatch (deferred item C).
    return matchesAnyKeyword(name, foodKeywords);
  }

  /**
   * Fallback detection using AI Summary when merchant or category is unclear.
   */
  private isFoodSummary(summary: string | null): boolean {
    if (!summary) return false;

    const foodKeywords = [
      'restaurant',
      'cafe',
      'coffee',
      'meal',
      'dinner',
      'lunch',
      'breakfast',
      'pizza',
      'burger',
      'bistro',
      'bar',
      'grill',
      'food',
      'taco',
      'sushi',
      'steak',
      'kitchen'
    ];

    // Raw LLM summary text preserves accents; fold both sides and match whole
    // words (see utils/textMatch, deferred item C).
    return matchesAnyKeyword(summary, foodKeywords);
  }
}
