import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';

describe('GET /api/v1/books/:id (e2e)', () => {
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    context = await createTestApp({ seedCatalogue: true });
  });

  it('lazily scrapes detail on first call (MISS) and serves from Redis on second call (HIT)', async () => {
    // Call 1: MISS
    const res1 = await request(context!.app.getHttpServer())
      .get('/api/v1/books/book-one_1')
      .expect(200);

    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body).toMatchObject({
      id: 'book-one_1',
      position: 1,
      title: 'Book One',
      price: 10.0,
      currency: 'INR',
      rating: 3,
      inStock: true,
      category: 'Travel',
      description: 'This is the description for Book One.',
      stockCount: 10,
      upc: 'upc0000000000001',
      productType: 'Books',
      priceExclTax: 10.0,
      priceInclTax: 10.0,
      tax: 0.0,
      numberOfReviews: 0,
    });
    expect(res1.body.imageUrl).toContain('1.jpg');
    expect(res1.body.sourceUrl).toContain('book-one_1');
    expect(res1.body.scrapedAt).toBeDefined();

    // Call 2: HIT
    const res2 = await request(context!.app.getHttpServer())
      .get('/api/v1/books/book-one_1')
      .expect(200);

    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body).toEqual(res1.body);
  });

  it('returns 404 BOOK_NOT_FOUND without any upstream call when book ID is not in catalogue', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/unknown-book_9999')
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'NotFound',
      code: 'BOOK_NOT_FOUND',
    });
  });

  it('rejects invalid or malicious book IDs with 400 INVALID_BOOK_ID', async () => {
    // Missing numeric suffix
    const r1 = await request(context!.app.getHttpServer())
      .get('/api/v1/books/invalid-id')
      .expect(400);

    expect(r1.body).toMatchObject({
      statusCode: 400,
      error: 'BadRequest',
      code: 'INVALID_BOOK_ID',
    });

    // Special characters / path traversal attempt
    const r2 = await request(context!.app.getHttpServer())
      .get('/api/v1/books/..%2F..%2Fetc_1')
      .expect(400);

    expect(r2.body).toMatchObject({
      statusCode: 400,
      error: 'BadRequest',
      code: 'INVALID_BOOK_ID',
    });

    // URL scheme injection
    const r3 = await request(context!.app.getHttpServer())
      .get('/api/v1/books/http:evil_1')
      .expect(400);

    expect(r3.body).toMatchObject({
      statusCode: 400,
      error: 'BadRequest',
      code: 'INVALID_BOOK_ID',
    });
  });

  it('does NOT shadow /books/search route with /books/:id', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/search?q=one')
      .expect(200);

    // If shadowed, it would have treated "search" as an ID and returned 400 INVALID_BOOK_ID
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 503 CATALOGUE_NOT_READY when catalogue is not ready', async () => {
    const coldContext = await createTestApp({ seedCatalogue: false });
    try {
      const res = await request(coldContext.app.getHttpServer())
        .get('/api/v1/books/book-one_1')
        .expect(503);

      expect(res.headers['retry-after']).toBe('10');
      expect(res.body).toMatchObject({
        statusCode: 503,
        error: 'ServiceUnavailable',
        code: 'CATALOGUE_NOT_READY',
      });
    } finally {
      await coldContext.close();
    }
  });
});
