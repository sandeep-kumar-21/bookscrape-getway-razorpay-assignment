import { ApiProperty } from '@nestjs/swagger';
import { BookSummaryDto } from './book-summary.dto.js';
import { PaginationMetaDto } from './pagination-meta.dto.js';

export class PaginatedBooksResponseDto {
  @ApiProperty({
    type: [BookSummaryDto],
    description: 'Array of book summary items for the current page',
  })
  data!: BookSummaryDto[];

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Pagination metadata',
  })
  meta!: PaginationMetaDto;
}
