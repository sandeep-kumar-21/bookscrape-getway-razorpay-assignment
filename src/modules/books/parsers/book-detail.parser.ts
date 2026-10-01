import * as cheerio from 'cheerio';
import type { BookDetail } from '../domain/book.types.js';
import { ParseError } from '../../../common/errors/app-error.js';
import { extractBookId, resolveUrl } from '../../../common/utils/url.util.js';
import {
  parseInStock,
  parsePrice,
  parseRating,
  parseStockCount,
} from '../../../common/utils/parser.util.js';

/**
 * Parses a book detail page.
 * Pure function: accepts raw HTML, base pageUrl, and optional timestamp.
 */
export function parseBookDetail(
  html: string,
  pageUrl: string,
  scrapedAt = new Date().toISOString(),
): BookDetail {
  if (!html || typeof html !== 'string') {
    throw new ParseError('html', 'Book detail HTML is empty or invalid');
  }

  const $ = cheerio.load(html);

  const main = $('div.product_main');
  if (main.length === 0) {
    throw new ParseError('product', 'Product details container not found');
  }

  // ID from pageUrl
  const id = extractBookId(pageUrl);

  // Title
  const title = main.find('h1').text().trim();
  if (!title) {
    throw new ParseError('title', `Product '${id}' has missing or empty title`);
  }

  // Price
  const priceText = main.find('p.price_color').text().trim();
  if (!priceText) {
    throw new ParseError('price', `Product '${id}' has missing price`);
  }
  const price = parsePrice(priceText, 'price');

  // Rating
  const ratingClass = main.find('p.star-rating').attr('class');
  if (!ratingClass) {
    throw new ParseError('rating', `Product '${id}' has missing rating class`);
  }
  const rating = parseRating(ratingClass);

  // Availability / Stock
  const availabilityText = main.find('p.instock.availability').text().trim();
  if (!availabilityText) {
    throw new ParseError(
      'stockCount',
      `Product '${id}' has missing availability text`,
    );
  }
  const inStock = parseInStock(availabilityText);
  const stockCount = parseStockCount(availabilityText);

  // Category from breadcrumbs (Home > Books > [Category] > Title)
  let category: string | null = null;
  const breadcrumbLinks = $('ul.breadcrumb li a');
  if (breadcrumbLinks.length >= 3) {
    category = $(breadcrumbLinks[2]).text().trim();
  }

  // Image URL
  const imgSrc =
    $('#product_gallery img').attr('src') ??
    $('div.thumbnail img').attr('src') ??
    $('article.product_page img').first().attr('src');
  if (!imgSrc) {
    throw new ParseError('imageUrl', `Product '${id}' has missing image src`);
  }
  const imageUrl = resolveUrl(imgSrc.trim(), pageUrl);

  // Description (optional/nullable)
  let description: string | null = null;
  const descriptionHeader = $('#product_description');
  if (descriptionHeader.length > 0) {
    const descP = descriptionHeader.next('p');
    if (descP.length > 0) {
      const text = descP.text().trim();
      description = text.length > 0 ? text : null;
    }
  }

  // Table information
  const tableData = new Map<string, string>();
  $('table.table-striped tr').each((_, row) => {
    const th = $(row).find('th').text().trim();
    const td = $(row).find('td').text().trim();
    if (th) {
      tableData.set(th, td);
    }
  });

  const upc = tableData.get('UPC');
  if (!upc) {
    throw new ParseError(
      'upc',
      `Product '${id}' has missing UPC in product table`,
    );
  }

  const productType = tableData.get('Product Type');
  if (!productType) {
    throw new ParseError(
      'productType',
      `Product '${id}' has missing Product Type in product table`,
    );
  }

  const priceExclTaxText = tableData.get('Price (excl. tax)');
  if (!priceExclTaxText) {
    throw new ParseError(
      'priceExclTax',
      `Product '${id}' has missing Price (excl. tax) in table`,
    );
  }
  const priceExclTax = parsePrice(priceExclTaxText, 'priceExclTax');

  const priceInclTaxText = tableData.get('Price (incl. tax)');
  if (!priceInclTaxText) {
    throw new ParseError(
      'priceInclTax',
      `Product '${id}' has missing Price (incl. tax) in table`,
    );
  }
  const priceInclTax = parsePrice(priceInclTaxText, 'priceInclTax');

  const taxText = tableData.get('Tax');
  if (!taxText) {
    throw new ParseError('tax', `Product '${id}' has missing Tax in table`);
  }
  const tax = parsePrice(taxText, 'tax');

  const reviewsText = tableData.get('Number of reviews');
  if (!reviewsText) {
    throw new ParseError(
      'numberOfReviews',
      `Product '${id}' has missing Number of reviews in table`,
    );
  }
  const numberOfReviews = parseInt(reviewsText, 10);
  if (Number.isNaN(numberOfReviews)) {
    throw new ParseError(
      'numberOfReviews',
      `Product '${id}' has invalid Number of reviews: '${reviewsText}'`,
    );
  }

  return {
    id,
    position: 0,
    title,
    price,
    currency: 'GBP',
    rating,
    inStock,
    category,
    imageUrl,
    sourceUrl: pageUrl,
    description,
    stockCount,
    upc,
    productType,
    priceExclTax,
    priceInclTax,
    tax,
    numberOfReviews,
    scrapedAt,
  };
}
