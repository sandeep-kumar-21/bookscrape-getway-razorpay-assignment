import { Inject, Injectable } from '@nestjs/common';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../common/store/key-value-store.interface.js';
import type { SyncStatus } from './domain/sync.types.js';

@Injectable()
export class SyncStatusService {
  private static readonly STATUS_KEY = 'sync:status';

  constructor(@Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore) {}

  async getStatus(): Promise<SyncStatus> {
    try {
      const status = await this.store.getJson<SyncStatus>(
        SyncStatusService.STATUS_KEY,
      );
      if (status) {
        return status;
      }
    } catch {
      // Default to idle if store is down
    }

    return { state: 'idle' };
  }

  async setStatus(status: SyncStatus): Promise<void> {
    try {
      await this.store.setJson(SyncStatusService.STATUS_KEY, status);
    } catch {
      // Non-fatal status write failure
    }
  }
}
