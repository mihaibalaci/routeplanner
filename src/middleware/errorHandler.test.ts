import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    requestId: 'test-request-id',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return consistent error structure', () => {
    const err = new Error('Something went wrong');
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      status: 500,
      message: 'Something went wrong',
      requestId: 'test-request-id',
    });
  });

  it('should use custom status code if set on error', () => {
    const err = Object.assign(new Error('Not found'), { status: 404 });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      status: 404,
      message: 'Not found',
      requestId: 'test-request-id',
    });
  });

  it('should hide error message in production for 500 errors', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Database connection failed');
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      status: 500,
      message: 'Internal server error',
      requestId: 'test-request-id',
    });
  });

  it('should show error message in production for non-500 errors', () => {
    process.env.NODE_ENV = 'production';
    const err = Object.assign(new Error('Validation failed'), { status: 422 });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      status: 422,
      message: 'Validation failed',
      requestId: 'test-request-id',
    });
  });

  it('should log the error with request ID', () => {
    const err = new Error('Test error');
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = () => {};

    errorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Test error'),
      expect.objectContaining({ requestId: 'test-request-id' })
    );
  });
});
