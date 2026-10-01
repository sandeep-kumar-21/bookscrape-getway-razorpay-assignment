import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBookDetail } from '../../src/modules/books/parsers/book-detail.parser.js';
import { ParseError } from '../../src/common/errors/app-error.js';

const fixturesDir = resolve(__dirname, '../fixtures');

function loadFixture(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), 'utf-8');
}

describe('book-detail.parser', () => {
  it('parses detail-a-light-in-the-attic.html (3-star, full table, description)', () => {
    const html = loadFixture('detail-a-light-in-the-attic.html');
    const url =
      'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';
    const detail = parseBookDetail(html, url, '2026-10-01T20:00:00.000Z');

    expect(detail.id).toBe('a-light-in-the-attic_1000');
    expect(detail.title).toBe('A Light in the Attic');
    expect(detail.price).toBe(51.77);
    expect(detail.currency).toBe('INR');
    expect(detail.rating).toBe(3);
    expect(detail.inStock).toBe(true);
    expect(detail.stockCount).toBe(22);
    expect(detail.category).toBe('Poetry');
    expect(detail.sourceUrl).toBe(url);
    expect(detail.imageUrl).toBe(
      'https://books.toscrape.com/media/cache/fe/72/fe72f0532301ec28892ae79a629a293c.jpg',
    );
    expect(detail.description).toContain(
      "It's hard to imagine a world without A Light in the Attic.",
    );
    expect(detail.upc).toBe('a897fe39b1053632');
    expect(detail.productType).toBe('Books');
    expect(detail.priceExclTax).toBe(51.77);
    expect(detail.priceInclTax).toBe(51.77);
    expect(detail.tax).toBe(0.0);
    expect(detail.numberOfReviews).toBe(0);
    expect(detail.scrapedAt).toBe('2026-10-01T20:00:00.000Z');
  });

  it('parses detail-tipping-the-velvet.html (1-star, stock 20, Historical Fiction)', () => {
    const html = loadFixture('detail-tipping-the-velvet.html');
    const url =
      'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html';
    const detail = parseBookDetail(html, url);

    expect(detail.id).toBe('tipping-the-velvet_999');
    expect(detail.title).toBe('Tipping the Velvet');
    expect(detail.rating).toBe(1);
    expect(detail.price).toBe(53.74);
    expect(detail.stockCount).toBe(20);
    expect(detail.category).toBe('Historical Fiction');
    expect(detail.upc).toBe('90fa61229261140a');
  });

  it('parses detail-sapiens.html (5-star, History category)', () => {
    const html = loadFixture('detail-sapiens.html');
    const url =
      'https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html';
    const detail = parseBookDetail(html, url);

    expect(detail.id).toBe('sapiens-a-brief-history-of-humankind_996');
    expect(detail.title).toBe('Sapiens: A Brief History of Humankind');
    expect(detail.rating).toBe(5);
    expect(detail.price).toBe(54.23);
    expect(detail.category).toBe('History');
  });

  it('parses detail-no-description.html and sets description to null', () => {
    const html = loadFixture('detail-no-description.html');
    const url =
      'https://books.toscrape.com/catalogue/the-bridge-to-consciousness-im-writing-the-bridge-between-science-and-our-old-and-new-beliefs_840/index.html';
    const detail = parseBookDetail(html, url);

    expect(detail.description).toBeNull();
    expect(detail.id).toBe(
      'the-bridge-to-consciousness-im-writing-the-bridge-between-science-and-our-old-and-new-beliefs_840',
    );
    expect(detail.price).toBe(32.0);
    expect(detail.upc).toBe('efc3768127714ec3');
  });

  it('throws ParseError on broken.html naming product container', () => {
    const html = loadFixture('broken.html');
    expect(() =>
      parseBookDetail(
        html,
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    try {
      parseBookDetail(
        html,
        'https://books.toscrape.com/catalogue/book_1/index.html',
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).fieldName).toBe('product');
    }
  });

  it('throws ParseError when HTML is empty', () => {
    expect(() =>
      parseBookDetail(
        '',
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);
  });

  it('throws ParseError if table is missing UPC', () => {
    const missingUpc = `
      <div class="product_main">
        <h1>Some Title</h1>
        <p class="price_color">£10.00</p>
        <p class="star-rating One"></p>
        <p class="instock availability">In stock (5 available)</p>
      </div>
      <div id="product_gallery"><img src="img.jpg" /></div>
      <table class="table table-striped">
        <tr><th>Product Type</th><td>Books</td></tr>
      </table>
    `;
    expect(() =>
      parseBookDetail(
        missingUpc,
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);
  });

  it('handles page without category breadcrumb', () => {
    const html = `
      <ul class="breadcrumb"><li><a href="../../index.html">Home</a></li></ul>
      <div class="product_main">
        <h1>Some Title</h1>
        <p class="price_color">£10.00</p>
        <p class="star-rating One"></p>
        <p class="instock availability">In stock (5 available)</p>
      </div>
      <div id="product_gallery"><img src="img.jpg" /></div>
      <table class="table table-striped">
        <tr><th>UPC</th><td>12345</td></tr>
        <tr><th>Product Type</th><td>Books</td></tr>
        <tr><th>Price (excl. tax)</th><td>£10.00</td></tr>
        <tr><th>Price (incl. tax)</th><td>£10.00</td></tr>
        <tr><th>Tax</th><td>£0.00</td></tr>
        <tr><th>Number of reviews</th><td>0</td></tr>
      </table>
    `;
    const detail = parseBookDetail(
      html,
      'https://books.toscrape.com/catalogue/book_1/index.html',
    );
    expect(detail.category).toBeNull();
  });

  it('throws ParseError on missing table fields or invalid values', () => {
    const baseHtml = (tableContent: string) => `
      <div class="product_main">
        <h1>Some Title</h1>
        <p class="price_color">£10.00</p>
        <p class="star-rating One"></p>
        <p class="instock availability">In stock (5 available)</p>
      </div>
      <div id="product_gallery"><img src="img.jpg" /></div>
      <table class="table table-striped">${tableContent}</table>
    `;

    // Missing Product Type
    expect(() =>
      parseBookDetail(
        baseHtml('<tr><th>UPC</th><td>123</td></tr>'),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    // Missing Price (excl. tax)
    expect(() =>
      parseBookDetail(
        baseHtml(
          '<tr><th>UPC</th><td>123</td></tr><tr><th>Product Type</th><td>Books</td></tr>',
        ),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    // Missing Price (incl. tax)
    expect(() =>
      parseBookDetail(
        baseHtml(
          '<tr><th>UPC</th><td>123</td></tr><tr><th>Product Type</th><td>Books</td></tr><tr><th>Price (excl. tax)</th><td>£10.00</td></tr>',
        ),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    // Missing Tax
    expect(() =>
      parseBookDetail(
        baseHtml(
          '<tr><th>UPC</th><td>123</td></tr><tr><th>Product Type</th><td>Books</td></tr><tr><th>Price (excl. tax)</th><td>£10.00</td></tr><tr><th>Price (incl. tax)</th><td>£10.00</td></tr>',
        ),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    // Missing Number of reviews
    expect(() =>
      parseBookDetail(
        baseHtml(
          '<tr><th>UPC</th><td>123</td></tr><tr><th>Product Type</th><td>Books</td></tr><tr><th>Price (excl. tax)</th><td>£10.00</td></tr><tr><th>Price (incl. tax)</th><td>£10.00</td></tr><tr><th>Tax</th><td>£0.00</td></tr>',
        ),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);

    // Non-numeric reviews
    expect(() =>
      parseBookDetail(
        baseHtml(
          '<tr><th>UPC</th><td>123</td></tr><tr><th>Product Type</th><td>Books</td></tr><tr><th>Price (excl. tax)</th><td>£10.00</td></tr><tr><th>Price (incl. tax)</th><td>£10.00</td></tr><tr><th>Tax</th><td>£0.00</td></tr><tr><th>Number of reviews</th><td>not-a-number</td></tr>',
        ),
        'https://books.toscrape.com/catalogue/book_1/index.html',
      ),
    ).toThrow(ParseError);
  });
});
