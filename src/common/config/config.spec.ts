import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.schema.js';
import { AppConfigService } from './app-config.service.js';

describe('ConfigModule & Env Validation', () => {
  it('parses valid environment with default values and accesses all getters', () => {
    const config = validateEnv({});
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
    expect(config.REDIS_DB).toBe(0);
    expect(config.SOURCE_BASE_URL).toBe('https://books.toscrape.com');
    expect(config.AUTO_SYNC_ON_BOOT).toBe(true);
    expect(config.HTTP_CONCURRENCY).toBe(2);

    const service = AppConfigService.create({});
    expect(service.port).toBe(3000);
    expect(service.nodeEnv).toBe('development');
    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(false);
    expect(service.redisUrl).toBe('redis://localhost:6379');
    expect(service.redisDb).toBe(0);
    expect(service.keyPrefix).toBe('bsg:v1:');
    expect(service.sourceBaseUrl).toBe('https://books.toscrape.com');
    expect(service.userAgent).toContain('bookscrape-gateway');
    expect(service.httpTimeoutMs).toBe(10000);
    expect(service.httpMaxRetries).toBe(3);
    expect(service.httpConcurrency).toBe(2);
    expect(service.httpDelayMs).toBe(300);
    expect(service.detailTtlSeconds).toBe(604800);
    expect(service.snapshotTtlSeconds).toBe(60);
    expect(service.syncLockTtlSeconds).toBe(900);
    expect(service.autoSyncOnBoot).toBe(true);
    expect(service.throttleTtl).toBe(60);
    expect(service.throttleLimit).toBe(100);
    expect(service.values).toBeDefined();
  });

  it('correctly maps custom environment variables and static factory', () => {
    const custom = {
      PORT: '4000',
      NODE_ENV: 'test',
      REDIS_URL: 'redis://redis-host:6380',
      REDIS_DB: '3',
      AUTO_SYNC_ON_BOOT: 'false',
      HTTP_CONCURRENCY: '4',
    };
    const service = AppConfigService.create(custom);
    expect(service.port).toBe(4000);
    expect(service.nodeEnv).toBe('test');
    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(true);
    expect(service.redisUrl).toBe('redis://redis-host:6380');
    expect(service.redisDb).toBe(3);
    expect(service.autoSyncOnBoot).toBe(false);
    expect(service.httpConcurrency).toBe(4);
  });

  it('fails fast on invalid configuration (e.g. invalid URL or bad port)', () => {
    expect(() =>
      validateEnv({
        SOURCE_BASE_URL: 'not-a-valid-url',
      }),
    ).toThrow('Configuration validation failed');

    expect(() =>
      validateEnv({
        REDIS_DB: '99',
      }),
    ).toThrow('Configuration validation failed');
  });
});
