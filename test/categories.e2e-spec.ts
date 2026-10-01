import { describe, expect, it, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';

describe('GET /api/v1/categories (e2e)', () => {
  let context: TestAppContext | null = null;

  afterEach(async () => {
    if (context) {
      await context.close();
      context = null;
    }
  });

  it('returns all categories sorted alphabetically with genuine counts when catalogue is ready', async () => {
    context = await createTestApp({ seedCatalogue: true });
    // Invalidate snapshot so the first request must fetch from store (MISS)
    context.catalogueService.invalidateSnapshot();

    // First call: MISS from Redis into snapshot cache
    const res1 = await request(context.app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);

    expect(res1.headers['x-cache']).toBe('MISS');
    expect(Array.isArray(res1.body)).toBe(true);
    expect(res1.body.length).toBe(3);

    // Verify alphabetical ordering by name
    const names = res1.body.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Historical Fiction', 'Mystery', 'Travel']);

    // Verify individual counts and structure
    const [historicalFiction, mystery, travel] = res1.body;
    expect(historicalFiction).toMatchObject({
      id: 'historical-fiction_4',
      name: 'Historical Fiction',
      count: 5,
    });
    expect(historicalFiction.url).toContain('historical-fiction_4');

    expect(mystery).toMatchObject({
      id: 'mystery_3',
      name: 'Mystery',
      count: 6,
    });

    expect(travel).toMatchObject({
      id: 'travel_2',
      name: 'Travel',
      count: 4,
    });

    // Sum of category counts must equal total books in catalogue (5 + 6 + 4 = 15)
    const totalCategoryBooks = res1.body.reduce(
      (sum: number, c: { count: number }) => sum + c.count,
      0,
    );
    expect(totalCategoryBooks).toBe(15);

    // Second call: in-memory HIT
    const res2 = await request(context.app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);

    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body).toEqual(res1.body);
  });

  it('returns 503 CATALOGUE_NOT_READY with Retry-After when catalogue is unseeded', async () => {
    context = await createTestApp({ seedCatalogue: false });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/categories')
      .expect(503);

    expect(res.headers['retry-after']).toBe('10');
    expect(res.body).toMatchObject({
      statusCode: 503,
      error: 'ServiceUnavailable',
      code: 'CATALOGUE_NOT_READY',
    });
  });
});
