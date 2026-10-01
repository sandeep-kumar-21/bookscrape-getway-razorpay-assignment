import { describe, expect, it } from 'vitest';
import type { BookSummary } from '../../books/domain/book.types.js';
import type { Category } from '../../categories/domain/category.types.js';
import {
  filterBooks,
  normalizeText,
  paginate,
  resolveCategory,
  searchBooks,
  sortBooks,
} from './query.util.js';
import { ValidationError } from '../../../common/errors/app-error.js';

const mockCategories: Category[] = [
  {
    id: 'travel_2',
    name: 'Travel',
    url: 'http://example.com/travel',
    count: 10,
  },
  {
    id: 'mystery_3',
    name: 'Mystery',
    url: 'http://example.com/mystery',
    count: 32,
  },
  {
    id: 'historical-fiction_4',
    name: 'Historical Fiction',
    url: 'http://example.com/hf',
    count: 26,
  },
];

const sampleBooks: BookSummary[] = [
  {
    id: 'book_1',
    position: 1,
    title: 'A Light in the Attic',
    price: 51.77,
    currency: 'INR',
    rating: 3,
    inStock: true,
    category: 'Poetry',
    imageUrl: 'http://example.com/1.jpg',
    sourceUrl: 'http://example.com/1',
  },
  {
    id: 'book_2',
    position: 2,
    title: 'Tipping the Velvet',
    price: 53.74,
    currency: 'INR',
    rating: 1,
    inStock: true,
    category: 'Historical Fiction',
    imageUrl: 'http://example.com/2.jpg',
    sourceUrl: 'http://example.com/2',
  },
  {
    id: 'book_3',
    position: 3,
    title: 'Soumission',
    price: 50.1,
    currency: 'INR',
    rating: 1,
    inStock: false,
    category: 'Fiction',
    imageUrl: 'http://example.com/3.jpg',
    sourceUrl: 'http://example.com/3',
  },
  {
    id: 'book_4',
    position: 4,
    title: 'Sharp Objects',
    price: 47.82,
    currency: 'INR',
    rating: 4,
    inStock: true,
    category: 'Mystery',
    imageUrl: 'http://example.com/4.jpg',
    sourceUrl: 'http://example.com/4',
  },
  {
    id: 'book_5',
    position: 5,
    title: 'The Mystery of the Blue Train',
    price: 15.0,
    currency: 'INR',
    rating: 5,
    inStock: true,
    category: 'Mystery',
    imageUrl: 'http://example.com/5.jpg',
    sourceUrl: 'http://example.com/5',
  },
];

describe('query.util', () => {
  describe('normalizeText', () => {
    it('lowercases, strips accents and collapses spaces', () => {
      expect(normalizeText('  Café   Au   Lait  ')).toBe('cafe au lait');
      expect(normalizeText('RÉSUMÉ')).toBe('resume');
      expect(normalizeText('')).toBe('');
    });
  });

  describe('resolveCategory', () => {
    it('resolves by id case-insensitively', () => {
      const cat = resolveCategory('MYSTERY_3', mockCategories);
      expect(cat.name).toBe('Mystery');
    });

    it('resolves by name case-insensitively with diacritics', () => {
      const cat = resolveCategory('historical fiction', mockCategories);
      expect(cat.id).toBe('historical-fiction_4');
    });

    it('throws UNKNOWN_CATEGORY when category is not found', () => {
      expect(() => resolveCategory('Unknown Category', mockCategories)).toThrow(
        ValidationError,
      );
    });
  });

  describe('filterBooks', () => {
    it('filters by category name or id', () => {
      const filtered = filterBooks(
        sampleBooks,
        { category: 'mystery_3' },
        mockCategories,
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.every((b) => b.category === 'Mystery')).toBe(true);
    });

    it('filters by price range (minPrice, maxPrice)', () => {
      const filtered = filterBooks(sampleBooks, {
        minPrice: 50.0,
        maxPrice: 52.0,
      });
      expect(filtered).toHaveLength(2); // book_1 (51.77) and book_3 (50.10)
      expect(filtered.map((b) => b.id)).toEqual(['book_1', 'book_3']);
    });

    it('filters by rating and inStock', () => {
      const filtered = filterBooks(sampleBooks, { rating: 1, inStock: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('book_2');
    });
  });

  describe('sortBooks', () => {
    it('sorts by default position ascending and descending', () => {
      const asc = sortBooks(sampleBooks, 'default', 'asc');
      expect(asc[0]?.id).toBe('book_1');
      expect(asc[4]?.id).toBe('book_5');

      const desc = sortBooks(sampleBooks, 'default', 'desc');
      expect(desc[0]?.id).toBe('book_5');
      expect(desc[4]?.id).toBe('book_1');
    });

    it('sorts stably by price with id tiebreaker', () => {
      const asc = sortBooks(sampleBooks, 'price', 'asc');
      expect(asc[0]?.id).toBe('book_5'); // 15.00
      expect(asc[4]?.id).toBe('book_2'); // 53.74
    });

    it('sorts stably by title', () => {
      const asc = sortBooks(sampleBooks, 'title', 'asc');
      expect(asc[0]?.title).toBe('A Light in the Attic');
    });

    it('sorts stably by rating', () => {
      const desc = sortBooks(sampleBooks, 'rating', 'desc');
      expect(desc[0]?.rating).toBe(5);
    });
  });

  describe('searchBooks', () => {
    it('returns empty array on empty query', () => {
      expect(searchBooks(sampleBooks, '')).toEqual([]);
      expect(searchBooks(sampleBooks, '   ')).toEqual([]);
    });

    it('ranks exact match above prefix and substring', () => {
      const results = searchBooks(sampleBooks, 'sharp objects');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('book_4');
    });

    it('demonstrates exact > prefix > contains > token ranking hierarchy', () => {
      const rankingBooks: BookSummary[] = [
        {
          id: 'rank_4',
          position: 1,
          title: 'The Attic in Light Special',
          price: 10,
          currency: 'INR',
          rating: 1,
          inStock: true,
          category: 'Poetry',
          imageUrl: '',
          sourceUrl: '',
        },
        {
          id: 'rank_2',
          position: 2,
          title: 'Light in the Attic Special',
          price: 10,
          currency: 'INR',
          rating: 1,
          inStock: true,
          category: 'Poetry',
          imageUrl: '',
          sourceUrl: '',
        },
        {
          id: 'rank_1',
          position: 3,
          title: 'Light in the Attic',
          price: 10,
          currency: 'INR',
          rating: 1,
          inStock: true,
          category: 'Poetry',
          imageUrl: '',
          sourceUrl: '',
        },
        {
          id: 'rank_3',
          position: 4,
          title: 'A Light in the Attic Forever',
          price: 10,
          currency: 'INR',
          rating: 1,
          inStock: true,
          category: 'Poetry',
          imageUrl: '',
          sourceUrl: '',
        },
        {
          id: 'rank_4_b',
          position: 5,
          title: 'The Attic in Light Alpha',
          price: 10,
          currency: 'INR',
          rating: 1,
          inStock: true,
          category: 'Poetry',
          imageUrl: '',
          sourceUrl: '',
        },
      ];

      const ranked = searchBooks(rankingBooks, 'light in the attic');
      expect(ranked[0]?.id).toBe('rank_1'); // Exact
      expect(ranked[1]?.id).toBe('rank_2'); // Prefix
      expect(ranked[2]?.id).toBe('rank_3'); // Contains
      // Among rank 4, sorted by title: 'Attic Light Alpha' before 'Attic Light Special'
      expect(ranked[3]?.id).toBe('rank_4_b');
      expect(ranked[4]?.id).toBe('rank_4');
    });

    it('matches multi-token query using AND semantics', () => {
      const results = searchBooks(sampleBooks, 'mystery train');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('book_5');
    });

    it('returns empty when tokens do not all match', () => {
      const results = searchBooks(sampleBooks, 'mystery nonexistingword');
      expect(results).toHaveLength(0);
    });
  });

  describe('paginate', () => {
    it('slices items correctly for first page', () => {
      const result = paginate(sampleBooks, 1, 2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.id).toBe('book_1');
      expect(result.meta).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it('returns empty data array for page beyond last', () => {
      const result = paginate(sampleBooks, 10, 2);
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 10,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });
  });
});
