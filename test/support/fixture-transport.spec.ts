import { describe, expect, it } from 'vitest';
import { FixtureTransport } from './fixture-transport.js';

describe('FixtureTransport', () => {
  it('serves known fixtures with 200 OK', async () => {
    const transport = new FixtureTransport();
    const res = await transport.fetch('https://books.toscrape.com/index.html');

    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
    expect(res.bodyText).toContain('Books to Scrape');
    expect(transport.requests).toHaveLength(1);
  });

  it('serves 404 for unmapped paths', async () => {
    const transport = new FixtureTransport();
    const res = await transport.fetch(
      'https://books.toscrape.com/unknown.html',
    );

    expect(res.status).toBe(404);
    expect(res.statusText).toBe('Not Found');
    expect(res.bodyText).toContain('404');
  });

  it('supports custom responses and temporary failures', async () => {
    const transport = new FixtureTransport();
    transport.setFailures('/index.html', 1, 503);

    const first = await transport.fetch(
      'https://books.toscrape.com/index.html',
    );
    expect(first.status).toBe(503);

    const second = await transport.fetch(
      'https://books.toscrape.com/index.html',
    );
    expect(second.status).toBe(200);
  });

  it('supports simulated timeouts and reset', async () => {
    const transport = new FixtureTransport();
    transport.setTimeout('/index.html');

    await expect(
      transport.fetch('https://books.toscrape.com/index.html'),
    ).rejects.toThrow('Simulated timeout');

    transport.reset();
    const res = await transport.fetch('https://books.toscrape.com/index.html');
    expect(res.status).toBe(200);
    expect(transport.requests).toHaveLength(1); // Reset cleared previous requests
  });
});
