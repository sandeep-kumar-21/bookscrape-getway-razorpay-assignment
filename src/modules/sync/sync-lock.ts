import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import { AppConfigService } from '../../common/config/app-config.service.js';

@Injectable()
export class SyncLock {
  private readonly logger = new Logger(SyncLock.name);
  private static readonly LOCK_KEY = 'lock:sync';

  constructor(
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Attempts to acquire the distributed sync lock.
   * Returns a random token if acquired, or null if the lock is held by another worker.
   */
  async acquire(): Promise<string | null> {
    const token = randomUUID();
    const acquired = await this.store.setNx(
      SyncLock.LOCK_KEY,
      token,
      this.config.syncLockTtlSeconds,
    );

    if (acquired) {
      this.logger.debug(`Acquired sync lock with token ${token}`);
      return token;
    }

    this.logger.warn('Failed to acquire sync lock: already held');
    return null;
  }

  /**
   * Safely releases the sync lock using token-verified compare-and-delete.
   */
  async release(token: string): Promise<boolean> {
    const released = await this.store.compareAndDelete(
      SyncLock.LOCK_KEY,
      token,
    );
    if (released) {
      this.logger.debug(`Released sync lock with token ${token}`);
    } else {
      this.logger.warn(
        `Failed to release sync lock with token ${token} (token mismatch or expired)`,
      );
    }
    return released;
  }
}
