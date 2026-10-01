import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseListingPage } from '../../src/modules/books/parsers/listing.parser.js';
import { ParseError } from '../../src/common/errors/app-error.js';

const fixturesDir = resolve(__dirname, '../fixtures');

function loadFixture(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), 'utf-8');
}

describe('listing.parser', () => {
  it('parses homepage.html correctly', () => {
    const html = loadFixture('homepage.html');
    const result = parseListingPage(
      html,
      'https://books.toscrape.com/index.html',
    );

    expect(result.items).toHaveLength(20);
    expect(result.totalResults).toBe(1000);
    expect(result.nextUrl).toBe(
      'https://books.toscrape.com/catalogue/page-2.html',
    );

    const first = result.items[0]!;
    expect(first.id).toBe('a-light-in-the-attic_1000');
    expect(first.position).toBe(1);
    expect(first.title).toBe('A Light in the Attic'); // Untruncated from title attribute
    expect(first.price).toBe(51.77);
    expect(first.currency).toBe('GBP');
    expect(first.rating).toBe(3);
    expect(first.inStock).toBe(true);
    expect(first.category).toBeNull();
    expect(first.sourceUrl).toBe(
      'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    );
    expect(first.imageUrl).toBe(
      'https://books.toscrape.com/media/cache/2c/da/2cdad67c44b002e7ead0cc35693c0e8b.jpg',
    );
  });

  it('parses page-2.html and resolves relative hrefs properly', () => {
    const html = loadFixture('page-2.html');
    const result = parseListingPage(
      html,
      'https://books.toscrape.com/catalogue/page-2.html',
    );

    expect(result.items).toHaveLength(20);
    expect(result.totalResults).toBe(1000);
    expect(result.nextUrl).toBe(
      'https://books.toscrape.com/catalogue/page-3.html',
    );

    const first = result.items[0]!;
    expect(first.id).toBe('in-her-wake_980');
    expect(first.sourceUrl).toBe(
      'https://books.toscrape.com/catalogue/in-her-wake_980/index.html',
    );
  });

  it('parses page-50.html (boundary last page) with nextUrl as null', () => {
    const html = loadFixture('page-50.html');
    const result = parseListingPage(
      html,
      'https://books.toscrape.com/catalogue/page-50.html',
    );

    expect(result.items).toHaveLength(20);
    expect(result.totalResults).toBe(1000);
    expect(result.nextUrl).toBeNull();
  });

  it('throws ParseError on broken.html naming items', () => {
    const html = loadFixture('broken.html');
    expect(() =>
      parseListingPage(html, 'https://books.toscrape.com/broken.html'),
    ).toThrow(ParseError);

    try {
      parseListingPage(html, 'https://books.toscrape.com/broken.html');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).fieldName).toBe('items');
    }
  });

  it('throws ParseError when HTML is empty', () => {
    expect(() => parseListingPage('', 'https://books.toscrape.com/')).toThrow(
      ParseError,
    );
  });

  it('throws ParseError if a product card is missing essential fields', () => {
    const missingTitle = `
      <section>
        <article class="product_pod">
          <div class="image_container"><a href="book_1/index.html"><img src="thumb.jpg" /></a></div>
          <p class="star-rating One"></p>
          <h3><a href="book_1/index.html"></a></h3>
          <p class="price_color">£10.00</p>
          <p class="instock availability">In stock</p>
        </article>
      </section>
    `;
    expect(() =>
      parseListingPage(missingTitle, 'https://books.toscrape.com/'),
    ).toThrow(ParseError);
  });
});
