import * as cheerio from 'cheerio';
import { ParseError } from '../../../common/errors/app-error.js';
import { extractBookId, resolveUrl } from '../../../common/utils/url.util.js';

export interface ParsedCategoryPage {
  readonly bookIds: string[];
  readonly nextUrl: string | null;
  readonly totalResults: number | null;
}

/**
 * Parses a single category page, extracting book IDs and next pagination URL.
 */
export function parseCategoryPage(
  html: string,
  pageUrl: string,
): ParsedCategoryPage {
  if (!html || typeof html !== 'string') {
    throw new ParseError('html', 'Category page HTML is empty or invalid');
  }

  const $ = cheerio.load(html);

  const pods = $('article.product_pod');
  const resultsText = $('form.form-horizontal').text();

  // If there are no pods and no results indication, the page is broken/invalid
  if (pods.length === 0 && !resultsText.includes('results')) {
    throw new ParseError(
      'bookIds',
      'No category products or results found in page',
    );
  }

  // Parse total results count if present
  let totalResults: number | null = null;
  const resultsMatch = resultsText.match(/(\d+)\s+results/i);
  if (resultsMatch?.[1]) {
    totalResults = parseInt(resultsMatch[1], 10);
  }

  // Parse next URL
  let nextUrl: string | null = null;
  const nextHref = $('ul.pager li.next a, li.next a').attr('href');
  if (nextHref) {
    nextUrl = resolveUrl(nextHref.trim(), pageUrl);
  }

  // Extract book IDs in page order
  const bookIds: string[] = [];

  pods.each((index, el) => {
    const linkEl = $(el).find('h3 a');
    const href = linkEl.attr('href');
    if (!href) {
      throw new ParseError(
        'bookIds',
        `Book at index ${index} is missing link href`,
      );
    }

    const id = extractBookId(href);
    bookIds.push(id);
  });

  return {
    bookIds,
    nextUrl,
    totalResults,
  };
}
