import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { CatalogueNotReadyError } from '../../common/errors/app-error.js';
import type {
  CatalogueData,
  CatalogueResult,
} from './domain/catalogue.types.js';

interface SnapshotCache {
  readonly data: CatalogueData;
  readonly expiresAt: number;
}

@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);
  private cachedSnapshot: SnapshotCache | null = null;

  constructor(
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Retrieves the catalogue data.
   * Priority:
   * 1. In-process snapshot (HIT)
   * 2. KeyValueStore / Redis (MISS)
   * 3. Stale snapshot fallback if store fails (STALE)
   * 4. If nothing is available, throws CatalogueNotReadyError (503)
   */
  async getCatalogue(): Promise<CatalogueResult> {
    const now = Date.now();

    // 1. Fresh in-memory snapshot
    if (this.cachedSnapshot && now < this.cachedSnapshot.expiresAt) {
      return {
        catalogue: this.cachedSnapshot.data,
        cacheSource: 'HIT',
      };
    }

    // 2. Fetch from store
    try {
      const data = await this.store.getJson<CatalogueData>('catalogue');

      if (data && data.books && Array.isArray(data.books)) {
        this.cachedSnapshot = {
          data,
          expiresAt: now + this.config.snapshotTtlSeconds * 1000,
        };

        return {
          catalogue: data,
          cacheSource: 'MISS',
        };
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch catalogue from store: ${err instanceof Error ? err.message : String(err)}`,
      );

      // 3. Fallback to stale snapshot if store is down
      if (this.cachedSnapshot) {
        return {
          catalogue: this.cachedSnapshot.data,
          cacheSource: 'STALE',
        };
      }

      throw new CatalogueNotReadyError(
        'Data store is temporarily unavailable and catalogue is not ready.',
        10,
      );
    }

    // If store returned null or empty
    if (this.cachedSnapshot) {
      return {
        catalogue: this.cachedSnapshot.data,
        cacheSource: 'STALE',
      };
    }

    throw new CatalogueNotReadyError(
      'Catalogue is currently being built. Please retry in a few seconds.',
      10,
    );
  }

  /**
   * Returns current in-memory cached snapshot data without fetching or throwing.
   */
  getCachedCatalogue(): CatalogueData | null {
    return this.cachedSnapshot?.data ?? null;
  }

  /**
   * Invalidates the in-process snapshot. Called immediately after a new catalogue is published.
   */
  invalidateSnapshot(): void {
    this.cachedSnapshot = null;
  }

  /**
   * Atomically publishes a new catalogue to the store and refreshes the snapshot.
   */
  async publishCatalogue(data: CatalogueData): Promise<void> {
    await this.store.setJson('catalogue:tmp', data);
    await this.store.rename('catalogue:tmp', 'catalogue');
    this.cachedSnapshot = {
      data,
      expiresAt: Date.now() + this.config.snapshotTtlSeconds * 1000,
    };
  }
}
