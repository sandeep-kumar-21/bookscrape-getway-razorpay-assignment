import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';

@Module({
  imports: [CatalogueModule],
  controllers: [BooksController],
  exports: [],
})
export class BooksModule {}
