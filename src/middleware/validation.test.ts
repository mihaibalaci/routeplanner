import { describe, it, expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { validationMiddleware } from './validation';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
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

describe('validationMiddleware', () => {
  it('should pass through clean input', () => {
    const req = createMockReq({
      body: { name: 'John', email: 'john@example.com' },
    });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    validationMiddleware(req, res, next);

    expect(called).toBe(true);
  });

  it('should strip HTML tags from body strings', () => {
    const req = createMockReq({
      body: { name: '<b>John</b>' },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(req.body.name).toBe('John');
  });

  it('should reject body with script tags (XSS)', () => {
    const req = createMockReq({
      body: { input: '<script>alert("xss")</script>' },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      status: 400,
      message: 'Request contains potentially dangerous content',
      requestId: 'test-request-id',
    });
  });

  it('should reject body with SQL injection patterns', () => {
    const req = createMockReq({
      body: { search: "'; DROP TABLE users;--" },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(res.statusCode).toBe(400);
  });

  it('should reject query params with javascript: protocol', () => {
    const req = createMockReq({
      query: { redirect: 'javascript:alert(1)' },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(res.statusCode).toBe(400);
  });

  it('should reject body with event handler attributes', () => {
    const req = createMockReq({
      body: { content: 'test onerror=alert(1)' },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(res.statusCode).toBe(400);
  });

  it('should handle nested objects', () => {
    const req = createMockReq({
      body: { user: { name: '<em>Test</em>', age: 25 } },
    });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    validationMiddleware(req, res, next);

    expect(called).toBe(true);
    expect(req.body.user.name).toBe('Test');
    expect(req.body.user.age).toBe(25);
  });

  it('should handle arrays in body', () => {
    const req = createMockReq({
      body: { tags: ['<b>tag1</b>', 'tag2'] },
    });
    const res = createMockRes();
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };

    validationMiddleware(req, res, next);

    expect(called).toBe(true);
    expect(req.body.tags).toEqual(['tag1', 'tag2']);
  });

  it('should trim whitespace from strings', () => {
    const req = createMockReq({
      body: { name: '  John  ' },
    });
    const res = createMockRes();
    const next: NextFunction = () => {};

    validationMiddleware(req, res, next);

    expect(req.body.name).toBe('John');
  });
});
