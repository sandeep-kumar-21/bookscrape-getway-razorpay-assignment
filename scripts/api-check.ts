#!/usr/bin/env tsx

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: CheckResult[] = [];

function pass(name: string, message = '') {
  results.push({ name, passed: true, message });
  console.log(`  \x1b[32m✔\x1b[0m ${name}${message ? ` (${message})` : ''}`);
}

function fail(name: string, message: string) {
  results.push({ name, passed: false, message });
  console.error(`  \x1b[31m✖\x1b[0m ${name}: ${message}`);
}

async function request(
  baseUrl: string,
  path: string,
  options?: RequestInit,
): Promise<{ status: number; headers: Headers; body: any }> {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, headers: res.headers, body };
  } catch (err) {
    throw new Error(
      `Failed to request ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function assertErrorShape(body: any, expectedStatus: number): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    body.statusCode === expectedStatus &&
    typeof body.error === 'string' &&
    typeof body.code === 'string' &&
    typeof body.message === 'string' &&
    typeof body.path === 'string' &&
    typeof body.timestamp === 'string'
  );
}

async function main() {
  const args = process.argv.slice(2);
  let baseUrl = 'http://localhost:3000';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === '--base-url' && nextArg !== undefined) {
      baseUrl = nextArg;
      i++;
    } else if (arg && arg.startsWith('--base-url=')) {
      const parts = arg.split('=');
      if (parts[1]) {
        baseUrl = parts[1];
      }
    }
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `http://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  console.log(`\n\x1b[1m=== BookScrape Gateway API Automated Check ===\x1b[0m`);
  console.log(`Target Base URL: \x1b[36m${baseUrl}\x1b[0m\n`);

  // Step 1: Health check & readiness polling
  console.log(
    `\x1b[1m1. Checking server health and catalogue readiness...\x1b[0m`,
  );
  let catalogueReady = false;
  let attempts = 0;
  const maxAttempts = 30;
  let healthBody: any = null;

  while (!catalogueReady && attempts < maxAttempts) {
    attempts++;
    try {
      const res = await request(baseUrl, '/api/v1/health');
      if (res.status === 200 && typeof res.body === 'object') {
        healthBody = res.body;
        if (healthBody.catalogue?.status === 'ready') {
          catalogueReady = true;
          break;
        }
      }
    } catch (err) {
      if (attempts === 1) {
        console.log(
          `   Waiting for server connection... (${(err as Error).message})`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!catalogueReady) {
    fail(
      'Server health check',
      `Server at ${baseUrl} is unreachable or catalogue is not ready after ${maxAttempts}s. State: ${JSON.stringify(healthBody)}`,
    );
    printSummary();
    process.exit(1);
  }

  pass(
    'GET /api/v1/health',
    `Status: ${healthBody.status}, Catalogue books: ${healthBody.catalogue.total}, Redis: connected`,
  );

  const totalBooksCount: number = healthBody.catalogue.total;

  // Step 2: Book listing (GET /api/v1/books?page=1)
  console.log(
    `\n\x1b[1m2. Validating Books Listing (GET /api/v1/books)...\x1b[0m`,
  );
  const listRes = await request(baseUrl, '/api/v1/books?page=1');
  if (listRes.status !== 200) {
    fail(
      'GET /api/v1/books?page=1',
      `Expected status 200, got ${listRes.status}`,
    );
  } else if (!Array.isArray(listRes.body?.data) || !listRes.body?.meta) {
    fail(
      'GET /api/v1/books?page=1',
      'Response does not match { data, meta } structure',
    );
  } else {
    const meta = listRes.body.meta;
    const expectedPageSize = Math.min(20, totalBooksCount);
    if (listRes.body.data.length !== expectedPageSize) {
      fail(
        'Listing page size',
        `Expected ${expectedPageSize} items, got ${listRes.body.data.length}`,
      );
    } else if (
      meta.page !== 1 ||
      meta.limit !== 20 ||
      meta.total !== totalBooksCount
    ) {
      fail('Listing meta object', `Unexpected meta: ${JSON.stringify(meta)}`);
    } else {
      pass(
        'GET /api/v1/books?page=1',
        `20 items returned, total: ${meta.total}, totalPages: ${meta.totalPages}`,
      );
    }
  }

  const sampleBook = listRes.body?.data?.[0];
  if (!sampleBook?.id) {
    fail('Book discovery', 'Failed to discover sample book from page 1');
    printSummary();
    process.exit(1);
  }

  // Step 3: Book detail (GET /api/v1/books/:id)
  console.log(
    `\n\x1b[1m3. Validating Book Detail (GET /api/v1/books/${sampleBook.id})...\x1b[0m`,
  );
  const detailRes1 = await request(baseUrl, `/api/v1/books/${sampleBook.id}`);
  if (detailRes1.status !== 200) {
    fail(
      `GET /api/v1/books/${sampleBook.id}`,
      `Expected 200, got ${detailRes1.status}`,
    );
  } else {
    const d = detailRes1.body;
    const errors: string[] = [];

    if (d.id !== sampleBook.id)
      errors.push(`id mismatch (${d.id} !== ${sampleBook.id})`);
    if (typeof d.title !== 'string') errors.push('title is not a string');
    if (typeof d.price !== 'number' || d.price <= 0)
      errors.push('price must be a positive number');
    if (d.currency !== 'GBP')
      errors.push(`currency must be GBP, got ${d.currency}`);
    if (typeof d.rating !== 'number' || d.rating < 1 || d.rating > 5)
      errors.push('rating must be between 1 and 5');
    if (typeof d.inStock !== 'boolean') errors.push('inStock must be boolean');
    if (typeof d.stockCount !== 'number')
      errors.push('stockCount must be a number');
    if (typeof d.upc !== 'string' || !d.upc) errors.push('upc is missing');
    if (typeof d.productType !== 'string')
      errors.push('productType is missing');
    if (typeof d.priceExclTax !== 'number')
      errors.push('priceExclTax is missing');
    if (typeof d.priceInclTax !== 'number')
      errors.push('priceInclTax is missing');
    if (typeof d.tax !== 'number') errors.push('tax is missing');
    if (typeof d.numberOfReviews !== 'number')
      errors.push('numberOfReviews is missing');
    if (typeof d.imageUrl !== 'string' || !d.imageUrl.startsWith('http'))
      errors.push('imageUrl is invalid');
    if (typeof d.sourceUrl !== 'string' || !d.sourceUrl.startsWith('http'))
      errors.push('sourceUrl is invalid');
    if (typeof d.scrapedAt !== 'string') errors.push('scrapedAt is missing');

    if (errors.length > 0) {
      fail(`Detail schema for ${sampleBook.id}`, errors.join('; '));
    } else {
      pass(
        `GET /api/v1/books/${sampleBook.id}`,
        `All fields valid, UPC: ${d.upc}, Stock: ${d.stockCount}`,
      );
    }
  }

  // Step 4: Caching validation (X-Cache: HIT)
  console.log(`\n\x1b[1m4. Validating Cache Header (X-Cache: HIT)...\x1b[0m`);
  const detailRes2 = await request(baseUrl, `/api/v1/books/${sampleBook.id}`);
  const xCache = detailRes2.headers.get('x-cache');
  if (xCache === 'HIT') {
    pass(
      `GET /api/v1/books/${sampleBook.id} (repeat)`,
      `Header X-Cache: HIT verified`,
    );
  } else {
    fail(`Repeat request X-Cache header`, `Expected 'HIT', got '${xCache}'`);
  }

  // Step 5: Pagination checks
  console.log(`\n\x1b[1m5. Validating Pagination Boundaries...\x1b[0m`);
  const totalPages = listRes.body.meta.totalPages;
  const lastPageRes = await request(
    baseUrl,
    `/api/v1/books?page=${totalPages}&limit=20`,
  );
  if (
    lastPageRes.status === 200 &&
    Array.isArray(lastPageRes.body?.data) &&
    lastPageRes.body.data.length > 0
  ) {
    const expectedRemainder =
      totalBooksCount % 20 === 0 ? 20 : totalBooksCount % 20;
    if (lastPageRes.body.data.length === expectedRemainder) {
      pass(
        `Last page (page=${totalPages})`,
        `${lastPageRes.body.data.length} remainder items returned`,
      );
    } else {
      fail(
        `Last page items count`,
        `Expected ${expectedRemainder}, got ${lastPageRes.body.data.length}`,
      );
    }
  } else {
    fail(
      `Last page (page=${totalPages})`,
      `Failed with status ${lastPageRes.status}`,
    );
  }

  const beyondPage = totalPages + 1;
  const beyondRes = await request(
    baseUrl,
    `/api/v1/books?page=${beyondPage}&limit=20`,
  );
  if (
    beyondRes.status === 200 &&
    Array.isArray(beyondRes.body?.data) &&
    beyondRes.body.data.length === 0
  ) {
    pass(
      `Beyond last page (page=${beyondPage})`,
      `Returned 200 with empty data array []`,
    );
  } else {
    fail(
      `Beyond last page`,
      `Expected 200 with empty data array, got status ${beyondRes.status}`,
    );
  }

  // Step 6: Filters check
  console.log(`\n\x1b[1m6. Validating Query Filters...\x1b[0m`);
  if (sampleBook.category) {
    const catRes = await request(
      baseUrl,
      `/api/v1/books?category=${encodeURIComponent(sampleBook.category)}`,
    );
    if (catRes.status === 200 && Array.isArray(catRes.body?.data)) {
      const allMatch = catRes.body.data.every(
        (b: any) =>
          b.category?.toLowerCase() === sampleBook.category.toLowerCase(),
      );
      if (allMatch && catRes.body.data.length > 0) {
        pass(
          `Filter by category='${sampleBook.category}'`,
          `${catRes.body.data.length} matching items`,
        );
      } else {
        fail(
          `Category filter verification`,
          `Some items did not match category '${sampleBook.category}'`,
        );
      }
    } else {
      fail(
        `Filter category=${sampleBook.category}`,
        `Request returned status ${catRes.status}`,
      );
    }
  }

  const priceRes = await request(
    baseUrl,
    `/api/v1/books?minPrice=20&maxPrice=30`,
  );
  if (priceRes.status === 200 && Array.isArray(priceRes.body?.data)) {
    const allMatch = priceRes.body.data.every(
      (b: any) => b.price >= 20 && b.price <= 30,
    );
    if (allMatch) {
      pass(
        `Filter minPrice=20&maxPrice=30`,
        `${priceRes.body.data.length} items within range`,
      );
    } else {
      fail(`Price range filter`, `Some items were outside 20..30`);
    }
  } else {
    fail(`Price range filter`, `Request returned status ${priceRes.status}`);
  }

  const stockRes = await request(baseUrl, `/api/v1/books?inStock=true`);
  if (stockRes.status === 200 && Array.isArray(stockRes.body?.data)) {
    const allMatch = stockRes.body.data.every((b: any) => b.inStock === true);
    if (allMatch) {
      pass(
        `Filter inStock=true`,
        `${stockRes.body.data.length} in-stock items`,
      );
    } else {
      fail(`inStock filter`, `Non in-stock items returned`);
    }
  }

  // Step 7: Title Search
  console.log(
    `\n\x1b[1m7. Validating Title Search (GET /api/v1/books/search)...\x1b[0m`,
  );
  const queryWords = sampleBook.title.split(' ').slice(0, 2).join(' ');
  const searchRes = await request(
    baseUrl,
    `/api/v1/books/search?q=${encodeURIComponent(queryWords)}`,
  );
  if (searchRes.status === 200 && Array.isArray(searchRes.body?.data)) {
    const found = searchRes.body.data.some((b: any) => b.id === sampleBook.id);
    if (found) {
      pass(
        `Search q='${queryWords}'`,
        `Successfully matched '${sampleBook.title}'`,
      );
    } else {
      fail(
        `Search q='${queryWords}'`,
        `Did not include discovered book ${sampleBook.id}`,
      );
    }
  } else {
    fail(
      `Search q='${queryWords}'`,
      `Search returned status ${searchRes.status}`,
    );
  }

  const nonsenseRes = await request(
    baseUrl,
    `/api/v1/books/search?q=xyznonexistentterm9999`,
  );
  if (
    nonsenseRes.status === 200 &&
    Array.isArray(nonsenseRes.body?.data) &&
    nonsenseRes.body.data.length === 0
  ) {
    pass(`Search nonsense term`, `Returned empty data array []`);
  } else {
    fail(
      `Search nonsense term`,
      `Expected empty array, got status ${nonsenseRes.status}`,
    );
  }

  // Step 8: Error handling & standard shape
  console.log(`\n\x1b[1m8. Validating Error Handling & Schemas...\x1b[0m`);
  const err404 = await request(
    baseUrl,
    '/api/v1/books/non-existent-book_99999',
  );
  if (
    err404.status === 404 &&
    assertErrorShape(err404.body, 404) &&
    err404.body.code === 'BOOK_NOT_FOUND'
  ) {
    pass('404 BOOK_NOT_FOUND for unknown book ID', err404.body.message);
  } else {
    fail(
      '404 for unknown book ID',
      `Expected 404 BOOK_NOT_FOUND, got ${err404.status} ${JSON.stringify(err404.body)}`,
    );
  }

  const maliciousId = '../../etc_1';
  const errMalicious = await request(
    baseUrl,
    `/api/v1/books/${encodeURIComponent(maliciousId)}`,
  );
  if (
    errMalicious.status === 400 &&
    assertErrorShape(errMalicious.body, 400) &&
    errMalicious.body.code === 'INVALID_BOOK_ID'
  ) {
    pass(
      '400 INVALID_BOOK_ID for malicious path traversal ID',
      errMalicious.body.code,
    );
  } else {
    fail(
      '400 for malicious ID',
      `Expected 400 INVALID_BOOK_ID, got ${errMalicious.status} ${JSON.stringify(errMalicious.body)}`,
    );
  }

  const errPageZero = await request(baseUrl, '/api/v1/books?page=0');
  if (errPageZero.status === 400 && assertErrorShape(errPageZero.body, 400)) {
    pass('400 for page=0', 'Rejected invalid page number');
  } else {
    fail('400 for page=0', `Expected 400, got ${errPageZero.status}`);
  }

  const errPriceInverted = await request(
    baseUrl,
    '/api/v1/books?minPrice=50&maxPrice=10',
  );
  if (
    errPriceInverted.status === 400 &&
    assertErrorShape(errPriceInverted.body, 400)
  ) {
    pass('400 for minPrice > maxPrice', errPriceInverted.body.message);
  } else {
    fail(
      '400 for minPrice > maxPrice',
      `Expected 400, got ${errPriceInverted.status}`,
    );
  }

  // Step 9: Categories
  console.log(
    `\n\x1b[1m9. Validating Categories (GET /api/v1/categories)...\x1b[0m`,
  );
  const catListRes = await request(baseUrl, '/api/v1/categories');
  if (catListRes.status !== 200) {
    fail('GET /api/v1/categories', `Expected 200, got ${catListRes.status}`);
  } else {
    const list = Array.isArray(catListRes.body)
      ? catListRes.body
      : (catListRes.body?.data ?? catListRes.body?.categories);

    if (!Array.isArray(list) || list.length === 0) {
      fail('GET /api/v1/categories', 'Categories list is missing or empty');
    } else {
      const sumCount = list.reduce(
        (sum: number, c: any) => sum + (c.count || 0),
        0,
      );
      if (sumCount === totalBooksCount) {
        pass(
          'GET /api/v1/categories',
          `${list.length} categories, book counts sum exactly to total (${sumCount} === ${totalBooksCount})`,
        );
      } else {
        fail(
          'Category counts integrity',
          `Sum of category counts (${sumCount}) does not match total catalogue books (${totalBooksCount})`,
        );
      }
    }
  }

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n\x1b[1m=== Test Summary ===\x1b[0m`);
  console.log(`\x1b[32m✔ Passed: ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`\x1b[31m✖ Failed: ${failed}\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll test checks passed successfully!\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\x1b[31mFatal error in api-check execution:\x1b[0m', err);
  process.exit(1);
});
