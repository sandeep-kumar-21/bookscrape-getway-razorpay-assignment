export type Rating = 1 | 2 | 3 | 4 | 5;

export interface BookSummary {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly price: number;
  readonly currency: string;
  readonly rating: Rating;
  readonly inStock: boolean;
  readonly category: string | null;
  readonly imageUrl: string;
  readonly sourceUrl: string;
}

export interface BookDetail extends BookSummary {
  readonly description: string | null;
  readonly stockCount: number;
  readonly upc: string;
  readonly productType: string;
  readonly priceExclTax: number;
  readonly priceInclTax: number;
  readonly tax: number;
  readonly numberOfReviews: number;
  readonly scrapedAt: string;
}
