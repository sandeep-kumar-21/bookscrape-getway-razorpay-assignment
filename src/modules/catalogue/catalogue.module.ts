import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service.js';
import { StoreModule } from '../../common/store/store.module.js';
import { ConfigModule } from '../../common/config/config.module.js';

@Module({
  imports: [ConfigModule, StoreModule],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
