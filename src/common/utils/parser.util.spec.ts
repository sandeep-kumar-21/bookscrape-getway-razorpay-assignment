import { describe, expect, it } from 'vitest';
import {
  parseInStock,
  parsePrice,
  parseRating,
  parseStockCount,
} from './parser.util.js';
import { ParseError } from '../errors/app-error.js';

describe('parser.util', () => {
  describe('parsePrice', () => {
    it('parses price with standard pound sign', () => {
      expect(parsePrice('£51.77')).toBe(51.77);
    });

    it('parses price with mangled UTF-8 pound sign Â£', () => {
      expect(parsePrice('Â£51.77')).toBe(51.77);
    });

    it('parses price with surrounded whitespace', () => {
      expect(parsePrice('  £10.00 \n')).toBe(10.0);
    });

    it('throws ParseError on empty or invalid text', () => {
      expect(() => parsePrice('')).toThrow(ParseError);
      expect(() => parsePrice('not a price')).toThrow(ParseError);
    });
  });

  describe('parseRating', () => {
    it('parses all rating classes', () => {
      expect(parseRating('star-rating One')).toBe(1);
      expect(parseRating('star-rating Two')).toBe(2);
      expect(parseRating('star-rating Three')).toBe(3);
      expect(parseRating('star-rating Four')).toBe(4);
      expect(parseRating('star-rating Five')).toBe(5);
    });

    it('parses single word rating case-insensitively', () => {
      expect(parseRating('three')).toBe(3);
      expect(parseRating('FOUR')).toBe(4);
    });

    it('throws ParseError on invalid rating', () => {
      expect(() => parseRating('')).toThrow(ParseError);
      expect(() => parseRating('star-rating Six')).toThrow(ParseError);
    });
  });

  describe('parseStockCount', () => {
    it('parses stock count from standard format', () => {
      expect(parseStockCount('In stock (22 available)')).toBe(22);
      expect(parseStockCount('In stock (1 available)')).toBe(1);
    });

    it('returns 0 for out of stock', () => {
      expect(parseStockCount('Out of stock')).toBe(0);
    });

    it('returns positive count for generic in stock message', () => {
      expect(parseStockCount('In stock')).toBe(1);
    });

    it('throws ParseError on invalid input', () => {
      expect(() => parseStockCount('')).toThrow(ParseError);
      expect(() => parseStockCount('Unknown status')).toThrow(ParseError);
    });
  });

  describe('parseInStock', () => {
    it('returns true when in stock with count > 0', () => {
      expect(parseInStock('In stock (22 available)')).toBe(true);
      expect(parseInStock('In stock')).toBe(true);
    });

    it('returns false when out of stock or 0 available', () => {
      expect(parseInStock('Out of stock')).toBe(false);
      expect(parseInStock('In stock (0 available)')).toBe(false);
      expect(parseInStock('')).toBe(false);
    });
  });
});
