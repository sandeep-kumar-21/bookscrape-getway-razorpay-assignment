import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCategoryPage } from '../../src/modules/categories/parsers/category-page.parser.js';
import { ParseError } from '../../src/common/errors/app-error.js';

const fixturesDir = resolve(__dirname, '../fixtures');

function loadFixture(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), 'utf-8');
}

describe('category-page.parser', () => {
  it('parses category-mystery-page-1.html correctly', () => {
    const html = loadFixture('category-mystery-page-1.html');
    const result = parseCategoryPage(
      html,
      'https://books.toscrape.com/catalogue/category/books/mystery_3/index.html',
    );

    expect(result.bookIds).toHaveLength(20);
    expect(result.totalResults).toBe(32);
    expect(result.nextUrl).toBe(
      'https://books.toscrape.com/catalogue/category/books/mystery_3/page-2.html',
    );
    expect(result.bookIds[0]).toBe('sharp-objects_997');
  });

  it('parses category-mystery-page-2.html correctly as last page', () => {
    const html = loadFixture('category-mystery-page-2.html');
    const result = parseCategoryPage(
      html,
      'https://books.toscrape.com/catalogue/category/books/mystery_3/page-2.html',
    );

    expect(result.bookIds).toHaveLength(12);
    expect(result.totalResults).toBe(32);
    expect(result.nextUrl).toBeNull();
  });

  it('handles empty category with 0 results', () => {
    const html = `
      <form class="form-horizontal">
        <strong>0</strong> results - showing <strong>0</strong> to <strong>0</strong>.
      </form>
      <section><ol class="row"></ol></section>
    `;
    const result = parseCategoryPage(
      html,
      'https://books.toscrape.com/catalogue/category/books/crime_51/index.html',
    );

    expect(result.bookIds).toEqual([]);
    expect(result.nextUrl).toBeNull();
    expect(result.totalResults).toBe(0);
  });

  it('throws ParseError on broken.html naming bookIds', () => {
    const html = loadFixture('broken.html');
    expect(() =>
      parseCategoryPage(html, 'https://books.toscrape.com/broken.html'),
    ).toThrow(ParseError);

    try {
      parseCategoryPage(html, 'https://books.toscrape.com/broken.html');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).fieldName).toBe('bookIds');
    }
  });

  it('throws ParseError when HTML is empty', () => {
    expect(() => parseCategoryPage('', 'https://books.toscrape.com/')).toThrow(
      ParseError,
    );
  });
});
