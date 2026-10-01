import type { KeyValueStore } from '../../src/common/store/key-value-store.interface.js';
import { StoreUnavailableError } from '../../src/common/errors/app-error.js';

interface StoreEntry {
  value: string;
  expiresAt?: number;
}

export class InMemoryStore implements KeyValueStore {
  private readonly data = new Map<string, StoreEntry>();
  private isFailing = false;

  simulateFailure(fail: boolean): void {
    this.isFailing = fail;
  }

  private checkFailure(operation: string): void {
    if (this.isFailing) {
      throw new StoreUnavailableError(
        `Simulated store failure during ${operation}`,
      );
    }
  }

  private isExpired(entry: StoreEntry): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  }

  async getJson<T>(key: string): Promise<T | null> {
    this.checkFailure(`getJson('${key}')`);
    const entry = this.data.get(key);
    if (!entry) {
      return null;
    }
    if (this.isExpired(entry)) {
      this.data.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.checkFailure(`setJson('${key}')`);
    const expiresAt =
      ttlSeconds !== undefined && ttlSeconds > 0
        ? Date.now() + ttlSeconds * 1000
        : undefined;

    this.data.set(key, {
      value: JSON.stringify(value),
      expiresAt,
    });
  }

  async del(key: string): Promise<boolean> {
    this.checkFailure(`del('${key}')`);
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed;
  }

  async rename(sourceKey: string, destKey: string): Promise<void> {
    this.checkFailure(`rename('${sourceKey}', '${destKey}')`);
    const entry = this.data.get(sourceKey);
    if (!entry || this.isExpired(entry)) {
      throw new StoreUnavailableError(
        `rename failed: source key '${sourceKey}' does not exist`,
      );
    }
    this.data.delete(sourceKey);
    this.data.set(destKey, entry);
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.checkFailure(`setNx('${key}')`);
    const existing = this.data.get(key);
    if (existing && !this.isExpired(existing)) {
      return false;
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.data.set(key, { value, expiresAt });
    return true;
  }

  async compareAndDelete(key: string, token: string): Promise<boolean> {
    this.checkFailure(`compareAndDelete('${key}')`);
    const entry = this.data.get(key);
    if (!entry || this.isExpired(entry)) {
      return false;
    }
    if (entry.value === token) {
      this.data.delete(key);
      return true;
    }
    return false;
  }

  async ping(): Promise<boolean> {
    if (this.isFailing) {
      return false;
    }
    return true;
  }

  async flushDb(): Promise<void> {
    this.checkFailure('flushDb()');
    this.data.clear();
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}
