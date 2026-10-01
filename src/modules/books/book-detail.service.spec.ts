import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BookDetailService } from './book-detail.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { ScraperClient } from '../../common/http/scraper-client.js';
import { FixtureTransport } from '../../../test/support/fixture-transport.js';
import { InMemoryStore } from '../../../test/support/in-memory.store.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import {
  NotFoundError,
  CatalogueNotReadyError,
} from '../../common/errors/app-error.js';
import type { CatalogueData } from '../catalogue/domain/catalogue.types.js';

describe('BookDetailService', () => {
  let transport: FixtureTransport;
  let store: InMemoryStore;
  let config: AppConfigService;
  let scraperClient: ScraperClient;
  let catalogueService: CatalogueService;
  let service: BookDetailService;

  const mockCatalogue: CatalogueData = {
    books: [
      {
        id: 'book-one_1',
        position: 1,
        title: 'Book One',
        price: 10.0,
        currency: 'INR',
        rating: 3,
        inStock: true,
        category: 'Travel',
        imageUrl: 'https://books.toscrape.com/media/cache/1.jpg',
        sourceUrl: 'https://books.toscrape.com/catalogue/book-one_1/index.html',
      },
    ],
    categories: [
      {
        id: 'travel_2',
        name: 'Travel',
        url: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
        count: 1,
      },
    ],
    builtAt: new Date().toISOString(),
    sourceTotal: 1,
  };

  beforeEach(() => {
    const miniSiteDir = resolve(__dirname, '../../../test/fixtures/mini-site');
    transport = new FixtureTransport(miniSiteDir);
    transport.setFixture(
      '/catalogue/book-one_1/index.html',
      'detail-book-one_1.html',
    );

    store = new InMemoryStore();
    config = AppConfigService.create({
      SOURCE_BASE_URL: 'https://books.toscrape.com',
      HTTP_DELAY_MS: 0,
      HTTP_CONCURRENCY: 2,
      DETAIL_TTL_SECONDS: 604800,
      SNAPSHOT_TTL_SECONDS: 60,
    });

    scraperClient = new ScraperClient(transport, config);
    catalogueService = new CatalogueService(store, config);
    service = new BookDetailService(
      store,
      catalogueService,
      scraperClient,
      config,
    );
  });

  it('throws NotFoundError with zero upstream calls when book is not in catalogue', async () => {
    await catalogueService.publishCatalogue(mockCatalogue);
    const fetchSpy = vi.spyOn(transport, 'fetch');

    await expect(service.get('unknown-book_999')).rejects.toThrow(
      NotFoundError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws CatalogueNotReadyError when catalogue is missing', async () => {
    await expect(service.get('book-one_1')).rejects.toThrow(
      CatalogueNotReadyError,
    );
  });

  it('lazily scrapes on first call (MISS), caches in store, and serves from store on second call (HIT)', async () => {
    await catalogueService.publishCatalogue(mockCatalogue);
    const fetchSpy = vi.spyOn(transport, 'fetch');

    // First call: MISS
    const res1 = await service.get('book-one_1');
    expect(res1.cacheSource).toBe('MISS');
    expect(res1.detail).toMatchObject({
      id: 'book-one_1',
      title: 'Book One',
      price: 10.0,
      stockCount: 10,
      upc: 'upc0000000000001',
      productType: 'Books',
      priceExclTax: 10.0,
      priceInclTax: 10.0,
      tax: 0.0,
      numberOfReviews: 0,
      category: 'Travel',
      position: 1,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call: HIT
    const res2 = await service.get('book-one_1');
    expect(res2.cacheSource).toBe('HIT');
    expect(res2.detail).toEqual(res1.detail);
    // Transport was NOT called again
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('single-flights 10 concurrent requests into exactly 1 upstream scrape', async () => {
    await catalogueService.publishCatalogue(mockCatalogue);
    const fetchSpy = vi.spyOn(transport, 'fetch');

    // Launch 10 concurrent requests for the exact same book ID
    const promises = Array.from({ length: 10 }, () =>
      service.get('book-one_1'),
    );
    const results = await Promise.all(promises);

    expect(results.length).toBe(10);
    for (const r of results) {
      expect(r.detail.id).toBe('book-one_1');
      expect(r.detail.upc).toBe('upc0000000000001');
    }

    // Exactly 1 upstream fetch must have happened
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct scrape when store fails', async () => {
    await catalogueService.publishCatalogue(mockCatalogue);
    // Simulate store failure for detail key
    vi.spyOn(store, 'getJson').mockRejectedValue(
      new Error('Simulated Redis store failure'),
    );
    vi.spyOn(store, 'setJson').mockRejectedValue(
      new Error('Simulated Redis store failure'),
    );

    const res = await service.get('book-one_1');
    expect(res.cacheSource).toBe('MISS');
    expect(res.detail.id).toBe('book-one_1');
  });
});
