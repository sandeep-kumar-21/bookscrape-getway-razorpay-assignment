import { describe, expect, it, vi } from 'vitest';
import { FetchTransport } from './fetch-transport.js';

describe('FetchTransport', () => {
  it('performs GET request, decodes UTF-8 body, and returns HttpResponse', async () => {
    const transport = new FetchTransport();
    const mockHtml = '<html><body><h1>Hello World Â£50</h1></body></html>';
    const encoder = new TextEncoder();
    const encoded = encoder.encode(mockHtml);

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: () => Promise.resolve(encoded.buffer),
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      const result = await transport.fetch(
        'https://books.toscrape.com/index.html',
        {
          headers: { 'User-Agent': 'test-agent' },
        },
      );

      expect(result.status).toBe(200);
      expect(result.statusText).toBe('OK');
      expect(result.bodyText).toBe(mockHtml);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://books.toscrape.com/index.html',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('respects timeoutMs when passed', async () => {
    const transport = new FetchTransport();

    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      const signal: AbortSignal = options.signal;
      return new Promise((_, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
        } else {
          signal.addEventListener('abort', () => reject(signal.reason));
        }
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      await expect(
        transport.fetch('https://books.toscrape.com/index.html', {
          timeoutMs: 20,
        }),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
