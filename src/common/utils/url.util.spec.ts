import { describe, expect, it } from 'vitest';
import { extractBookId, extractCategoryId, resolveUrl } from './url.util.js';
import { ParseError } from '../errors/app-error.js';

describe('url.util', () => {
  describe('resolveUrl', () => {
    it('resolves relative URLs against root base URL', () => {
      const base = 'https://books.toscrape.com/index.html';
      expect(
        resolveUrl('catalogue/a-light-in-the-attic_1000/index.html', base),
      ).toBe(
        'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
      );
    });

    it('resolves relative URLs against catalogue subpath', () => {
      const base = 'https://books.toscrape.com/catalogue/page-2.html';
      expect(resolveUrl('in-her-wake_980/index.html', base)).toBe(
        'https://books.toscrape.com/catalogue/in-her-wake_980/index.html',
      );
    });

    it('resolves parent directory traversal correctly', () => {
      const base =
        'https://books.toscrape.com/catalogue/category/books/mystery_3/index.html';
      expect(resolveUrl('../../../sharp-objects_997/index.html', base)).toBe(
        'https://books.toscrape.com/catalogue/sharp-objects_997/index.html',
      );
    });

    it('throws ParseError on malformed base URL', () => {
      expect(() => resolveUrl('page.html', 'not-a-valid-url')).toThrow(
        ParseError,
      );
    });
  });

  describe('extractBookId', () => {
    it('returns valid id when passed directly', () => {
      expect(extractBookId('a-light-in-the-attic_1000')).toBe(
        'a-light-in-the-attic_1000',
      );
    });

    it('extracts id from catalogue relative path', () => {
      expect(
        extractBookId('catalogue/a-light-in-the-attic_1000/index.html'),
      ).toBe('a-light-in-the-attic_1000');
    });

    it('extracts id from full URL', () => {
      expect(
        extractBookId(
          'https://books.toscrape.com/catalogue/sharp-objects_997/index.html',
        ),
      ).toBe('sharp-objects_997');
    });

    it('extracts id from relative path with parent traversals', () => {
      expect(extractBookId('../../../sharp-objects_997/index.html')).toBe(
        'sharp-objects_997',
      );
    });

    it('throws ParseError on invalid input', () => {
      expect(() => extractBookId('invalid-path-without-id')).toThrow(
        ParseError,
      );
    });
  });

  describe('extractCategoryId', () => {
    it('returns valid id when passed directly', () => {
      expect(extractCategoryId('mystery_3')).toBe('mystery_3');
    });

    it('extracts category id from relative path', () => {
      expect(
        extractCategoryId('catalogue/category/books/travel_2/index.html'),
      ).toBe('travel_2');
    });

    it('extracts category id from full URL', () => {
      expect(
        extractCategoryId(
          'https://books.toscrape.com/catalogue/category/books/historical-fiction_4/index.html',
        ),
      ).toBe('historical-fiction_4');
    });

    it('throws ParseError on invalid input', () => {
      expect(() => extractCategoryId('not-a-category')).toThrow(ParseError);
    });
  });
});
