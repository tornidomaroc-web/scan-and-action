import { matchesAnyKeyword } from '../utils/textMatch';

/**
 * ExpenseCategorizationService
 *
 * Isolated service for heuristic-based categorization of financial documents.
 * Designed to be conservative and easily extensible.
 */
export class ExpenseCategorizationService {
  private readonly CATEGORY_KEYWORDS: Record<string, string[]> = {
    Food: [
      'starbucks', 'mcdonalds', 'restaurant', 'cafe', 'uber eats', 'doordash', 
      'grocery', 'supermarket', 'walmart', 'kfc', 'burger king', 'subway', 'pizza'
    ],
    Transport: [
      'uber', 'lyft', 'bolt', 'taxi', 'gas', 'petrol', 'shell', 'bp', 'chevron', 
      'exxon', 'totalenergies', 'train', 'bus', 'parking', 'garage', 'commute'
    ],
    Travel: [
      'hotel', 'airbnb', 'booking.com', 'expedia', 'flight', 'airline', 'delta', 
      'emirates', 'lufthansa', 'hilton', 'marriott', 'hostel', 'resort'
    ],
    Office: [
      'office depot', 'staples', 'apple', 'dell', 'hp', 'furniture', 'hardware', 
      'best buy', 'stationary', 'printing'
    ],
    Software: [
      'adobe', 'figma', 'microsoft', 'google', 'aws', 'amazon web services', 
      'github', 'slack', 'atlassian', 'zoom', 'openai', 'stripe', 'vercel', 'heroku'
    ],
  };

  /**
   * Categorizes a document based on merchant name, raw text, and facts.
   * Returns "Other" if no strong keyword matches are found or if confidence < 0.6.
   */
  public categorize({ 
    merchantName, 
    rawText, 
    facts 
  }: { 
    merchantName: string | null; 
    rawText: string; 
    facts: any[] 
  }): { category: string; confidence: number } {
    const factsText = facts
      .map(f => f.valueString || f.key || '')
      .join(' ');

    // Compose the searchable text; matchesAnyKeyword folds accents + lowercases
    // and matches whole words, so "Café" matches 'cafe' while 'bar' does not
    // match "Barber" (deferred item C). No pre-lowercasing needed here.
    const searchText = `${rawText || ''} ${merchantName || ''} ${factsText}`;

    for (const [category, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      if (matchesAnyKeyword(searchText, keywords)) {
        const confidence = 0.9;
        if (confidence < 0.6) {
          return { category: 'Other', confidence };
        }
        return { category, confidence };
      }
    }

    return { category: 'Other', confidence: 0.5 };
  }
}
