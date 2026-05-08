import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth';

const TEST_SECRET = 'test-jwt-secret';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/v1/routes',
    headers: {},
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

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should skip authentication for /health', () => {
    const req = createMockReq({ path: '/health' });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should skip authentication for /api/v1/auth/register', () => {
    const req = createMockReq({ path: '/api/v1/auth/register' });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should skip authentication for /api/v1/auth/login', () => {
    const req = createMockReq({ path: '/api/v1/auth/login' });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should skip authentication for /api/v1/auth/google', () => {
    const req = createMockReq({ path: '/api/v1/auth/google' });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should skip authentication for /api/v1/auth/apple', () => {
    const req = createMockReq({ path: '/api/v1/auth/apple' });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should return 401 when no Authorization header is present', () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();
    const next: NextFunction = () => {};

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      status: 401,
      message: 'Authentication required',
      requestId: 'test-request-id',
    });
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    const req = createMockReq({
      headers: { authorization: 'Basic abc123' } as Record<string, string>,
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for an invalid token', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer invalid-token' } as Record<string, string>,
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      status: 401,
      message: 'Invalid token',
      requestId: 'test-request-id',
    });
  });

  it('should return 401 for an expired token', () => {
    const token = jwt.sign(
      { userId: 'user-1', email: 'test@test.com' },
      TEST_SECRET,
      { expiresIn: '-1h' }
    );
    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` } as Record<string, string>,
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      status: 401,
      message: 'Token expired',
      requestId: 'test-request-id',
    });
  });

  it('should attach userId to request for a valid token', () => {
    const token = jwt.sign(
      { userId: 'user-123', email: 'test@test.com' },
      TEST_SECRET,
      { expiresIn: '24h' }
    );
    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` } as Record<string, string>,
    });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    authMiddleware(req, res, next);

    expect(called).toBe(true);
    expect(req.userId).toBe('user-123');
  });
});
