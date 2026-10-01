import type { BookSummary } from '../../books/domain/book.types.js';
import type { Category } from '../../categories/domain/category.types.js';

export interface CatalogueData {
  readonly builtAt: string;
  readonly sourceTotal: number;
  readonly books: BookSummary[];
  readonly categories: Category[];
}

export type CacheSource = 'HIT' | 'MISS' | 'STALE';

export interface CatalogueResult {
  readonly catalogue: CatalogueData;
  readonly cacheSource: CacheSource;
}

export interface BookFilterOptions {
  readonly category?: string;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly rating?: number;
  readonly inStock?: boolean;
}

export type SortField = 'default' | 'title' | 'price' | 'rating';
export type SortOrder = 'asc' | 'desc';

export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface PaginatedResult<T> {
  readonly data: T[];
  readonly meta: PaginationMeta;
}
