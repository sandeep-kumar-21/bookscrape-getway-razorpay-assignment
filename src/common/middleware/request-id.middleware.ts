import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.headers['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
