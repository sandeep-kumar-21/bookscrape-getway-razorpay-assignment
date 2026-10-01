import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { SyncService } from './sync.service.js';
import { SyncLock } from './sync-lock.js';
import { SyncStatusService } from './sync-status.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { ScraperClient } from '../../common/http/scraper-client.js';
import { FixtureTransport } from '../../../test/support/fixture-transport.js';
import { InMemoryStore } from '../../../test/support/in-memory.store.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import type { CatalogueData } from '../catalogue/domain/catalogue.types.js';

describe('SyncService', () => {
  let transport: FixtureTransport;
  let store: InMemoryStore;
  let config: AppConfigService;
  let scraperClient: ScraperClient;
  let catalogueService: CatalogueService;
  let lock: SyncLock;
  let syncStatus: SyncStatusService;
  let syncService: SyncService;

  beforeEach(() => {
    const miniSiteDir = resolve(__dirname, '../../../test/fixtures/mini-site');
    transport = new FixtureTransport(miniSiteDir);

    // Map mini-site routes
    transport.setFixture('/index.html', 'page-1.html');
    transport.setFixture('/catalogue/page-1.html', 'page-1.html');
    transport.setFixture('/catalogue/page-2.html', 'page-2.html');
    transport.setFixture('/catalogue/page-3.html', 'page-3.html');
    transport.setFixture(
      '/catalogue/category/books/travel_2/index.html',
      'category-travel.html',
    );
    transport.setFixture(
      '/catalogue/category/books/mystery_3/index.html',
      'category-mystery-1.html',
    );
    transport.setFixture(
      '/catalogue/category/books/mystery_3/page-2.html',
      'category-mystery-2.html',
    );
    transport.setFixture(
      '/catalogue/category/books/historical-fiction_4/index.html',
      'category-historical-fiction.html',
    );

    store = new InMemoryStore();
    config = AppConfigService.create({
      SOURCE_BASE_URL: 'https://books.toscrape.com',
      HTTP_DELAY_MS: 0,
      HTTP_CONCURRENCY: 2,
      SYNC_LOCK_TTL_SECONDS: 60,
    });

    scraperClient = new ScraperClient(transport, config);
    catalogueService = new CatalogueService(store, config);
    lock = new SyncLock(store, config);
    syncStatus = new SyncStatusService(store);

    syncService = new SyncService(
      scraperClient,
      catalogueService,
      lock,
      syncStatus,
      config,
    );
  });

  it('performs full sync crawl against mini-site fixtures and publishes catalogue', async () => {
    await syncService.build();

    const status = await syncStatus.getStatus();
    expect(status.state).toBe('ready');
    expect(status.sourceTotal).toBe(15);
    expect(status.finishedAt).toBeDefined();

    const catResult = await catalogueService.getCatalogue();
    expect(catResult.catalogue.books).toHaveLength(15);
    expect(catResult.catalogue.sourceTotal).toBe(15);

    // Check positions
    expect(catResult.catalogue.books[0]?.position).toBe(1);
    expect(catResult.catalogue.books[14]?.position).toBe(15);

    // Check categories and counts (Travel: 4, Mystery: 6, Historical Fiction: 5 -> total 15)
    expect(catResult.catalogue.categories).toHaveLength(3);
    const travel = catResult.catalogue.categories.find(
      (c) => c.id === 'travel_2',
    );
    const mystery = catResult.catalogue.categories.find(
      (c) => c.id === 'mystery_3',
    );
    const hf = catResult.catalogue.categories.find(
      (c) => c.id === 'historical-fiction_4',
    );

    expect(travel?.count).toBe(4);
    expect(mystery?.count).toBe(6);
    expect(hf?.count).toBe(5);

    // Check that book categories were assigned
    const book1 = catResult.catalogue.books.find((b) => b.id === 'book-one_1');
    expect(book1?.category).toBe('Travel');

    const book3 = catResult.catalogue.books.find(
      (b) => b.id === 'book-three_3',
    );
    expect(book3?.category).toBe('Mystery');

    const book5 = catResult.catalogue.books.find((b) => b.id === 'book-five_5');
    expect(book5?.category).toBe('Historical Fiction');
  });

  it('rejects concurrent build when lock is already held', async () => {
    // Acquire lock manually
    const token = await lock.acquire();
    expect(token).not.toBeNull();

    await expect(syncService.build({ throwOnLockBusy: true })).rejects.toThrow(
      'Sync lock is already held',
    );

    // Release lock
    await lock.release(token!);
  });

  it('aborts without publishing and leaves old catalogue intact when count mismatches', async () => {
    // Pre-populate old catalogue
    const oldCatalogue: CatalogueData = {
      builtAt: '2026-01-01T00:00:00.000Z',
      sourceTotal: 1,
      books: [
        {
          id: 'old-book_1',
          position: 1,
          title: 'Old Book',
          price: 10,
          currency: 'GBP',
          rating: 1,
          inStock: true,
          category: null,
          imageUrl: '',
          sourceUrl: '',
        },
      ],
      categories: [],
    };
    await catalogueService.publishCatalogue(oldCatalogue);

    // Break page 2 to cause crawl failure
    transport.setResponse('/catalogue/page-2.html', {
      status: 500,
      statusText: 'Server Error',
      headers: new Headers(),
      bodyText: 'Server Error',
    });

    await expect(syncService.build()).rejects.toThrow();

    // Verify status is failed
    const status = await syncStatus.getStatus();
    expect(status.state).toBe('failed');
    expect(status.error).toBeDefined();

    // Verify old catalogue survives untouched
    const currentCat = await catalogueService.getCatalogue();
    expect(currentCat.catalogue.books[0]?.id).toBe('old-book_1');
  });
});
