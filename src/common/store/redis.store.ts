import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import type { KeyValueStore } from './key-value-store.interface.js';
import { AppConfigService } from '../config/app-config.service.js';
import { StoreUnavailableError } from '../errors/app-error.js';

const LUA_COMPARE_AND_DELETE = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface RedisStoreOptions {
  readonly url?: string;
  readonly db?: number;
  readonly keyPrefix?: string;
  readonly commandTimeoutMs?: number;
}

@Injectable()
export class RedisStore implements KeyValueStore, OnApplicationShutdown {
  private readonly logger = new Logger(RedisStore.name);
  private readonly client: Redis;
  private readonly prefix: string;
  private isClosed = false;

  constructor(
    @Optional()
    @Inject(AppConfigService)
    configOrOptions?: AppConfigService | RedisStoreOptions,
  ) {
    const opts = configOrOptions ?? {};
    let url: string;
    let db: number;
    let prefix: string;
    let commandTimeoutMs: number;

    if ('values' in opts) {
      url = opts.redisUrl;
      db = opts.redisDb;
      prefix = opts.keyPrefix;
      commandTimeoutMs = 2000;
    } else {
      url = opts.url ?? 'redis://localhost:6379';
      db = opts.db ?? 0;
      prefix = opts.keyPrefix ?? 'bsg:v1:';
      commandTimeoutMs = opts.commandTimeoutMs ?? 2000;
    }

    this.prefix = prefix;

    this.client = new Redis(url, {
      db,
      commandTimeout: commandTimeoutMs,
      connectTimeout: commandTimeoutMs,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 2) {
          return null; // Stop retrying quickly to fail fast
        }
        return Math.min(times * 100, 500);
      },
    });

    this.client.on('error', (err) => {
      if (!this.isClosed) {
        this.logger.warn(`Redis connection error: ${err.message}`);
      }
    });
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private wrapError(operation: string, err: unknown): never {
    if (err instanceof StoreUnavailableError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new StoreUnavailableError(
      `Redis ${operation} failed: ${msg}`,
      5,
      err,
    );
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.fullKey(key));
      if (raw === null || raw === undefined) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (err) {
      this.wrapError(`getJson('${key}')`, err);
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      const full = this.fullKey(key);
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.client.set(full, raw, 'EX', ttlSeconds);
      } else {
        await this.client.set(full, raw);
      }
    } catch (err) {
      this.wrapError(`setJson('${key}')`, err);
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const count = await this.client.del(this.fullKey(key));
      return count > 0;
    } catch (err) {
      this.wrapError(`del('${key}')`, err);
    }
  }

  async rename(sourceKey: string, destKey: string): Promise<void> {
    try {
      await this.client.rename(this.fullKey(sourceKey), this.fullKey(destKey));
    } catch (err) {
      this.wrapError(`rename('${sourceKey}', '${destKey}')`, err);
    }
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const res = await this.client.set(
        this.fullKey(key),
        value,
        'EX',
        ttlSeconds,
        'NX',
      );
      return res === 'OK';
    } catch (err) {
      this.wrapError(`setNx('${key}')`, err);
    }
  }

  async compareAndDelete(key: string, token: string): Promise<boolean> {
    try {
      const res = await this.client.eval(
        LUA_COMPARE_AND_DELETE,
        1,
        this.fullKey(key),
        token,
      );
      return res === 1;
    } catch (err) {
      this.wrapError(`compareAndDelete('${key}')`, err);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  async flushDb(): Promise<void> {
    try {
      await this.client.flushdb();
    } catch (err) {
      this.wrapError('flushDb()', err);
    }
  }

  async close(): Promise<void> {
    this.isClosed = true;
    try {
      if (
        this.client.status === 'ready' ||
        this.client.status === 'connecting'
      ) {
        await this.client.quit();
      }
    } catch {
      this.client.disconnect();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
