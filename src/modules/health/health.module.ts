import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { StoreModule } from '../../common/store/store.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';

@Module({
  imports: [StoreModule, SyncModule, CatalogueModule],
  controllers: [HealthController],
})
export class HealthModule {}
