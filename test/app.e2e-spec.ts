import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('App Bootstrap & Common Pipeline (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('serves root endpoint under /api/v1 prefix', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('serves Swagger documentation at /docs', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    // Swagger UI either redirects with 301/302 to /docs/ or returns 200 HTML
    expect([200, 301, 302]).toContain(res.status);
  });

  it('returns standardized error JSON shape for unknown route (404)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'NotFound',
      code: 'NOT_FOUND',
      path: '/api/v1/non-existent-route',
    });
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
