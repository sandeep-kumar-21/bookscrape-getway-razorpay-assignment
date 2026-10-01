import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import { AppConfigService } from '../../common/config/app-config.service.js';

@Injectable()
export class SyncLock implements OnApplicationShutdown {
  private readonly logger = new Logger(SyncLock.name);
  private static readonly LOCK_KEY = 'lock:sync';
  private currentToken: string | null = null;

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
      this.currentToken = token;
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
    if (this.currentToken === token) {
      this.currentToken = null;
    }
    if (released) {
      this.logger.debug(`Released sync lock with token ${token}`);
    } else {
      this.logger.warn(
        `Failed to release sync lock with token ${token} (token mismatch or expired)`,
      );
    }
    return released;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.currentToken) {
      this.logger.log(
        'Application shutting down: releasing active sync lock...',
      );
      try {
        await this.release(this.currentToken);
      } catch (err) {
        this.logger.warn(
          `Failed to release sync lock during shutdown: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
