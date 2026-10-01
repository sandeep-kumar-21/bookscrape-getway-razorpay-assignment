import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { ScraperClient } from '../../common/http/scraper-client.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { parseBookDetail } from './parsers/book-detail.parser.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { BookDetail } from './domain/book.types.js';

export interface BookDetailResult {
  readonly detail: BookDetail;
  readonly cacheSource: 'HIT' | 'MISS';
}

@Injectable()
export class BookDetailService {
  private readonly logger = new Logger(BookDetailService.name);
  private readonly inFlight = new Map<string, Promise<BookDetailResult>>();

  constructor(
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(CatalogueService)
    private readonly catalogueService: CatalogueService,
    @Inject(ScraperClient) private readonly scraperClient: ScraperClient,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Retrieves full book details.
   * Priority:
   * 1. Validate book exists in catalogue (returns 404 immediately with 0 upstream calls if not).
   * 2. Redis cached detail (HIT).
   * 3. In-process single-flight deduplication (10 concurrent requests for same ID -> 1 scrape).
   * 4. Lazy upstream scrape via ScraperClient (MISS).
   * 5. Cache result in Redis for DETAIL_TTL_SECONDS.
   */
  async get(id: string): Promise<BookDetailResult> {
    const existingPromise = this.inFlight.get(id);
    if (existingPromise) {
      return existingPromise;
    }

    const task = this.fetchAndCache(id);
    this.inFlight.set(id, task);

    try {
      return await task;
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async fetchAndCache(id: string): Promise<BookDetailResult> {
    // 1. Catalogue validation
    const { catalogue } = await this.catalogueService.getCatalogue();
    const summary = catalogue.books.find((b) => b.id === id);

    if (!summary) {
      throw new NotFoundError(
        `Book '${id}' not found in catalogue`,
        'BOOK_NOT_FOUND',
      );
    }

    // 2. Redis lookup
    try {
      const cached = await this.store.getJson<BookDetail>(`book:${id}`);
      if (cached) {
        return {
          detail: cached,
          cacheSource: 'HIT',
        };
      }
    } catch (err) {
      this.logger.warn(
        `Failed to read book:${id} from store, falling back to direct scrape: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 3. Lazy upstream scrape
    this.logger.debug(
      `Scraping detail page for '${id}' at ${summary.sourceUrl}`,
    );
    const html = await this.scraperClient.getHtml(summary.sourceUrl);
    const parsed = parseBookDetail(html, summary.sourceUrl);

    // Merge summary context
    const detail: BookDetail = {
      ...parsed,
      position: summary.position,
      category: summary.category ?? parsed.category,
    };

    if (
      summary.category &&
      parsed.category &&
      summary.category.toLowerCase() !== parsed.category.toLowerCase()
    ) {
      this.logger.warn(
        `Category mismatch for book '${id}': catalogue has '${summary.category}', page breadcrumbs have '${parsed.category}'`,
      );
    }

    // 4. Cache in Redis
    try {
      await this.store.setJson(
        `book:${id}`,
        detail,
        this.config.detailTtlSeconds,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to cache book:${id} in store: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      detail,
      cacheSource: 'MISS',
    };
  }
}
