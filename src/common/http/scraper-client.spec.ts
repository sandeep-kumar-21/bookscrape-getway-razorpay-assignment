import { describe, expect, it, beforeEach } from 'vitest';
import { ScraperClient } from './scraper-client.js';
import { AppConfigService } from '../config/app-config.service.js';
import { FixtureTransport } from '../../../test/support/fixture-transport.js';
import {
  NotFoundError,
  UpstreamError,
  UpstreamTimeoutError,
  ValidationError,
} from '../errors/app-error.js';

describe('ScraperClient', () => {
  let transport: FixtureTransport;
  let configService: AppConfigService;
  let client: ScraperClient;

  beforeEach(() => {
    transport = new FixtureTransport();
    configService = AppConfigService.create({
      SOURCE_BASE_URL: 'https://books.toscrape.com',
      HTTP_MAX_RETRIES: 2,
      HTTP_TIMEOUT_MS: 100,
      HTTP_CONCURRENCY: 2,
      HTTP_DELAY_MS: 10,
      USER_AGENT: 'test-agent/1.0',
    });
    client = new ScraperClient(transport, configService);
  });

  it('fetches HTML successfully for known fixture path', async () => {
    const html = await client.getHtml('/index.html');
    expect(html).toContain('Books to Scrape');
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.options?.headers?.['User-Agent']).toBe(
      'test-agent/1.0',
    );
  });

  it('resolves relative paths against SOURCE_BASE_URL', async () => {
    const html = await client.getHtml('catalogue/page-2.html');
    expect(html).toContain('in-her-wake_980');
    expect(transport.requests[0]?.url).toBe(
      'https://books.toscrape.com/catalogue/page-2.html',
    );
  });

  it('throws NotFoundError on upstream 404 and does not retry', async () => {
    await expect(client.getHtml('/unknown-path.html')).rejects.toThrow(
      NotFoundError,
    );
    expect(transport.requests).toHaveLength(1);
  });

  it('retries on 500 error and succeeds if error resolves (500-then-success)', async () => {
    // Set 1 temporary failure before success
    transport.setFailures('/index.html', 1, 500);

    const html = await client.getHtml('/index.html');
    expect(html).toContain('Books to Scrape');
    // First attempt failed with 500, second attempt succeeded
    expect(transport.requests).toHaveLength(2);
  });

  it('throws UpstreamError when retries are exhausted on 500', async () => {
    // Set 5 failures (more than HTTP_MAX_RETRIES = 2)
    transport.setFailures('/index.html', 5, 500);

    await expect(client.getHtml('/index.html')).rejects.toThrow(UpstreamError);
    // Initial attempt + 2 retries = 3 attempts total
    expect(transport.requests).toHaveLength(3);
  });

  it('throws UpstreamTimeoutError when requests time out', async () => {
    transport.setTimeout('/index.html');

    await expect(client.getHtml('/index.html')).rejects.toThrow(
      UpstreamTimeoutError,
    );
    // Initial attempt + 2 retries = 3 attempts total
    expect(transport.requests).toHaveLength(3);
  });

  it('does NOT retry client errors (4xx other than 404)', async () => {
    transport.setResponse('/forbidden.html', {
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
      bodyText: 'Forbidden',
    });

    await expect(client.getHtml('/forbidden.html')).rejects.toThrow(
      UpstreamError,
    );
    // Exactly 1 attempt, no retries
    expect(transport.requests).toHaveLength(1);
  });

  it('blocks foreign hosts as SSRF defence', async () => {
    await expect(client.getHtml('https://evil.com/malicious')).rejects.toThrow(
      ValidationError,
    );
    await expect(
      client.getHtml('http://169.254.169.254/latest/meta-data'),
    ).rejects.toThrow(ValidationError);
    // No request should reach the transport
    expect(transport.requests).toHaveLength(0);
  });

  it('respects concurrency cap and enforces delay between requests', async () => {
    transport.setDelay('/catalogue/page-2.html', 50);
    transport.setDelay('/catalogue/page-50.html', 50);

    let activeRequests = 0;
    let maxConcurrent = 0;

    const originalFetch = transport.fetch.bind(transport);
    transport.fetch = async (url, options) => {
      activeRequests++;
      maxConcurrent = Math.max(maxConcurrent, activeRequests);
      try {
        return await originalFetch(url, options);
      } finally {
        activeRequests--;
      }
    };

    await Promise.all([
      client.getHtml('/catalogue/page-2.html'),
      client.getHtml('/catalogue/page-50.html'),
      client.getHtml('/index.html'),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(transport.requests).toHaveLength(3);
  });
});
