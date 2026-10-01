import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get()
  @ApiOperation({
    summary: 'List all categories with genuine book counts',
    description:
      'Returns all discovered categories from the site sidebar with genuine book counts, sorted alphabetically by name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories listed successfully',
    type: [CategoryResponseDto],
  })
  @ApiResponse({
    status: 503,
    description: 'Catalogue is not yet ready or is currently being built',
  })
  async getCategories(
    @Res({ passthrough: true }) res: Response,
  ): Promise<CategoryResponseDto[]> {
    const result = await this.catalogueService.getCatalogue();
    res.setHeader('X-Cache', result.cacheSource);

    // Sort categories alphabetically by name
    const sorted = [...result.catalogue.categories].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return sorted.map((cat) => ({
      id: cat.id,
      name: cat.name,
      count: cat.count,
      url: cat.url,
    }));
  }
}
