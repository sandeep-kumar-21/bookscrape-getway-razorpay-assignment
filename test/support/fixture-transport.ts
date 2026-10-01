import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from '../../src/common/http/http-transport.interface.js';

export interface RecordedRequest {
  readonly url: string;
  readonly options?: HttpRequestOptions;
  readonly timestamp: number;
}

const DEFAULT_ROUTE_MAP: Record<string, string> = {
  '/': 'homepage.html',
  '/index.html': 'homepage.html',
  '/catalogue/page-2.html': 'page-2.html',
  '/catalogue/page-50.html': 'page-50.html',
  '/catalogue/category/books/mystery_3/index.html':
    'category-mystery-page-1.html',
  '/catalogue/category/books/mystery_3/page-2.html':
    'category-mystery-page-2.html',
  '/catalogue/a-light-in-the-attic_1000/index.html':
    'detail-a-light-in-the-attic.html',
  '/catalogue/tipping-the-velvet_999/index.html':
    'detail-tipping-the-velvet.html',
  '/catalogue/sapiens-a-brief-history-of-humankind_996/index.html':
    'detail-sapiens.html',
  '/catalogue/the-bridge-to-consciousness-im-writing-the-bridge-between-science-and-our-old-and-new-beliefs_840/index.html':
    'detail-no-description.html',
  '/broken.html': 'broken.html',
};

export class FixtureTransport implements HttpTransport {
  readonly requests: RecordedRequest[] = [];

  private readonly fixturesDir: string;
  private readonly customResponses = new Map<string, HttpResponse>();
  private readonly failuresRemaining = new Map<
    string,
    { count: number; status: number }
  >();
  private readonly timeouts = new Set<string>();
  private readonly delays = new Map<string, number>();
  private readonly routeMap: Map<string, string>;

  constructor(fixturesDir?: string) {
    this.fixturesDir = fixturesDir ?? resolve(__dirname, '../fixtures');
    this.routeMap = new Map(Object.entries(DEFAULT_ROUTE_MAP));
  }

  private normalizeKey(urlOrPath: string): string {
    try {
      const parsed = new URL(urlOrPath, 'https://books.toscrape.com');
      return parsed.pathname;
    } catch {
      return urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
    }
  }

  setFixture(pathOrUrl: string, fixtureFilename: string): void {
    this.routeMap.set(this.normalizeKey(pathOrUrl), fixtureFilename);
  }

  setResponse(pathOrUrl: string, response: HttpResponse): void {
    this.customResponses.set(this.normalizeKey(pathOrUrl), response);
  }

  setFailures(pathOrUrl: string, count: number, status = 500): void {
    this.failuresRemaining.set(this.normalizeKey(pathOrUrl), { count, status });
  }

  setTimeout(pathOrUrl: string): void {
    this.timeouts.add(this.normalizeKey(pathOrUrl));
  }

  clearTimeout(pathOrUrl: string): void {
    this.timeouts.delete(this.normalizeKey(pathOrUrl));
  }

  setDelay(pathOrUrl: string, delayMs: number): void {
    this.delays.set(this.normalizeKey(pathOrUrl), delayMs);
  }

  reset(): void {
    this.requests.length = 0;
    this.customResponses.clear();
    this.failuresRemaining.clear();
    this.timeouts.clear();
    this.delays.clear();
    this.routeMap.clear();
    for (const [k, v] of Object.entries(DEFAULT_ROUTE_MAP)) {
      this.routeMap.set(k, v);
    }
  }

  async fetch(
    url: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    this.requests.push({
      url,
      options,
      timestamp: Date.now(),
    });

    const key = this.normalizeKey(url);

    // Apply simulated delay if configured
    const delay = this.delays.get(key);
    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Check for simulated timeout
    if (this.timeouts.has(key)) {
      const err = new Error(`Simulated timeout requesting '${url}'`);
      err.name = 'TimeoutError';
      throw err;
    }

    // Check for temporary failures (e.g. 500-then-success)
    const failureConfig = this.failuresRemaining.get(key);
    if (failureConfig && failureConfig.count > 0) {
      failureConfig.count -= 1;
      return {
        status: failureConfig.status,
        statusText:
          failureConfig.status >= 500 ? 'Internal Server Error' : 'Error',
        headers: new Headers(),
        bodyText: `<html><body><h1>${failureConfig.status} Error</h1></body></html>`,
      };
    }

    // Check for explicit custom response
    const custom = this.customResponses.get(key);
    if (custom) {
      return custom;
    }

    // Check mapped fixtures
    const fixtureFilename = this.routeMap.get(key);
    if (fixtureFilename) {
      try {
        const filePath = resolve(this.fixturesDir, fixtureFilename);
        const bodyText = readFileSync(filePath, 'utf-8');
        return {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
          bodyText,
        };
      } catch (err) {
        return {
          status: 500,
          statusText: 'Internal Error Reading Fixture',
          headers: new Headers(),
          bodyText: `Could not read fixture: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Default 404 for unmapped paths
    return {
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      bodyText: '<html><body><h1>404 Not Found</h1></body></html>',
    };
  }
}
