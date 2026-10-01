import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from './app-error.js';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorName = 'InternalServerError';
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let retryAfterSeconds: number | undefined;

    if (exception instanceof AppError) {
      statusCode = exception.statusCode;
      errorName = exception.error;
      code = exception.code;
      message = exception.message;
      retryAfterSeconds = exception.retryAfterSeconds;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      errorName = this.getStatusText(statusCode);
      code = this.getHttpCode(statusCode);

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join('; ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else {
          message = exception.message;
        }

        if (typeof resObj.code === 'string') {
          code = resObj.code;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error('Unhandled unknown exception', exception);
    }

    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', retryAfterSeconds.toString());
    }

    const path = request.originalUrl || request.url;

    if (statusCode >= 500) {
      this.logger.error(
        `[${statusCode}] ${request.method} ${path} - ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${statusCode}] ${request.method} ${path} - ${code}: ${message}`,
      );
    }

    const responseBody: ErrorResponseBody = {
      statusCode,
      error: errorName,
      code,
      message,
      path,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(responseBody);
  }

  private getStatusText(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BadRequest';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'NotFound';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TooManyRequests';
      case HttpStatus.BAD_GATEWAY:
        return 'BadGateway';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'ServiceUnavailable';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'GatewayTimeout';
      default:
        return 'InternalServerError';
    }
  }

  private getHttpCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.BAD_GATEWAY:
        return 'UPSTREAM_ERROR';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'UPSTREAM_TIMEOUT';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
