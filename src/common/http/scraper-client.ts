import { Inject, Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { AppConfigService } from '../config/app-config.service.js';
import {
  NotFoundError,
  UpstreamError,
  UpstreamTimeoutError,
  ValidationError,
} from '../errors/app-error.js';
import {
  HTTP_TRANSPORT,
  type HttpTransport,
} from './http-transport.interface.js';

@Injectable()
export class ScraperClient {
  private readonly logger = new Logger(ScraperClient.name);
  private readonly limiter: ReturnType<typeof pLimit>;
  private readonly expectedHostname: string;
  private lastRequestTime = 0;

  constructor(
    @Inject(HTTP_TRANSPORT) private readonly transport: HttpTransport,
    private readonly config: AppConfigService,
  ) {
    this.limiter = pLimit(this.config.httpConcurrency);
    this.expectedHostname = new URL(
      this.config.sourceBaseUrl,
    ).hostname.toLowerCase();
  }

  /**
   * Fetches HTML from the upstream site with SSRF protection, concurrency limiting,
   * delay, and exponential backoff retry.
   */
  async getHtml(pathOrUrl: string): Promise<string> {
    const targetUrl = this.resolveAndValidateUrl(pathOrUrl);

    return this.limiter(async () => {
      await this.enforceDelay();
      return this.fetchWithRetry(targetUrl);
    });
  }

  private resolveAndValidateUrl(pathOrUrl: string): URL {
    let targetUrl: URL;
    try {
      targetUrl = new URL(pathOrUrl, this.config.sourceBaseUrl);
    } catch {
      throw new ValidationError(
        `Invalid URL or path provided: '${pathOrUrl}'`,
        'INVALID_URL',
      );
    }

    if (targetUrl.hostname.toLowerCase() !== this.expectedHostname) {
      throw new ValidationError(
        `Foreign host '${targetUrl.hostname}' is not permitted. Only '${this.expectedHostname}' is allowed.`,
        'SSRF_BLOCKED',
      );
    }

    return targetUrl;
  }

  private async enforceDelay(): Promise<void> {
    const delayMs = this.config.httpDelayMs;
    if (delayMs <= 0) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const waitTime = Math.max(0, delayMs - elapsed);

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  private async fetchWithRetry(url: URL): Promise<string> {
    const maxRetries = this.config.httpMaxRetries;
    const timeoutMs = this.config.httpTimeoutMs;
    const headers = {
      'User-Agent': this.config.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.transport.fetch(url.href, {
          headers,
          timeoutMs,
        });

        if (response.status === 200) {
          return response.bodyText;
        }

        if (response.status === 404) {
          throw new NotFoundError(
            `Resource not found at '${url.href}'`,
            'UPSTREAM_NOT_FOUND',
          );
        }

        // Other 4xx client errors should not be retried
        if (response.status >= 400 && response.status < 500) {
          throw new UpstreamError(
            `Upstream returned client error ${response.status} for '${url.href}'`,
          );
        }

        // 5xx server errors are retryable
        if (attempt < maxRetries) {
          this.logger.warn(
            `Upstream 5xx error (${response.status}) on attempt ${attempt + 1}/${maxRetries + 1} for ${url.href}. Retrying...`,
          );
          await this.backoff(attempt);
          continue;
        }

        throw new UpstreamError(
          `Upstream server returned ${response.status} for '${url.href}' after ${attempt + 1} attempts`,
        );
      } catch (err) {
        // Do not retry NotFoundError or client errors
        if (err instanceof NotFoundError || err instanceof ValidationError) {
          throw err;
        }
        if (
          err instanceof UpstreamError &&
          !err.message.includes('server returned 5')
        ) {
          // If it was a non-5xx UpstreamError, do not retry
          if (attempt >= maxRetries || !err.message.includes('attempts')) {
            throw err;
          }
        }

        lastError = err;

        const isTimeout =
          err instanceof Error &&
          (err.name === 'TimeoutError' ||
            err.name === 'AbortError' ||
            err.message.toLowerCase().includes('timeout'));

        if (attempt < maxRetries) {
          this.logger.warn(
            `Fetch failure (${err instanceof Error ? err.message : String(err)}) on attempt ${attempt + 1}/${maxRetries + 1} for ${url.href}. Retrying...`,
          );
          await this.backoff(attempt);
          continue;
        }

        if (isTimeout) {
          throw new UpstreamTimeoutError(
            `Upstream request to '${url.href}' timed out after ${timeoutMs}ms`,
            err,
          );
        }

        throw new UpstreamError(
          `Network failure requesting '${url.href}': ${err instanceof Error ? err.message : String(err)}`,
          'UPSTREAM_FAILURE',
          err,
        );
      }
    }

    throw new UpstreamError(
      `Exhausted retries for '${url.href}': ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      'UPSTREAM_FAILURE',
      lastError,
    );
  }

  private async backoff(attempt: number): Promise<void> {
    const base = 50 * Math.pow(2, attempt);
    const jitter = Math.random() * 25;
    const delay = Math.min(1000, base + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
