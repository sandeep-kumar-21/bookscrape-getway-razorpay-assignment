import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Current page number (1-based)' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Number of items per page' })
  limit!: number;

  @ApiProperty({ example: 1000, description: 'Total number of matching items' })
  total!: number;

  @ApiProperty({ example: 50, description: 'Total number of available pages' })
  totalPages!: number;
}
