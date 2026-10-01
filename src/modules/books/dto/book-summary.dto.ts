import { ApiProperty } from '@nestjs/swagger';
import type { Rating } from '../domain/book.types.js';

export class BookSummaryDto {
  @ApiProperty({
    example: 'a-light-in-the-attic_1000',
    description: 'Unique book identifier formatted as slug_numericId',
  })
  id!: string;

  @ApiProperty({
    example: 1,
    description: 'Original 1-based index in the site catalogue',
  })
  position!: number;

  @ApiProperty({
    example: 'A Light in the Attic',
    description: 'Book title',
  })
  title!: string;

  @ApiProperty({
    example: 51.77,
    description: 'Price in INR',
  })
  price!: number;

  @ApiProperty({
    example: 'INR',
    description: 'ISO currency code',
  })
  currency!: string;

  @ApiProperty({
    example: 3,
    description: 'Star rating from 1 to 5',
    enum: [1, 2, 3, 4, 5],
  })
  rating!: Rating;

  @ApiProperty({
    example: true,
    description: 'Availability status',
  })
  inStock!: boolean;

  @ApiProperty({
    example: 'Poetry',
    nullable: true,
    description: 'Assigned category display name',
  })
  category!: string | null;

  @ApiProperty({
    example:
      'https://books.toscrape.com/media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg',
    description: 'Absolute URL of the cover thumbnail image',
  })
  imageUrl!: string;

  @ApiProperty({
    example:
      'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    description: 'Absolute URL of the book detail page on the source website',
  })
  sourceUrl!: string;
}
