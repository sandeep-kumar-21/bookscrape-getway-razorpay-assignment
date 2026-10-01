import { describe, expect, it, afterEach } from 'vitest';
import type { KeyValueStore } from '../../src/common/store/key-value-store.interface.js';
import { InMemoryStore } from '../support/in-memory.store.js';
import { RedisStore } from '../../src/common/store/redis.store.js';
import { StoreUnavailableError } from '../../src/common/errors/app-error.js';

function runKeyValueStoreContractTests(
  storeName: string,
  createStore: () => Promise<KeyValueStore>,
  cleanupStore?: (store: KeyValueStore) => Promise<void>,
) {
  describe(`KeyValueStore Contract: ${storeName}`, () => {
    let store: KeyValueStore;

    afterEach(async () => {
      if (store) {
        try {
          await store.flushDb();
        } catch {
          // Ignore flush error during cleanup
        }
        if (cleanupStore) {
          await cleanupStore(store);
        } else {
          await store.close();
        }
      }
    });

    it('pings successfully', async () => {
      store = await createStore();
      const alive = await store.ping();
      expect(alive).toBe(true);
    });

    it('returns null for non-existent key', async () => {
      store = await createStore();
      const val = await store.getJson('non_existent');
      expect(val).toBeNull();
    });

    it('round-trips JSON values with setJson and getJson', async () => {
      store = await createStore();
      const payload = {
        title: 'Contract Test Book',
        count: 42,
        active: true,
        tags: ['one', 'two'],
      };

      await store.setJson('book:test_1', payload);
      const retrieved = await store.getJson<typeof payload>('book:test_1');
      expect(retrieved).toEqual(payload);
    });

    it('deletes keys with del', async () => {
      store = await createStore();
      await store.setJson('key_to_del', { data: 'test' });

      const deleted = await store.del('key_to_del');
      expect(deleted).toBe(true);

      const secondDel = await store.del('key_to_del');
      expect(secondDel).toBe(false);

      expect(await store.getJson('key_to_del')).toBeNull();
    });

    it('atomically renames keys', async () => {
      store = await createStore();
      await store.setJson('source_key', { step: 1 });

      await store.rename('source_key', 'dest_key');

      expect(await store.getJson('source_key')).toBeNull();
      expect(await store.getJson('dest_key')).toEqual({ step: 1 });
    });

    it('enforces setNx contention semantics', async () => {
      store = await createStore();
      const first = await store.setNx('lock:test', 'token_1', 60);
      expect(first).toBe(true);

      const second = await store.setNx('lock:test', 'token_2', 60);
      expect(second).toBe(false);
    });

    it('enforces compareAndDelete semantics (Lua release pattern)', async () => {
      store = await createStore();
      await store.setNx('lock:release_test', 'valid_token', 60);

      // Wrong token does nothing
      const wrongRelease = await store.compareAndDelete(
        'lock:release_test',
        'wrong_token',
      );
      expect(wrongRelease).toBe(false);

      // Correct token deletes key
      const correctRelease = await store.compareAndDelete(
        'lock:release_test',
        'valid_token',
      );
      expect(correctRelease).toBe(true);

      // Subsequent call fails because key was already deleted
      const secondRelease = await store.compareAndDelete(
        'lock:release_test',
        'valid_token',
      );
      expect(secondRelease).toBe(false);
    });

    it('expires keys after TTL', async () => {
      store = await createStore();
      await store.setJson('short_lived', { temp: true }, 1);

      const immediate = await store.getJson('short_lived');
      expect(immediate).toEqual({ temp: true });

      // Wait 1.1s for TTL expiry
      await new Promise((r) => setTimeout(r, 1100));

      const expired = await store.getJson('short_lived');
      expect(expired).toBeNull();
    });
  });
}

// 1. Contract tests for InMemoryStore
runKeyValueStoreContractTests('InMemoryStore', async () => {
  return new InMemoryStore();
});

// 2. Contract tests for live RedisStore on DB 15
runKeyValueStoreContractTests(
  'RedisStore (Docker Redis DB 15)',
  async () => {
    return new RedisStore({
      url: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
      db: 15,
      keyPrefix: 'bsg:test:contract:',
      commandTimeoutMs: 5000,
    });
  },
  async (store) => {
    await store.flushDb();
    await store.close();
  },
);

// 3. Failure handling tests
describe('Store Failure Behavior', () => {
  it('InMemoryStore throws StoreUnavailableError when simulated down', async () => {
    const store = new InMemoryStore();
    store.simulateFailure(true);

    await expect(store.getJson('key')).rejects.toThrow(StoreUnavailableError);
    await expect(store.setJson('key', 'val')).rejects.toThrow(
      StoreUnavailableError,
    );
    expect(await store.ping()).toBe(false);
  });

  it('RedisStore fails fast with StoreUnavailableError when Redis host is unreachable', async () => {
    const deadStore = new RedisStore({
      url: 'redis://127.0.0.1:59999', // Non-existent Redis port
      commandTimeoutMs: 300,
    });

    try {
      await expect(deadStore.getJson('key')).rejects.toThrow(
        StoreUnavailableError,
      );
    } finally {
      await deadStore.close();
    }
  });
});
