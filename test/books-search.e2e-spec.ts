import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';

describe('GET /api/v1/books/search (e2e)', () => {
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    context = await createTestApp({ seedCatalogue: true });
  });

  it('searches books with multi-token AND query and returns ranked results with X-Cache', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/search?q=Book Three')
      .expect(200);

    expect(res.headers['x-cache']).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].title).toBe('Book Three');
    expect(res.body.meta.total).toBe(1);
  });

  it('ranks exact matches before substring matches', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/search?q=Book One')
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    // Exact match "Book One" should be first
    expect(res.body.data[0].title).toBe('Book One');
  });

  it('returns empty data array for nonsense query', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/search?q=nonexistentbook123xyz')
      .expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('supports pagination of search results', async () => {
    const res = await request(context!.app.getHttpServer())
      .get('/api/v1/books/search?q=Book&page=1&limit=5')
      .expect(200);

    expect(res.body.data.length).toBe(5);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(5);
    expect(res.body.meta.total).toBe(15);
    expect(res.body.meta.totalPages).toBe(3);
  });

  describe('Validation & Error handling', () => {
    it('returns 400 when search query q is missing', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books/search')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('returns 400 when search query is shorter than 2 characters', async () => {
      const res = await request(context!.app.getHttpServer())
        .get('/api/v1/books/search?q=a')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toContain(
        'Search query must be between 2 and 100 characters',
      );
    });

    it('returns 400 when search query exceeds 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const res = await request(context!.app.getHttpServer())
        .get(`/api/v1/books/search?q=${longQuery}`)
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toContain(
        'Search query must be between 2 and 100 characters',
      );
    });
  });
});
