import { describe, expect, it, beforeEach } from 'vitest';
import { CatalogueService } from './catalogue.service.js';
import { InMemoryStore } from '../../../test/support/in-memory.store.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { CatalogueNotReadyError } from '../../common/errors/app-error.js';
import type { CatalogueData } from './domain/catalogue.types.js';

const mockCatalogueData: CatalogueData = {
  builtAt: '2026-10-01T20:00:00.000Z',
  sourceTotal: 1,
  books: [
    {
      id: 'a-light-in-the-attic_1000',
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
  ],
  categories: [
    { id: 'poetry_23', name: 'Poetry', url: 'http://example.com', count: 1 },
  ],
};

describe('CatalogueService', () => {
  let store: InMemoryStore;
  let config: AppConfigService;
  let service: CatalogueService;

  beforeEach(() => {
    store = new InMemoryStore();
    config = AppConfigService.create({
      SNAPSHOT_TTL_SECONDS: 60,
    });
    service = new CatalogueService(store, config);
  });

  it('throws CatalogueNotReadyError when store is empty and no snapshot exists', async () => {
    await expect(service.getCatalogue()).rejects.toThrow(
      CatalogueNotReadyError,
    );
  });

  it('fetches from store as MISS on first call and caches snapshot', async () => {
    await store.setJson('catalogue', mockCatalogueData);

    const first = await service.getCatalogue();
    expect(first.cacheSource).toBe('MISS');
    expect(first.catalogue.sourceTotal).toBe(1);

    // Second call served from memory snapshot
    const second = await service.getCatalogue();
    expect(second.cacheSource).toBe('HIT');
    expect(second.catalogue).toBe(first.catalogue);
  });

  it('serves STALE snapshot when store fails but cached snapshot exists', async () => {
    await store.setJson('catalogue', mockCatalogueData);
    await service.getCatalogue(); // Populates snapshot

    // Expire the snapshot so it tries to refresh from the store
    (
      service as unknown as { cachedSnapshot: { expiresAt: number } }
    ).cachedSnapshot.expiresAt = Date.now() - 1000;

    // Simulate store outage
    store.simulateFailure(true);

    const staleResult = await service.getCatalogue();
    expect(staleResult.cacheSource).toBe('STALE');
    expect(staleResult.catalogue.sourceTotal).toBe(1);
  });

  it('throws CatalogueNotReadyError when store fails and NO snapshot exists', async () => {
    store.simulateFailure(true);
    await expect(service.getCatalogue()).rejects.toThrow(
      CatalogueNotReadyError,
    );
  });

  it('publishes catalogue atomically and updates snapshot', async () => {
    await service.publishCatalogue(mockCatalogueData);

    const result = await service.getCatalogue();
    expect(result.cacheSource).toBe('HIT');
    expect(result.catalogue.books).toHaveLength(1);

    const inStore = await store.getJson<CatalogueData>('catalogue');
    expect(inStore).toEqual(mockCatalogueData);
  });

  it('invalidates snapshot correctly', async () => {
    await service.publishCatalogue(mockCatalogueData);
    service.invalidateSnapshot();

    const afterInvalidate = await service.getCatalogue();
    expect(afterInvalidate.cacheSource).toBe('MISS');
  });
});
