import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('generates a new UUID if no x-request-id header is present', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    const setHeader = vi.fn();
    const res = {
      setHeader,
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    middleware.use(req, res, next);

    expect(req.id).toBeDefined();
    expect(req.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves existing incoming x-request-id header', () => {
    const customId = 'client-custom-req-12345';
    const req = {
      headers: {
        'x-request-id': customId,
      },
    } as unknown as Request;

    const setHeader = vi.fn();
    const res = {
      setHeader,
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    middleware.use(req, res, next);

    expect(req.id).toBe(customId);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', customId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
