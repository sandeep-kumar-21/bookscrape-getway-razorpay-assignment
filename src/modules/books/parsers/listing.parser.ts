import * as cheerio from 'cheerio';
import type { BookSummary } from '../domain/book.types.js';
import { ParseError } from '../../../common/errors/app-error.js';
import { extractBookId, resolveUrl } from '../../../common/utils/url.util.js';
import {
  parseInStock,
  parsePrice,
  parseRating,
} from '../../../common/utils/parser.util.js';

export interface ParsedListingPage {
  readonly items: BookSummary[];
  readonly nextUrl: string | null;
  readonly totalResults: number | null;
}

/**
 * Parses a catalog or category listing page.
 * Pure function: accepts raw HTML and base pageUrl, returns typed items and pagination.
 */
export function parseListingPage(
  html: string,
  pageUrl: string,
): ParsedListingPage {
  if (!html || typeof html !== 'string') {
    throw new ParseError('html', 'Listing HTML is empty or invalid');
  }

  const $ = cheerio.load(html);

  const pods = $('article.product_pod');
  const resultsText = $('form.form-horizontal').text();

  // If there are no pods and no results indication, the page is broken/invalid
  if (pods.length === 0 && !resultsText.includes('results')) {
    throw new ParseError(
      'items',
      'No product pods or results found in listing page',
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

  // Parse items
  const items: BookSummary[] = [];

  pods.each((index, el) => {
    const pod = $(el);

    // Title & sourceUrl
    const linkEl = pod.find('h3 a');
    const href = linkEl.attr('href');
    if (!href) {
      throw new ParseError(
        'sourceUrl',
        `Product at index ${index} is missing link href`,
      );
    }

    const titleAttr = linkEl.attr('title');
    const titleText = linkEl.text().trim();
    const title =
      titleAttr && titleAttr.trim().length > 0 ? titleAttr.trim() : titleText;
    if (!title) {
      throw new ParseError(
        'title',
        `Product at index ${index} has empty title`,
      );
    }

    const sourceUrl = resolveUrl(href.trim(), pageUrl);
    const id = extractBookId(href);

    // Image URL
    const imgEl = pod.find('div.image_container img');
    const imgSrc = imgEl.attr('src');
    if (!imgSrc) {
      throw new ParseError('imageUrl', `Product '${id}' is missing image src`);
    }
    const imageUrl = resolveUrl(imgSrc.trim(), pageUrl);

    // Rating
    const ratingEl = pod.find('p.star-rating');
    const ratingClass = ratingEl.attr('class');
    if (!ratingClass) {
      throw new ParseError('rating', `Product '${id}' is missing rating class`);
    }
    const rating = parseRating(ratingClass);

    // Price
    const priceText = pod.find('p.price_color').text().trim();
    if (!priceText) {
      throw new ParseError('price', `Product '${id}' is missing price`);
    }
    const price = parsePrice(priceText);

    // In stock
    const availabilityText = pod.find('p.instock.availability').text().trim();
    const inStock = parseInStock(availabilityText);

    items.push({
      id,
      position: index + 1,
      title,
      price,
      currency: 'GBP',
      rating,
      inStock,
      category: null,
      imageUrl,
      sourceUrl,
    });
  });

  return {
    items,
    nextUrl,
    totalResults,
  };
}
