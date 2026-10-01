import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import {
  NotFoundError,
  ValidationError,
  CatalogueNotReadyError,
  StoreUnavailableError,
  UpstreamError,
  UpstreamTimeoutError,
  ParseError,
} from './app-error.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;
  let hostMock: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();

    const mockResponse = {
      status: statusMock,
      setHeader: setHeaderMock,
    };
    const mockRequest = {
      url: '/api/v1/books/test_1',
      originalUrl: '/api/v1/books/test_1',
      method: 'GET',
    };

    hostMock = {
      switchToHttp: vi.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats NotFoundError correctly with 404 status and code', () => {
    filter.catch(
      new NotFoundError("Book 'test_1' not found", 'BOOK_NOT_FOUND'),
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'NotFound',
        code: 'BOOK_NOT_FOUND',
        message: "Book 'test_1' not found",
        path: '/api/v1/books/test_1',
      }),
    );
  });

  it('formats ValidationError correctly with 400 status', () => {
    filter.catch(new ValidationError('Invalid price range'), hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'BadRequest',
        code: 'VALIDATION_ERROR',
        message: 'Invalid price range',
      }),
    );
  });

  it('formats CatalogueNotReadyError with 503 and Retry-After header', () => {
    filter.catch(
      new CatalogueNotReadyError('Catalogue building', 15),
      hostMock,
    );

    expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', '15');
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        error: 'ServiceUnavailable',
        code: 'CATALOGUE_NOT_READY',
      }),
    );
  });

  it('formats StoreUnavailableError with 503 and Retry-After header', () => {
    filter.catch(new StoreUnavailableError(), hostMock);

    expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', '5');
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        code: 'STORE_UNAVAILABLE',
      }),
    );
  });

  it('formats UpstreamError with 502 BadGateway', () => {
    filter.catch(
      new UpstreamError('Failed to fetch from books.toscrape.com'),
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        error: 'BadGateway',
        code: 'UPSTREAM_FAILURE',
      }),
    );
  });

  it('formats UpstreamTimeoutError with 504 status', () => {
    filter.catch(new UpstreamTimeoutError(), hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 504,
        error: 'GatewayTimeout',
        code: 'UPSTREAM_TIMEOUT',
      }),
    );
  });

  it('formats ParseError with 502 BadGateway', () => {
    filter.catch(new ParseError('price'), hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        error: 'BadGateway',
        code: 'UPSTREAM_PARSE_ERROR',
      }),
    );
  });

  it('formats HttpException with array message (ValidationPipe)', () => {
    filter.catch(
      new HttpException(
        {
          message: ['title must not be empty', 'price must be positive'],
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      ),
      hostMock,
    );

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'title must not be empty; price must be positive',
      }),
    );
  });

  it('formats various HttpException statuses (401, 409, 429)', () => {
    const statuses = [
      { status: HttpStatus.UNAUTHORIZED, error: 'Unauthorized' },
      { status: HttpStatus.CONFLICT, error: 'Conflict' },
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'TooManyRequests',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    ];

    for (const item of statuses) {
      filter.catch(new HttpException('Custom error', item.status), hostMock);
      expect(statusMock).toHaveBeenCalledWith(item.status);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: item.status,
          error: item.error,
        }),
      );
    }
  });

  it('handles unexpected errors gracefully without leaking internals', () => {
    filter.catch(new Error('Sensitive database credentials leak!'), hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'InternalServerError',
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      }),
    );
  });

  it('handles non-Error unknown throwables', () => {
    filter.catch('string error literal', hostMock);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'InternalServerError',
      }),
    );
  });
});
