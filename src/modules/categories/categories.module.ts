import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller.js';
import { CatalogueModule } from '../catalogue/catalogue.module.js';

@Module({
  imports: [CatalogueModule],
  controllers: [CategoriesController],
  exports: [],
})
export class CategoriesModule {}
