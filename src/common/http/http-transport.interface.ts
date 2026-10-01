export const HTTP_TRANSPORT = Symbol('HTTP_TRANSPORT');

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly bodyText: string;
}

export interface HttpRequestOptions {
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface HttpTransport {
  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
