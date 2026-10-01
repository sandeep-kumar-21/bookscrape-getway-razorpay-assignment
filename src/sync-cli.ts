process.env['AUTO_SYNC_ON_BOOT'] = 'false';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from './common/config/config.module.js';
import { StoreModule } from './common/store/store.module.js';
import { HttpModule } from './common/http/http.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { SyncService } from './modules/sync/sync.service.js';

@Module({
  imports: [ConfigModule, StoreModule, HttpModule, CatalogueModule, SyncModule],
})
export class SyncCliModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SyncCliModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const syncService = app.get(SyncService);
    console.log('Initiating manual catalogue synchronization...');
    await syncService.build({ throwOnLockBusy: true });
    console.log('Catalogue synchronization finished successfully.');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('Catalogue synchronization failed:', err);
    await app.close();
    process.exit(1);
  }
}

bootstrap();
