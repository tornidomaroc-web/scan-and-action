import { matchesAnyKeyword } from '../utils/textMatch';
import { EXPENSE_CATEGORIES, ExpenseCategory } from './expenseCategories';

/**
 * ExpenseCategorizationService: the keyword FALLBACK.
 *
 * Since 2026-09-23 the category normally comes back from the extraction call
 * itself (see expenseCategories.ts and geminiAdapter.ts). This matcher runs
 * only when the model returned nothing usable. It matches English keywords as
 * whole words, so it cannot categorize Arabic text and it answers 'Other' for
 * any receipt that never prints one of these words; that is exactly why it is
 * no longer the primary path.
 */
export class ExpenseCategorizationService {
  private readonly CATEGORY_KEYWORDS: Partial<Record<ExpenseCategory, string[]>> = {
    Food: [
      'starbucks', 'mcdonalds', 'restaurant', 'cafe', 'uber eats', 'doordash',
      'grocery', 'supermarket', 'walmart', 'kfc', 'burger king', 'subway', 'pizza',
      'bakery', 'boulangerie', 'market', 'carrefour', 'marjane'
    ],
    Transport: [
      'uber', 'lyft', 'bolt', 'taxi', 'gas', 'petrol', 'shell', 'bp', 'chevron',
      'exxon', 'totalenergies', 'train', 'bus', 'parking', 'garage', 'commute', 'fuel'
    ],
    Travel: [
      'hotel', 'airbnb', 'booking.com', 'expedia', 'flight', 'airline', 'delta',
      'emirates', 'lufthansa', 'hilton', 'marriott', 'hostel', 'resort'
    ],
    Health: ['pharmacy', 'pharmacie', 'clinic', 'clinique', 'dentist', 'doctor', 'hospital', 'optic'],
    Bills: ['electricity', 'water bill', 'internet', 'telecom', 'inwi', 'maroc telecom', 'insurance', 'subscription'],
    Office: [
      'office depot', 'staples', 'apple', 'dell', 'hp', 'furniture', 'hardware',
      'best buy', 'stationery', 'stationary', 'printing',
      'adobe', 'figma', 'microsoft', 'google', 'aws', 'amazon web services',
      'github', 'slack', 'atlassian', 'zoom', 'openai', 'stripe', 'vercel', 'heroku'
    ],
  };

  /**
   * Categorizes a document based on merchant name, raw text, and facts.
   * Returns "Other" if no keyword matches.
   */
  public categorize({
    merchantName,
    rawText,
    facts
  }: {
    merchantName: string | null;
    rawText: string;
    facts: any[]
  }): { category: ExpenseCategory; confidence: number } {
    const factsText = facts
      .map(f => f.valueString || f.key || '')
      .join(' ');

    // Compose the searchable text; matchesAnyKeyword folds accents + lowercases
    // and matches whole words, so "Café" matches 'cafe' while 'bar' does not
    // match "Barber" (deferred item C). No pre-lowercasing needed here.
    const searchText = `${rawText || ''} ${merchantName || ''} ${factsText}`;

    for (const category of EXPENSE_CATEGORIES) {
      const keywords = this.CATEGORY_KEYWORDS[category];
      if (keywords && matchesAnyKeyword(searchText, keywords)) {
        return { category, confidence: 0.9 };
      }
    }

    return { category: 'Other', confidence: 0.5 };
  }
}
