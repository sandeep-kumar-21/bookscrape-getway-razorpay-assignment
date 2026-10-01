import { describe, expect, it, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, TestAppContext } from './support/create-test-app.js';
import { InMemoryStore } from './support/in-memory.store.js';

describe('GET /api/v1/health (e2e)', () => {
  let context: TestAppContext | null = null;

  afterEach(async () => {
    if (context) {
      await context.close();
      context = null;
    }
  });

  it('returns healthy status with ready catalogue when seeded', async () => {
    context = await createTestApp({ seedCatalogue: true });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.timestamp).toBeDefined();

    expect(res.body.catalogue.status).toBe('ready');
    expect(res.body.catalogue.total).toBe(15);
    expect(res.body.catalogue.builtAt).toBeDefined();

    expect(res.body.sync.state).toBe('ready');
    expect(res.body.sync.bookCount).toBe(15);

    expect(res.body.redis.connected).toBe(true);
    expect(typeof res.body.redis.latencyMs).toBe('number');
  });

  it('reports missing catalogue state on cold start without seed', async () => {
    context = await createTestApp({ seedCatalogue: false });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.catalogue.status).toBe('missing');
    expect(res.body.catalogue.total).toBeNull();
    expect(res.body.catalogue.builtAt).toBeNull();
  });

  it('reports building state when sync is currently in progress', async () => {
    context = await createTestApp({ seedCatalogue: false });
    await context.syncStatusService.setStatus({
      state: 'building',
      startedAt: new Date().toISOString(),
    });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.catalogue.status).toBe('building');
    expect(res.body.sync.state).toBe('building');
  });

  it('reports failed state when sync encountered an error', async () => {
    context = await createTestApp({ seedCatalogue: false });
    await context.syncStatusService.setStatus({
      state: 'failed',
      finishedAt: new Date().toISOString(),
      error: 'Simulated crawl failure',
    });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.catalogue.status).toBe('failed');
    expect(res.body.sync.state).toBe('failed');
  });

  it('reports degraded status when Redis connection fails', async () => {
    const failingStore = new InMemoryStore();
    failingStore.ping = async () => false;

    context = await createTestApp({
      seedCatalogue: false,
      flushRedis: false,
      customStore: failingStore,
    });

    const res = await request(context.app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('degraded');
    expect(res.body.redis.connected).toBe(false);
    expect(res.body.redis.latencyMs).toBeNull();
  });
});
