import { Injectable } from '@nestjs/common';
import type {
  HttpRequestOptions,
  HttpResponse,
  HttpTransport,
} from './http-transport.interface.js';

@Injectable()
export class FetchTransport implements HttpTransport {
  async fetch(
    url: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    const headers = new Headers(options?.headers);

    let signal: AbortSignal | undefined = options?.signal;
    if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
      if (signal) {
        signal = AbortSignal.any([signal, timeoutSignal]);
      } else {
        signal = timeoutSignal;
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal,
    });

    const buffer = await response.arrayBuffer();
    const bodyText = new TextDecoder('utf-8').decode(buffer);

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      bodyText,
    };
  }
}
