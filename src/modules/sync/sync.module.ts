import { Module } from '@nestjs/common';
import { SyncLock } from './sync-lock.js';
import { SyncStatusService } from './sync-status.service.js';
import { SyncService } from './sync.service.js';
import { AutoSyncService } from './auto-sync.service.js';
import { HttpModule } from '../../common/http/http.module.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { StoreModule } from '../../common/store/store.module.js';
import { ConfigModule } from '../../common/config/config.module.js';

@Module({
  imports: [ConfigModule, HttpModule, CatalogueModule, StoreModule],
  providers: [SyncLock, SyncStatusService, SyncService, AutoSyncService],
  exports: [SyncLock, SyncStatusService, SyncService],
})
export class SyncModule {}
