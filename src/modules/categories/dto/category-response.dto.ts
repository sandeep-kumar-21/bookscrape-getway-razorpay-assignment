import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    example: 'historical-fiction_4',
    description: 'Unique category identifier',
  })
  id!: string;

  @ApiProperty({
    example: 'Historical Fiction',
    description: 'Category display name',
  })
  name!: string;

  @ApiProperty({
    example: 26,
    description: 'Total number of books in this category',
  })
  count!: number;

  @ApiProperty({
    example:
      'https://books.toscrape.com/catalogue/category/books/historical-fiction_4/index.html',
    description: 'Canonical URL to the category page on the source website',
  })
  url!: string;
}
