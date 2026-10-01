import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { BookDetailService } from './book-detail.service.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { StoreModule } from '../../common/store/store.module.js';
import { HttpModule } from '../../common/http/http.module.js';

@Module({
  imports: [CatalogueModule, StoreModule, HttpModule],
  controllers: [BooksController],
  providers: [BookDetailService],
  exports: [BookDetailService],
})
export class BooksModule {}
