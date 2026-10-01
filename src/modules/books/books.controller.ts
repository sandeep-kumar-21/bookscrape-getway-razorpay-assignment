import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { BookDetailService } from './book-detail.service.js';
import { BookIdPipe } from './pipes/book-id.pipe.js';
import {
  filterBooks,
  paginate,
  searchBooks,
  sortBooks,
} from '../catalogue/engine/query.util.js';
import { ListBooksQueryDto } from './dto/list-books-query.dto.js';
import { SearchBooksQueryDto } from './dto/search-books-query.dto.js';
import { PaginatedBooksResponseDto } from './dto/paginated-books.dto.js';
import { BookDetailDto } from './dto/book-detail.dto.js';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(
    @Inject(CatalogueService)
    private readonly catalogueService: CatalogueService,
    @Inject(BookDetailService)
    private readonly bookDetailService: BookDetailService,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search books by title',
    description:
      'Performs multi-token AND matching across normalized book titles. Ranks results by match proximity (exact > prefix > contains).',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results returned successfully',
    type: PaginatedBooksResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. query string too short or too long)',
  })
  @ApiResponse({
    status: 503,
    description: 'Catalogue is not ready',
  })
  async searchBooks(
    @Query() query: SearchBooksQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedBooksResponseDto> {
    const result = await this.catalogueService.getCatalogue();
    res.setHeader('X-Cache', result.cacheSource);

    const matches = searchBooks(result.catalogue.books, query.q);
    const paginated = paginate(matches, query.page, query.limit);

    return paginated;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get full book details by ID',
    description:
      'Retrieves full book details including stock count, tax details, description, and UPC. Serves from Redis cache or lazily scrapes the upstream site.',
  })
  @ApiResponse({
    status: 200,
    description: 'Book details retrieved successfully',
    type: BookDetailDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid book ID format (must match slug_numericId pattern)',
  })
  @ApiResponse({
    status: 404,
    description: 'Book not found in catalogue',
  })
  @ApiResponse({
    status: 503,
    description: 'Catalogue is not ready',
  })
  async getBookDetail(
    @Param('id', BookIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookDetailDto> {
    const result = await this.bookDetailService.get(id);
    res.setHeader('X-Cache', result.cacheSource);
    return result.detail;
  }

  @Get()
  @ApiOperation({
    summary: 'List books with filtering, sorting, and pagination',
    description:
      'Retrieves books from the site catalogue with support for category, price range, rating, stock status filtering, and sorting.',
  })
  @ApiResponse({
    status: 200,
    description: 'Books retrieved successfully',
    type: PaginatedBooksResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or unknown category specified',
  })
  @ApiResponse({
    status: 503,
    description: 'Catalogue is not ready',
  })
  async listBooks(
    @Query() query: ListBooksQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedBooksResponseDto> {
    const result = await this.catalogueService.getCatalogue();
    res.setHeader('X-Cache', result.cacheSource);

    // 1. Filter
    const filtered = filterBooks(
      result.catalogue.books,
      {
        category: query.category,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        rating: query.rating,
        inStock: query.inStock,
      },
      result.catalogue.categories,
    );

    // 2. Sort
    const sorted = sortBooks(filtered, query.sort, query.order);

    // 3. Paginate
    const paginated = paginate(sorted, query.page, query.limit);

    return paginated;
  }
}
