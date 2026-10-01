import * as cheerio from 'cheerio';
import type { Category } from '../domain/category.types.js';
import { ParseError } from '../../../common/errors/app-error.js';
import {
  extractCategoryId,
  resolveUrl,
} from '../../../common/utils/url.util.js';

/**
 * Parses the sidebar categories from any page that includes the category navigation.
 * Excludes the top-level 'Books' parent category.
 */
export function parseCategoryIndex(html: string, pageUrl: string): Category[] {
  if (!html || typeof html !== 'string') {
    throw new ParseError('html', 'Category HTML is empty or invalid');
  }

  const $ = cheerio.load(html);

  const container = $('div.side_categories');
  if (container.length === 0) {
    throw new ParseError('categories', 'Side categories container not found');
  }

  // Select all category links under the nested <ul> list
  // Markup: .side_categories > ul.nav.nav-list > li > ul > li > a
  const categoryLinks = container.find('ul.nav-list > li > ul > li > a');

  if (categoryLinks.length === 0) {
    throw new ParseError('categories', 'No category links found in sidebar');
  }

  const categories: Category[] = [];

  categoryLinks.each((index, el) => {
    const link = $(el);
    const href = link.attr('href');
    if (!href) {
      throw new ParseError(
        'url',
        `Category at index ${index} has missing href`,
      );
    }

    const name = link.text().trim();
    if (!name) {
      throw new ParseError('name', `Category at index ${index} has empty name`);
    }

    const url = resolveUrl(href.trim(), pageUrl);
    const id = extractCategoryId(url);

    // Defense-in-depth: explicitly ensure top-level Books (books_1) is never included
    if (id === 'books_1' || name.toLowerCase() === 'books') {
      return;
    }

    categories.push({
      id,
      name,
      url,
      count: 0,
    });
  });

  return categories;
}
