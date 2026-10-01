import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCategoryIndex } from '../../src/modules/categories/parsers/category-index.parser.js';
import { ParseError } from '../../src/common/errors/app-error.js';

const fixturesDir = resolve(__dirname, '../fixtures');

function loadFixture(filename: string): string {
  return readFileSync(resolve(fixturesDir, filename), 'utf-8');
}

describe('category-index.parser', () => {
  it('parses categories from homepage.html', () => {
    const html = loadFixture('homepage.html');
    const categories = parseCategoryIndex(
      html,
      'https://books.toscrape.com/index.html',
    );

    expect(categories).toHaveLength(50);

    // Verify top-level Books (books_1) is NOT in the list
    expect(categories.some((c) => c.id === 'books_1')).toBe(false);
    expect(categories.some((c) => c.name.toLowerCase() === 'books')).toBe(
      false,
    );

    // Verify first and last categories
    const first = categories[0]!;
    expect(first.id).toBe('travel_2');
    expect(first.name).toBe('Travel');
    expect(first.url).toBe(
      'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
    );
    expect(first.count).toBe(0);

    const second = categories[1]!;
    expect(second.id).toBe('mystery_3');
    expect(second.name).toBe('Mystery');

    const last = categories[49]!;
    expect(last.id).toBe('crime_51');
    expect(last.name).toBe('Crime');
    expect(last.url).toBe(
      'https://books.toscrape.com/catalogue/category/books/crime_51/index.html',
    );
  });

  it('parses categories from a category subpage resolving relative paths', () => {
    const html = loadFixture('category-mystery-page-1.html');
    const categories = parseCategoryIndex(
      html,
      'https://books.toscrape.com/catalogue/category/books/mystery_3/index.html',
    );

    expect(categories).toHaveLength(50);
    const travel = categories.find((c) => c.id === 'travel_2');
    expect(travel).toBeDefined();
    expect(travel?.url).toBe(
      'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
    );
  });

  it('throws ParseError on broken.html naming categories', () => {
    const html = loadFixture('broken.html');
    expect(() =>
      parseCategoryIndex(html, 'https://books.toscrape.com/broken.html'),
    ).toThrow(ParseError);

    try {
      parseCategoryIndex(html, 'https://books.toscrape.com/broken.html');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).fieldName).toBe('categories');
    }
  });

  it('throws ParseError when HTML is empty', () => {
    expect(() => parseCategoryIndex('', 'https://books.toscrape.com/')).toThrow(
      ParseError,
    );
  });

  it('throws ParseError when side categories has no category links', () => {
    const html =
      '<div class="side_categories"><ul class="nav-list"></ul></div>';
    expect(() =>
      parseCategoryIndex(html, 'https://books.toscrape.com/'),
    ).toThrow(ParseError);
  });

  it('throws ParseError when category link has no href', () => {
    const html = `
      <div class="side_categories">
        <ul class="nav-list"><li><ul><li><a>No Href</a></li></ul></li></ul>
      </div>
    `;
    expect(() =>
      parseCategoryIndex(html, 'https://books.toscrape.com/'),
    ).toThrow(ParseError);
  });

  it('throws ParseError when category link has empty name', () => {
    const html = `
      <div class="side_categories">
        <ul class="nav-list"><li><ul><li><a href="category/books/test_1/index.html">   </a></li></ul></li></ul>
      </div>
    `;
    expect(() =>
      parseCategoryIndex(html, 'https://books.toscrape.com/'),
    ).toThrow(ParseError);
  });

  it('filters out books_1 even if nested inside sub-list', () => {
    const html = `
      <div class="side_categories">
        <ul class="nav-list">
          <li>
            <ul>
              <li><a href="catalogue/category/books_1/index.html">Books</a></li>
              <li><a href="catalogue/category/books/travel_2/index.html">Travel</a></li>
            </ul>
          </li>
        </ul>
      </div>
    `;
    const result = parseCategoryIndex(html, 'https://books.toscrape.com/');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('travel_2');
  });
});
