import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { HTTP_TRANSPORT } from '../../src/common/http/http-transport.interface.js';
import { FixtureTransport } from './fixture-transport.js';
import {
  KEY_VALUE_STORE,
  type KeyValueStore,
} from '../../src/common/store/key-value-store.interface.js';
import { AppConfigService } from '../../src/common/config/app-config.service.js';
import { SyncService } from '../../src/modules/sync/sync.service.js';
import { CatalogueService } from '../../src/modules/catalogue/catalogue.service.js';
import { SyncStatusService } from '../../src/modules/sync/sync-status.service.js';

export interface TestAppOptions {
  readonly seedCatalogue?: boolean;
  readonly flushRedis?: boolean;
  readonly redisDb?: number;
  readonly customStore?: KeyValueStore;
  readonly throttleLimit?: number;
  readonly throttleTtl?: number;
}

export function createMiniSiteTransport(): FixtureTransport {
  const miniSiteDir = resolve(process.cwd(), 'test/fixtures/mini-site');
  const transport = new FixtureTransport(miniSiteDir);

  transport.setFixture('/index.html', 'page-1.html');
  transport.setFixture('/catalogue/page-1.html', 'page-1.html');
  transport.setFixture('/catalogue/page-2.html', 'page-2.html');
  transport.setFixture('/catalogue/page-3.html', 'page-3.html');

  transport.setFixture(
    '/catalogue/category/books/travel_2/index.html',
    'category-travel.html',
  );
  transport.setFixture(
    '/catalogue/category/books/mystery_3/index.html',
    'category-mystery-1.html',
  );
  transport.setFixture(
    '/catalogue/category/books/mystery_3/page-2.html',
    'category-mystery-2.html',
  );
  transport.setFixture(
    '/catalogue/category/books/historical-fiction_4/index.html',
    'category-historical-fiction.html',
  );

  transport.setFixture(
    '/catalogue/book-one_1/index.html',
    'detail-book-one_1.html',
  );
  transport.setFixture(
    '/catalogue/book-two_2/index.html',
    'detail-book-two_2.html',
  );
  transport.setFixture(
    '/catalogue/book-three_3/index.html',
    'detail-book-three_3.html',
  );
  transport.setFixture(
    '/catalogue/book-four_4/index.html',
    'detail-book-four_4.html',
  );
  transport.setFixture(
    '/catalogue/book-five_5/index.html',
    'detail-book-five_5.html',
  );

  return transport;
}

export interface TestAppContext {
  readonly app: INestApplication;
  readonly store: KeyValueStore;
  readonly transport: FixtureTransport;
  readonly syncService: SyncService;
  readonly catalogueService: CatalogueService;
  readonly syncStatusService: SyncStatusService;
  readonly close: () => Promise<void>;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestAppContext> {
  const transport = createMiniSiteTransport();
  const testConfig = AppConfigService.create({
    NODE_ENV: 'test',
    REDIS_DB: options.redisDb ?? 15,
    KEY_PREFIX: 'test:',
    AUTO_SYNC_ON_BOOT: false,
    HTTP_DELAY_MS: 0,
    HTTP_CONCURRENCY: 2,
    SOURCE_BASE_URL: 'https://books.toscrape.com',
    THROTTLE_LIMIT: options.throttleLimit ?? 10000,
    THROTTLE_TTL: options.throttleTtl ?? 60,
  });

  let moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(HTTP_TRANSPORT)
    .useValue(transport)
    .overrideProvider(AppConfigService)
    .useValue(testConfig);

  if (options.customStore) {
    moduleBuilder = moduleBuilder
      .overrideProvider(KEY_VALUE_STORE)
      .useValue(options.customStore);
  }

  const moduleFixture: TestingModule = await moduleBuilder.compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();

  const store = app.get<KeyValueStore>(KEY_VALUE_STORE);
  const syncService = app.get(SyncService);
  const catalogueService = app.get(CatalogueService);
  const syncStatusService = app.get(SyncStatusService);

  if (options.flushRedis !== false) {
    await store.flushDb();
  }

  if (options.seedCatalogue) {
    await syncService.build({ throwOnLockBusy: true });
  }

  return {
    app,
    store,
    transport,
    syncService,
    catalogueService,
    syncStatusService,
    close: async () => {
      await app.close();
      await store.close();
    },
  };
}
