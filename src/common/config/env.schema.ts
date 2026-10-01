import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  KEY_PREFIX: z.string().default('bsg:v1:'),
  SOURCE_BASE_URL: z.string().url().default('https://books.toscrape.com'),
  USER_AGENT: z
    .string()
    .default(
      'bookscrape-gateway/1.0 (+https://github.com/assignment/bookscrape-gateway)',
    ),
  HTTP_TIMEOUT_MS: z.coerce.number().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  HTTP_CONCURRENCY: z.coerce.number().int().positive().default(2),
  HTTP_DELAY_MS: z.coerce.number().int().nonnegative().default(300),
  DETAIL_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  SNAPSHOT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  SYNC_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTO_SYNC_ON_BOOT: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => (typeof val === 'boolean' ? val : val === 'true'))
    .default(true),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnv(
  rawEnv: Record<string, unknown> = process.env,
): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errorDetails}`);
  }
  return result.data;
}
