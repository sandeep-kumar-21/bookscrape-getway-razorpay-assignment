import { Injectable, Optional, Inject } from '@nestjs/common';
import { AppConfig, validateEnv } from './env.schema.js';

export const CUSTOM_ENV = Symbol('CUSTOM_ENV');

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  constructor(
    @Optional() @Inject(CUSTOM_ENV) customEnv?: Record<string, unknown>,
  ) {
    this.config = validateEnv(customEnv ?? process.env);
  }

  static create(customEnv?: Record<string, unknown>): AppConfigService {
    return new AppConfigService(customEnv);
  }

  get port(): number {
    return this.config.PORT;
  }

  get nodeEnv(): string {
    return this.config.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  get redisUrl(): string {
    return this.config.REDIS_URL;
  }

  get redisDb(): number {
    return this.config.REDIS_DB;
  }

  get keyPrefix(): string {
    return this.config.KEY_PREFIX;
  }

  get sourceBaseUrl(): string {
    return this.config.SOURCE_BASE_URL;
  }

  get userAgent(): string {
    return this.config.USER_AGENT;
  }

  get httpTimeoutMs(): number {
    return this.config.HTTP_TIMEOUT_MS;
  }

  get httpMaxRetries(): number {
    return this.config.HTTP_MAX_RETRIES;
  }

  get httpConcurrency(): number {
    return this.config.HTTP_CONCURRENCY;
  }

  get httpDelayMs(): number {
    return this.config.HTTP_DELAY_MS;
  }

  get detailTtlSeconds(): number {
    return this.config.DETAIL_TTL_SECONDS;
  }

  get snapshotTtlSeconds(): number {
    return this.config.SNAPSHOT_TTL_SECONDS;
  }

  get syncLockTtlSeconds(): number {
    return this.config.SYNC_LOCK_TTL_SECONDS;
  }

  get autoSyncOnBoot(): boolean {
    return this.config.AUTO_SYNC_ON_BOOT;
  }

  get throttleTtl(): number {
    return this.config.THROTTLE_TTL;
  }

  get throttleLimit(): number {
    return this.config.THROTTLE_LIMIT;
  }

  get values(): Readonly<AppConfig> {
    return this.config;
  }
}
