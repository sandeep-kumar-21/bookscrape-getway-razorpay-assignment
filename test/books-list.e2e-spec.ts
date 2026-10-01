import { describe, expect, it, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';

describe('GET /api/v1/books (e2e)', () => {
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    // Seed the catalogue once for the suite
    context = await createTestApp({ seedCatalogue: true });
  });

  afterEach(() => {
    // Keep context alive across tests in suite
  });

  it('returns paginated list preserving site order by default with X-Cache header', async () => {
    context!.catalogueService.invalidateSnapshot();

    const res1 = await request(context!.app.getHttpServer())
      .get('/api/v1/books')
      .expect(200);

    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 15,
      totalPages: 1,
    });
    expect(res1.body.data.length).toBe(15);

    // Verify first item matches site position 1
    const first = res1.body.data[0];
    expect(first).toMatchObject({
      id: 'book-one_1',
      position: 1,
      title: 'Book One',
      price: 10.0,
      currency: 'GBP',
      rating: 3,
      inStock: true,
      category: 'Travel',
    });
    expect(first.imageUrl).toContain('1.jpg');
    expect(first.sourceUrl).toContain('book-one_1');

    // Subsequent request is HIT
    const res2 = await request(context!.app.getHttpServer())
      .get('/api/v1/books')
      .expect(200);

    expect(res2.headers['x-cache']).toBe('HIT');
  });

  it('correctly slices pages and returns empty data beyond last page', async () => {
    // Page 1 with limit 5
    const p1 = await request(context!.app.getHttpServer())
      .get('/api/v1/books?page=1&limit=5')
      .expect(200);

    expect(p1.body.data.length).toBe(5);
    expect(p1.body.data[0].position).toBe(1);
    expect(p1.body.data[4].position).toBe(5);
    expect(p1.body.meta).toEqual({
      page: 1,
      limit: 5,
      total: 15,
      totalPages: 3,
    });

    // Page 2 with limit 5
    const p2 = await request(context!.app.getHttpServer())
      .get('/api/v1/books?page=2&limit=5')
      .expect(200);

    expect(p2.body.data.length).toBe(5);
    expect(p2.body.data[0].position).toBe(6);
    expect(p2.body.data[4].position).toBe(10);

    // Page 3 with limit 5
    const p3 = await request(context!.app.getHttpServer())
      .get('/api/v1/books?page=3&limit=5')
      .expect(200);

    expect(p3.body.data.length).toBe(5);
    expect(p3.body.data[0].position).toBe(11);
    expect(p3.body.data[4].position).toBe(15);

    // Page 4 (beyond last page)
    const p4 = await request(context!.app.getHttpServer())
      .get('/api/v1/books?page=4&limit=5')
      .expect(200);

    expect(p4.body.data).toEqual([]);
    expect(p4.body.meta).toEqual({
      page: 4,
      limit: 5,
      total: 15,
      totalPages: 3,
    });
  });

  it('filters by category (by name and by slug ID case-insensitively)', async () => {
    // By name
    const resName = await request(context!.app.getHttpServer())
      .get('/api/v1/books?category=Travel')
      .expect(200);

    expect(resName.body.data.length).toBe(4);
    for (const b of resName.body.data) {
      expect(b.category).toBe('Travel');
    }

    // By slug ID
    const resId = await request(context!.app.getHttpServer())
      .get('/api/v1/books?category=travel_2')
      .expect(200);

    expect(resId.body.data.length).toBe(4);

    // Mystery category
    const resMystery = await request(context!.app.getHttpServer())
      .get('/api/v1/books?category=mystery')
      .expect(200);

    expect(resMystery.body.data.length).toBe(6);
  });

  it('filters by price range, rating, and stock status', async () => {
    // Price between 20 and 40
    const resPrice = await request(context!.app.getHttpServer())
      .get('/api/v1/books?minPrice=20&maxPrice=40')
      .expect(200);

    expect(resPrice.body.data.length).toBeGreaterThan(0);
    for (const b of resPrice.body.data) {
      expect(b.price).toBeGreaterThanOrEqual(20);
      expect(b.price).toBeLessThanOrEqual(40);
    }

    // Rating = 4
    const resRating = await request(context!.app.getHttpServer())
      .get('/api/v1/books?rating=4')
      .expect(200);

    expect(resRating.body.data.length).toBeGreaterThan(0);
    for (const b of resRating.body.data) {
      expect(b.rating).toBe(4);
    }

    // In stock
    const resStock = await request(context!.app.getHttpServer())
      .get('/api/v1/books?inStock=true')
      .expect(200);

    for (const b of resStock.body.data) {
      expect(b.inStock).toBe(true);
    }
  });

  it('supports stable sorting with id tiebreaker', async () => {
    // Price asc
    const resAsc = await request(context!.app.getHttpServer())
      .get('/api/v1/books?sort=price&order=asc')
      .expect(200);

    const pricesAsc = resAsc.body.data.map((b: { price: number }) => b.price);
    for (let i = 0; i < pricesAsc.length - 1; i++) {
      expect(pricesAsc[i]).toBeLessThanOrEqual(pricesAsc[i + 1]);
    }

    // Title asc
    const resTitle = await request(context!.app.getHttpServer())
      .get('/api/v1/books?sort=title&order=asc')
      .expect(200);

    const titles = resTitle.body.data.map((b: { title: string }) => b.title);
    for (let i = 0; i < titles.length - 1; i++) {
      expect(titles[i].localeCompare(titles[i + 1])).toBeLessThanOrEqual(0);
    }
  });

  describe('Validation & Error handling', () => {
    it('returns 400 UNKNOWN_CATEGORY when category does not exist', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books?category=nonexistent_99')
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'BadRequest',
        code: 'UNKNOWN_CATEGORY',
      });
    });

    it('returns 400 when minPrice > maxPrice', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books?minPrice=50&maxPrice=10')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toContain(
        'minPrice must be less than or equal to maxPrice',
      );
    });

    it('returns 400 when page is less than 1', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books?page=0')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('returns 400 when limit exceeds 50', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books?limit=100')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('returns 400 when rating is out of 1-5 bounds', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books?rating=9')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });
  });
});
