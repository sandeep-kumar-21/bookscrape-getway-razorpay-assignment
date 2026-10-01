import { Module } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module.js';
import { StoreModule } from './common/store/store.module.js';
import { HttpModule } from './common/http/http.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { BooksModule } from './modules/books/books.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule,
    StoreModule,
    HttpModule,
    CatalogueModule,
    SyncModule,
    HealthModule,
    CategoriesModule,
    BooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
