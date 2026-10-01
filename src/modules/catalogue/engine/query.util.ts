import type { BookSummary } from '../../books/domain/book.types.js';
import type { Category } from '../../categories/domain/category.types.js';
import type {
  BookFilterOptions,
  PaginatedResult,
  SortField,
  SortOrder,
} from '../domain/catalogue.types.js';
import { ValidationError } from '../../../common/errors/app-error.js';

/**
 * Normalizes text: lowercase, strip diacritics/accents, collapse multiple whitespaces.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a category by ID or name case-insensitively. Throws UNKNOWN_CATEGORY if not found.
 */
export function resolveCategory(
  categoryInput: string,
  categories: Category[],
): Category {
  const normalized = normalizeText(categoryInput);
  const found = categories.find(
    (c) =>
      c.id.toLowerCase() === normalized || normalizeText(c.name) === normalized,
  );

  if (!found) {
    throw new ValidationError(
      `Category '${categoryInput}' does not exist`,
      'UNKNOWN_CATEGORY',
    );
  }

  return found;
}

/**
 * Filters a list of books by category, price range, rating, and stock status.
 */
export function filterBooks(
  books: BookSummary[],
  filters: BookFilterOptions,
  categories?: Category[],
): BookSummary[] {
  let categoryNameFilter: string | undefined;

  if (filters.category && filters.category.trim().length > 0) {
    if (categories && categories.length > 0) {
      const resolved = resolveCategory(filters.category, categories);
      categoryNameFilter = resolved.name.toLowerCase();
    } else {
      categoryNameFilter = filters.category.trim().toLowerCase();
    }
  }

  return books.filter((book) => {
    if (categoryNameFilter !== undefined) {
      if (
        !book.category ||
        book.category.toLowerCase() !== categoryNameFilter
      ) {
        return false;
      }
    }

    if (filters.minPrice !== undefined && book.price < filters.minPrice) {
      return false;
    }

    if (filters.maxPrice !== undefined && book.price > filters.maxPrice) {
      return false;
    }

    if (filters.rating !== undefined && book.rating !== filters.rating) {
      return false;
    }

    if (filters.inStock !== undefined && book.inStock !== filters.inStock) {
      return false;
    }

    return true;
  });
}

/**
 * Sorts books stably with ID as the tiebreaker.
 * Supports: default (site position), title, price, rating.
 */
export function sortBooks(
  books: BookSummary[],
  sort: SortField = 'default',
  order: SortOrder = 'asc',
): BookSummary[] {
  const result = [...books];
  const isDesc = order === 'desc';

  result.sort((a, b) => {
    let cmp = 0;

    switch (sort) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'price':
        cmp = a.price - b.price;
        break;
      case 'rating':
        cmp = a.rating - b.rating;
        break;
      case 'default':
      default:
        cmp = a.position - b.position;
        break;
    }

    if (cmp !== 0) {
      return isDesc ? -cmp : cmp;
    }

    // Stable tiebreaker on ID
    return a.id.localeCompare(b.id);
  });

  return result;
}

/**
 * Searches books by title using multi-token AND matching.
 * Ranks results: exact match > prefix match > substring match > token match.
 * Secondary sort: title ascending, then ID ascending.
 */
export function searchBooks(
  books: BookSummary[],
  query: string,
): BookSummary[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  interface RankedBook {
    book: BookSummary;
    rank: number;
    normalizedTitle: string;
  }

  const matches: RankedBook[] = [];

  for (const book of books) {
    const normalizedTitle = normalizeText(book.title);

    // Multi-token AND check
    const matchesAllTokens = tokens.every((token) =>
      normalizedTitle.includes(token),
    );
    if (!matchesAllTokens) {
      continue;
    }

    let rank = 4;
    if (normalizedTitle === normalizedQuery) {
      rank = 1; // Exact match
    } else if (normalizedTitle.startsWith(normalizedQuery)) {
      rank = 2; // Prefix match
    } else if (normalizedTitle.includes(normalizedQuery)) {
      rank = 3; // Full phrase substring match
    }

    matches.push({
      book,
      rank,
      normalizedTitle,
    });
  }

  // Sort by rank ascending, then title ascending, then id ascending
  matches.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    const titleCmp = a.book.title.localeCompare(b.book.title);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return a.book.id.localeCompare(b.book.id);
  });

  return matches.map((m) => m.book);
}

/**
 * Returns a paginated slice and pagination metadata.
 */
export function paginate<T>(
  items: T[],
  page = 1,
  limit = 20,
): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const total = items.length;
  const totalPages = Math.ceil(total / safeLimit);

  const offset = (safePage - 1) * safeLimit;
  const data = offset < total ? items.slice(offset, offset + safeLimit) : [];

  return {
    data,
    meta: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}
