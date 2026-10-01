import { ApiProperty } from '@nestjs/swagger';
import { BookSummaryDto } from './book-summary.dto.js';

export class BookDetailDto extends BookSummaryDto {
  @ApiProperty({
    example:
      'It’s a light in the attic, though the house is dark and the shutters are shut...',
    nullable: true,
    description: 'Book synopsis/description text',
  })
  description!: string | null;

  @ApiProperty({
    example: 22,
    description: 'Number of units available in stock',
  })
  stockCount!: number;

  @ApiProperty({
    example: 'a897fe39b1053632',
    description: 'Universal Product Code',
  })
  upc!: string;

  @ApiProperty({
    example: 'Books',
    description: 'Product type classification',
  })
  productType!: string;

  @ApiProperty({
    example: 51.77,
    description: 'Price excluding tax in INR',
  })
  priceExclTax!: number;

  @ApiProperty({
    example: 51.77,
    description: 'Price including tax in INR',
  })
  priceInclTax!: number;

  @ApiProperty({
    example: 0.0,
    description: 'Tax amount in INR',
  })
  tax!: number;

  @ApiProperty({
    example: 0,
    description: 'Total number of customer reviews',
  })
  numberOfReviews!: number;

  @ApiProperty({
    example: '2026-10-02T02:00:00.000Z',
    description: 'ISO UTC timestamp when this detail page was scraped',
  })
  scrapedAt!: string;
}
