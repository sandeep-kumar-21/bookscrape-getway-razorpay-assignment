import { Inject, Injectable, Logger } from '@nestjs/common';
import { ScraperClient } from '../../common/http/scraper-client.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { SyncLock } from './sync-lock.js';
import { SyncStatusService } from './sync-status.service.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { parseListingPage } from '../books/parsers/listing.parser.js';
import { parseCategoryIndex } from '../categories/parsers/category-index.parser.js';
import { parseCategoryPage } from '../categories/parsers/category-page.parser.js';
import { BOOK_ID_REGEX, resolveUrl } from '../../common/utils/url.util.js';
import type { BookSummary } from '../books/domain/book.types.js';
import type { Category } from '../categories/domain/category.types.js';

export interface SyncOptions {
  readonly throwOnLockBusy?: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(ScraperClient) private readonly scraperClient: ScraperClient,
    @Inject(CatalogueService)
    private readonly catalogueService: CatalogueService,
    @Inject(SyncLock) private readonly lock: SyncLock,
    @Inject(SyncStatusService)
    private readonly syncStatus: SyncStatusService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Performs an atomic full site crawl, validates counts and schema, and publishes the catalogue.
   */
  async build(options?: SyncOptions): Promise<void> {
    const token = await this.lock.acquire();
    if (!token) {
      if (options?.throwOnLockBusy) {
        throw new Error('Sync lock is already held by another process');
      }
      this.logger.warn(
        'Skipping sync: lock is currently held by another worker',
      );
      return;
    }

    const startedAt = new Date().toISOString();
    await this.syncStatus.setStatus({ state: 'building', startedAt });

    try {
      this.logger.log('Starting full catalogue sync crawl...');

      // 1. Crawl all catalogue listing pages
      const rawBooks: BookSummary[] = [];
      let currentUrl: string | null = resolveUrl(
        'index.html',
        this.config.sourceBaseUrl,
      );
      let firstPageHtml: string | null = null;
      let firstPageUrl: string | null = null;
      let sourceTotal: number | null = null;

      while (currentUrl) {
        this.logger.debug(`Fetching listing page: ${currentUrl}`);
        const html = await this.scraperClient.getHtml(currentUrl);

        if (!firstPageHtml) {
          firstPageHtml = html;
          firstPageUrl = currentUrl;
        }

        const parsed = parseListingPage(html, currentUrl);
        if (sourceTotal === null && parsed.totalResults !== null) {
          sourceTotal = parsed.totalResults;
        }

        rawBooks.push(...parsed.items);
        currentUrl = parsed.nextUrl;
      }

      // Re-index position 1-based in site order
      let allBooks: BookSummary[] = rawBooks.map((b, idx) => ({
        ...b,
        position: idx + 1,
      }));

      // 2. Discover categories from the sidebar
      if (!firstPageHtml || !firstPageUrl) {
        throw new Error('No catalogue pages were scraped');
      }

      const discoveredCategories = parseCategoryIndex(
        firstPageHtml,
        firstPageUrl,
      );

      // 3. Crawl each category to map book IDs and compute genuine book counts
      const bookCategoryMap = new Map<string, string>();
      const updatedCategories: Category[] = [];

      for (const cat of discoveredCategories) {
        let catUrl: string | null = cat.url;
        let count = 0;

        while (catUrl) {
          this.logger.debug(`Fetching category page: ${catUrl}`);
          const catHtml = await this.scraperClient.getHtml(catUrl);
          const parsedCat = parseCategoryPage(catHtml, catUrl);

          for (const bookId of parsedCat.bookIds) {
            bookCategoryMap.set(bookId, cat.name);
            count++;
          }

          catUrl = parsedCat.nextUrl;
        }

        updatedCategories.push({
          ...cat,
          count,
        });
      }

      // 4. Assign categories to books
      allBooks = allBooks.map((book) => {
        const assignedCategory = bookCategoryMap.get(book.id) ?? null;
        if (!assignedCategory) {
          this.logger.warn(
            `Book '${book.id}' was not found in any category, assigning null`,
          );
        }
        return {
          ...book,
          category: assignedCategory,
        };
      });

      // 5. Validation gates
      if (sourceTotal !== null && allBooks.length !== sourceTotal) {
        throw new Error(
          `Crawl validation failed: scraped ${allBooks.length} books but source announced ${sourceTotal}`,
        );
      }

      for (const book of allBooks) {
        if (!BOOK_ID_REGEX.test(book.id)) {
          throw new Error(`Invalid book ID format encountered: '${book.id}'`);
        }
      }

      // 6. Atomically publish the new catalogue
      const finishedAt = new Date().toISOString();
      await this.catalogueService.publishCatalogue({
        builtAt: finishedAt,
        sourceTotal: allBooks.length,
        books: allBooks,
        categories: updatedCategories,
      });

      // 7. Update status to ready
      await this.syncStatus.setStatus({
        state: 'ready',
        startedAt,
        finishedAt,
        sourceTotal: allBooks.length,
      });

      this.logger.log(
        `Catalogue sync completed successfully: ${allBooks.length} books across ${updatedCategories.length} categories`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Catalogue sync failed: ${errorMsg}`);

      await this.syncStatus.setStatus({
        state: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: errorMsg,
      });

      throw err;
    } finally {
      await this.lock.release(token);
    }
  }
}
