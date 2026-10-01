import { ParseError } from '../errors/app-error.js';
import type { Rating } from '../../modules/books/domain/book.types.js';

const RATING_MAP: Record<string, Rating> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * Extracts a numeric price from a string, handling currency symbols and encoding issues like 'Â£51.77'.
 */
export function parsePrice(raw: string, fieldName = 'price'): number {
  if (!raw) {
    throw new ParseError(fieldName, 'Price text is empty or missing');
  }

  const match = raw.match(/([0-9]+\.[0-9]{2})/);
  if (!match?.[1]) {
    throw new ParseError(fieldName, `Could not parse price from '${raw}'`);
  }

  const parsed = parseFloat(match[1]);
  if (Number.isNaN(parsed)) {
    throw new ParseError(fieldName, `Invalid parsed price from '${raw}'`);
  }

  return parsed;
}

/**
 * Parses star rating from a CSS class string or text (e.g. 'star-rating Three' or 'Three').
 */
export function parseRating(rawClassOrText: string): Rating {
  if (!rawClassOrText) {
    throw new ParseError('rating', 'Rating class or text is empty');
  }

  const tokens = rawClassOrText.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    const rating = RATING_MAP[token];
    if (rating !== undefined) {
      return rating;
    }
  }

  throw new ParseError(
    'rating',
    `Could not parse rating from '${rawClassOrText}'`,
  );
}

/**
 * Parses stock availability text (e.g. 'In stock (22 available)') to return the count.
 */
export function parseStockCount(rawText: string): number {
  if (!rawText) {
    throw new ParseError('stockCount', 'Stock availability text is empty');
  }

  const lower = rawText.toLowerCase();
  if (lower.includes('out of stock')) {
    return 0;
  }

  const match = rawText.match(/(\d+)\s+available/i);
  if (match?.[1]) {
    const count = parseInt(match[1], 10);
    if (!Number.isNaN(count)) {
      return count;
    }
  }

  // Fallback for simple 'In stock' text without a count
  if (lower.includes('in stock')) {
    const digitMatch = rawText.match(/(\d+)/);
    if (digitMatch?.[1]) {
      return parseInt(digitMatch[1], 10);
    }
    return 1;
  }

  throw new ParseError(
    'stockCount',
    `Could not parse stock count from '${rawText}'`,
  );
}

/**
 * Parses inStock boolean from text.
 */
export function parseInStock(rawText: string): boolean {
  if (!rawText) {
    return false;
  }
  const lower = rawText.toLowerCase();
  if (lower.includes('out of stock')) {
    return false;
  }
  if (lower.includes('in stock')) {
    const countMatch = rawText.match(/\((\d+)\s+available\)/i);
    if (countMatch?.[1] && parseInt(countMatch[1], 10) === 0) {
      return false;
    }
    return true;
  }
  return false;
}
