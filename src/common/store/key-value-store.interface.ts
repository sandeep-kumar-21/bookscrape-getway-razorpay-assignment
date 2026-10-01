export const KEY_VALUE_STORE = Symbol('KEY_VALUE_STORE');

export interface KeyValueStore {
  /**
   * Retrieves and deserializes a JSON value by key. Returns null if key does not exist.
   */
  getJson<T>(key: string): Promise<T | null>;

  /**
   * Serializes and stores a JSON value by key, with an optional TTL in seconds.
   */
  setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Deletes a key from the store. Returns true if key was deleted, false if it did not exist.
   */
  del(key: string): Promise<boolean>;

  /**
   * Atomically renames sourceKey to destKey.
   */
  rename(sourceKey: string, destKey: string): Promise<void>;

  /**
   * Sets key to string value only if it does not already exist (SET NX EX).
   * Returns true if the key was set, false otherwise.
   */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomically compares the stored string value with the provided token and deletes
   * the key only if they match (used for safe distributed lock release).
   * Returns true if deleted, false if token did not match or key did not exist.
   */
  compareAndDelete(key: string, token: string): Promise<boolean>;

  /**
   * Checks connectivity to the store. Returns true if reachable and responsive.
   */
  ping(): Promise<boolean>;

  /**
   * Flushes all keys in the current logical database (used primarily for test cleanup).
   */
  flushDb(): Promise<void>;

  /**
   * Closes the store connection gracefully.
   */
  close(): Promise<void>;
}
