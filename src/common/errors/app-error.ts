export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly error: string;
  public abstract readonly code: string;
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options?: { cause?: unknown; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly error = 'NotFound';
  public readonly code: string;

  constructor(message: string, code = 'NOT_FOUND') {
    super(message);
    this.code = code;
  }
}

export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly error = 'BadRequest';
  public readonly code: string;

  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message);
    this.code = code;
  }
}

export class ParseError extends AppError {
  public readonly statusCode = 502;
  public readonly error = 'BadGateway';
  public readonly code = 'UPSTREAM_PARSE_ERROR';

  constructor(
    public readonly fieldName: string,
    message?: string,
  ) {
    super(
      message ?? `Failed to parse field '${fieldName}' from upstream response`,
    );
  }
}

export class UpstreamError extends AppError {
  public readonly statusCode = 502;
  public readonly error = 'BadGateway';
  public readonly code: string;

  constructor(message: string, code = 'UPSTREAM_FAILURE', cause?: unknown) {
    super(message, { cause });
    this.code = code;
  }
}

export class UpstreamTimeoutError extends AppError {
  public readonly statusCode = 504;
  public readonly error = 'GatewayTimeout';
  public readonly code = 'UPSTREAM_TIMEOUT';

  constructor(message = 'Upstream request timed out', cause?: unknown) {
    super(message, { cause });
  }
}

export class CatalogueNotReadyError extends AppError {
  public readonly statusCode = 503;
  public readonly error = 'ServiceUnavailable';
  public readonly code = 'CATALOGUE_NOT_READY';

  constructor(
    message = 'Catalogue is currently being built. Please retry in a few seconds.',
    retryAfterSeconds = 10,
  ) {
    super(message, { retryAfterSeconds });
  }
}

export class StoreUnavailableError extends AppError {
  public readonly statusCode = 503;
  public readonly error = 'ServiceUnavailable';
  public readonly code = 'STORE_UNAVAILABLE';

  constructor(
    message = 'Data store is temporarily unavailable.',
    retryAfterSeconds = 5,
    cause?: unknown,
  ) {
    super(message, { retryAfterSeconds, cause });
  }
}
