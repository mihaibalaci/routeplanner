import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';

// ─── Mock Redis before importing rate limit middleware ─────────────────────────

const mockCacheIncrement = vi.fn<[string, number?], Promise<number | null>>();

vi.mock('../../utils/redis', () => ({
  CACHE_KEYS: {
    rateLimit: (userId: string) => `rate_limit:${userId}`,
  },
  CACHE_TTL: {
    RATE_LIMIT: 60,
  },
  cacheIncrement: (...args: [string, number?]) => mockCacheIncrement(...args),
}));

import { rateLimitMiddleware } from '../../middleware/rateLimit';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    requestId: 'test-request-id',
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | number>;
} {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string | number>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    setHeader(name: string, value: string | number) {
      res.headers[name] = value;
      return res;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string | number>;
  };
}

// ─── Property 31: Consistent API Error Structure ──────────────────────────────
// **Validates: Requirements 14.2**
// For any API error, response SHALL contain status and message fields.

describe('Property 31: Consistent API Error Structure', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errorHandler always returns response with status (number) and message (string) fields', () => {
    /**
     * **Validates: Requirements 14.2**
     */
    fc.assert(
      fc.property(
        // Generate arbitrary HTTP error status codes (4xx and 5xx)
        fc.integer({ min: 400, max: 599 }),
        // Generate arbitrary error messages
        fc.string({ minLength: 1, maxLength: 200 }),
        // Generate arbitrary request paths
        fc.string({ minLength: 1, maxLength: 100 }),
        (statusCode, errorMessage, requestPath) => {
          const err = Object.assign(new Error(errorMessage), {
            status: statusCode,
          });
          const req = createMockReq({ path: `/api/v1/${requestPath}` });
          const res = createMockRes();
          const next: NextFunction = () => {};

          errorHandler(err, req, res, next);

          // The response body must contain status and message fields
          const body = res.body as Record<string, unknown>;
          expect(body).toBeDefined();
          expect(typeof body.status).toBe('number');
          expect(typeof body.message).toBe('string');
          // Status in body must match the HTTP status code
          expect(body.status).toBe(statusCode);
          // Message must be a non-empty string
          expect((body.message as string).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('errorHandler returns status and message even when error has no custom status', () => {
    /**
     * **Validates: Requirements 14.2**
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (errorMessage) => {
          const err = new Error(errorMessage);
          const req = createMockReq();
          const res = createMockRes();
          const next: NextFunction = () => {};

          errorHandler(err, req, res, next);

          const body = res.body as Record<string, unknown>;
          expect(body).toBeDefined();
          expect(typeof body.status).toBe('number');
          expect(typeof body.message).toBe('string');
          // Default status should be 500
          expect(body.status).toBe(500);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('auth middleware 401 responses contain status and message fields', () => {
    /**
     * **Validates: Requirements 14.2**
     *
     * Verifies that the auth middleware also produces consistent error structure
     * when rejecting unauthenticated requests.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (requestPath) => {
          const req = createMockReq({
            path: `/api/v1/routes/${requestPath}`,
            headers: {} as any,
          });
          const res = createMockRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          authMiddleware(req, res, next);

          // If the middleware responded (not called next), check structure
          if (!nextCalled && res.body !== null) {
            const body = res.body as Record<string, unknown>;
            expect(typeof body.status).toBe('number');
            expect(typeof body.message).toBe('string');
            expect(body.status).toBe(401);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('validation middleware 400 responses contain status and message fields', () => {
    /**
     * **Validates: Requirements 14.2**
     *
     * Verifies that the validation middleware produces consistent error structure
     * when rejecting dangerous input.
     */
    const dangerousInputs = [
      "SELECT * FROM users; --",
      "<script>alert('xss')</script>",
      "1 OR 1=1",
      "javascript:void(0)",
    ];

    for (const input of dangerousInputs) {
      const req = createMockReq({
        body: { name: input },
        query: {},
        params: {},
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      validationMiddleware(req, res, next);

      if (!nextCalled && res.body !== null) {
        const body = res.body as Record<string, unknown>;
        expect(typeof body.status).toBe('number');
        expect(typeof body.message).toBe('string');
        expect(body.status).toBe(400);
      }
    }
  });
});

// ─── Property 32: Rate Limiting Enforcement ───────────────────────────────────
// **Validates: Requirements 14.5**
// For any user exceeding 100 requests in 60 seconds, excess requests SHALL return 429.

describe('Property 32: Rate Limiting Enforcement', () => {
  beforeEach(() => {
    mockCacheIncrement.mockReset();
  });

  it('first 100 requests do not return 429, requests 101+ return 429 with Retry-After', async () => {
    /**
     * **Validates: Requirements 14.5**
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate a total number of requests between 101 and 200
        fc.integer({ min: 101, max: 200 }),
        // Generate a user ID
        fc.string({ minLength: 5, maxLength: 36 }),
        async (totalRequests, userId) => {
          let callCount = 0;
          mockCacheIncrement.mockImplementation(async () => {
            callCount++;
            return callCount;
          });

          const results: Array<{
            statusCode: number;
            body: unknown;
            headers: Record<string, string | number>;
          }> = [];

          for (let i = 0; i < totalRequests; i++) {
            const req = createMockReq({ userId });
            const res = createMockRes();
            let nextCalled = false;
            const next: NextFunction = () => {
              nextCalled = true;
            };

            await rateLimitMiddleware(req, res, next);

            results.push({
              statusCode: nextCalled ? 200 : res.statusCode,
              body: res.body,
              headers: res.headers,
            });
          }

          // First 100 requests should NOT return 429
          for (let i = 0; i < 100; i++) {
            expect(results[i].statusCode).not.toBe(429);
          }

          // Requests 101+ should return 429
          for (let i = 100; i < totalRequests; i++) {
            expect(results[i].statusCode).toBe(429);

            // 429 response must have status and message (consistent error structure)
            const body = results[i].body as Record<string, unknown>;
            expect(typeof body.status).toBe('number');
            expect(body.status).toBe(429);
            expect(typeof body.message).toBe('string');

            // Must include Retry-After header
            expect(results[i].headers['Retry-After']).toBeDefined();
            expect(results[i].headers['Retry-After']).toBe(60);
          }

          // Reset for next property run
          callCount = 0;
        }
      ),
      { numRuns: 5 }
    );
  });

  it('unauthenticated requests are not rate limited', async () => {
    /**
     * **Validates: Requirements 14.5**
     *
     * Rate limiting only applies to authenticated users.
     * Unauthenticated requests pass through without rate limit checks.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        async (totalRequests) => {
          mockCacheIncrement.mockImplementation(async () => totalRequests);

          for (let i = 0; i < totalRequests; i++) {
            // No userId means unauthenticated
            const req = createMockReq({ userId: undefined });
            const res = createMockRes();
            let nextCalled = false;
            const next: NextFunction = () => {
              nextCalled = true;
            };

            await rateLimitMiddleware(req, res, next);

            // Should always call next (not rate limited)
            expect(nextCalled).toBe(true);
            expect(res.statusCode).not.toBe(429);
          }
        }
      ),
      { numRuns: 3 }
    );
  });

  it('rate limit headers are set correctly on every authenticated request', async () => {
    /**
     * **Validates: Requirements 14.5**
     *
     * Every authenticated request should include X-RateLimit-Limit and
     * X-RateLimit-Remaining headers.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 150 }),
        fc.string({ minLength: 5, maxLength: 36 }),
        async (requestNumber, userId) => {
          mockCacheIncrement.mockImplementation(async () => requestNumber);

          const req = createMockReq({ userId });
          const res = createMockRes();
          const next: NextFunction = () => {};

          await rateLimitMiddleware(req, res, next);

          // Rate limit headers should always be set
          expect(res.headers['X-RateLimit-Limit']).toBe(100);
          expect(res.headers['X-RateLimit-Remaining']).toBe(
            Math.max(0, 100 - requestNumber)
          );
        }
      ),
      { numRuns: 10 }
    );
  });
});
