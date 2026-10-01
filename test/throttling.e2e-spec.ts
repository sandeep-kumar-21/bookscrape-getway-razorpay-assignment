import { describe, expect, it, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';

describe('Throttling, Request ID & Hardening (e2e)', () => {
  let context: TestAppContext | null = null;

  afterEach(async () => {
    if (context) {
      await context.close();
      context = null;
    }
  });

  it('attaches X-Request-Id header to every response', async () => {
    context = await createTestApp({ seedCatalogue: true });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('preserves incoming X-Request-Id header', async () => {
    context = await createTestApp({ seedCatalogue: true });

    const customId = 'trace-abc-123';
    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', customId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('throttles requests with 429 RATE_LIMIT_EXCEEDED when limit is exceeded', async () => {
    // Configure tight limit: 3 requests per 60 seconds
    context = await createTestApp({
      seedCatalogue: true,
      throttleLimit: 3,
      throttleTtl: 60,
    });

    const server = context.app.getHttpServer();

    // Requests 1, 2, 3 succeed
    await request(server).get('/api/v1/books').expect(200);
    await request(server).get('/api/v1/books').expect(200);
    await request(server).get('/api/v1/books').expect(200);

    // Request 4 must be throttled with 429
    const res4 = await request(server).get('/api/v1/books').expect(429);

    expect(res4.body).toMatchObject({
      statusCode: 429,
      error: 'TooManyRequests',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    expect(res4.headers['x-request-id']).toBeDefined();
  });

  it('does NOT throttle /health even when rate limit is exceeded', async () => {
    // Configure limit of 2 requests
    context = await createTestApp({
      seedCatalogue: true,
      throttleLimit: 2,
      throttleTtl: 60,
    });

    const server = context.app.getHttpServer();

    // Consume the 2 tokens on /books
    await request(server).get('/api/v1/books').expect(200);
    await request(server).get('/api/v1/books').expect(200);
    await request(server).get('/api/v1/books').expect(429);

    // /health should still succeed because it is marked with @SkipThrottle()
    for (let i = 0; i < 5; i++) {
      const res = await request(server).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('healthy');
    }
  });
});
