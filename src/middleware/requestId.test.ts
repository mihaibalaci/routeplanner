import { describe, it, expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from './requestId';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return { ...overrides } as unknown as Request;
}

function createMockRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe('requestIdMiddleware', () => {
  it('should attach a UUID requestId to the request', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should set X-Request-ID response header', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    requestIdMiddleware(req, res, next);

    expect(res.headers['X-Request-ID']).toBe(req.requestId);
  });

  it('should call next()', () => {
    const req = createMockReq();
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    requestIdMiddleware(req, res, next);

    expect(called).toBe(true);
  });
});
