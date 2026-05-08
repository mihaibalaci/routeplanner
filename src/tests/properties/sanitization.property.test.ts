import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { validationMiddleware } from '../../middleware/validation';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
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
} {
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
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
  };
}

// ─── Generators ───────────────────────────────────────────────────────────────

const SQL_INJECTION_KEYWORDS = [
  'SELECT ',
  'INSERT ',
  'UPDATE ',
  'DELETE ',
  'DROP ',
  'UNION ',
  'ALTER ',
  'CREATE ',
  'EXEC ',
  'EXECUTE ',
];

const SQL_INJECTION_OPERATORS = ['--', ';', '/*', '*/'];

const SQL_BOOLEAN_PATTERNS = [
  'OR 1=1',
  'AND 1=1',
  'OR 2=2',
  'AND 3=3',
  'OR 99=99',
  'AND 42=42',
];

const XSS_PATTERNS = [
  '<script>',
  '<script ',
  'javascript:',
  'onclick=',
  'onload=',
  'onerror=',
  'onmouseover=',
  'data: text/html',
  'data:text/html',
];

/**
 * Generator for a prefix that ends with a non-word character (or is empty),
 * ensuring the SQL keyword starts at a word boundary.
 */
const wordBoundaryPrefixArb = fc.oneof(
  fc.constant(''),
  fc.constant(' '),
  fc.constant('test '),
  fc.constant('value: '),
  fc.constant('input='),
  fc.constant("' "),
  fc.constant('" ')
);

/**
 * Generator for strings containing SQL injection patterns.
 * Ensures SQL keywords appear at word boundaries to match the middleware regex.
 */
const sqlInjectionArb = fc.oneof(
  // SQL keywords at word boundary with surrounding text
  fc.tuple(
    wordBoundaryPrefixArb,
    fc.constantFrom(...SQL_INJECTION_KEYWORDS),
    fc.string({ minLength: 1, maxLength: 20 })
  ).map(([prefix, keyword, suffix]) => `${prefix}${keyword}${suffix}`),
  // SQL operators (no word boundary needed)
  fc.tuple(
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.constantFrom(...SQL_INJECTION_OPERATORS),
    fc.string({ minLength: 0, maxLength: 20 })
  ).map(([prefix, op, suffix]) => `${prefix}${op}${suffix}`),
  // Boolean-based injection at word boundary
  fc.tuple(
    wordBoundaryPrefixArb,
    fc.constantFrom(...SQL_BOOLEAN_PATTERNS),
    fc.string({ minLength: 0, maxLength: 20 })
  ).map(([prefix, pattern, suffix]) => `${prefix}${pattern} ${suffix}`)
);

/**
 * Generator for strings containing XSS patterns.
 */
const xssPatternArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.constantFrom(...XSS_PATTERNS),
  fc.string({ minLength: 0, maxLength: 20 })
).map(([prefix, pattern, suffix]) => `${prefix}${pattern}${suffix}`);

/**
 * Generator for safe strings: alphanumeric, spaces, and common punctuation
 * that do NOT contain dangerous patterns.
 */
const safeStringArb = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?@#$%&()-_+=[]{}:"\'\n\t'.split(
        ''
      )
    ),
    { minLength: 1, maxLength: 100 }
  )
  .filter((s) => {
    // Exclude strings that accidentally match dangerous patterns
    const sqlKeywords =
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/i;
    const sqlOps = /(--|;|\/\*|\*\/)/;
    const sqlBool = /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i;
    const xssScript = /<script[\s>]/i;
    const xssJs = /javascript:/i;
    const xssEvent = /on\w+\s*=/i;
    const xssData = /data:\s*text\/html/i;
    return (
      !sqlKeywords.test(s) &&
      !sqlOps.test(s) &&
      !sqlBool.test(s) &&
      !xssScript.test(s) &&
      !xssJs.test(s) &&
      !xssEvent.test(s) &&
      !xssData.test(s) &&
      // Also exclude strings with < > that form HTML tags
      !/<[^>]*>/.test(s)
    );
  });

// ─── Property 30: Input Sanitization ─────────────────────────────────────────
// **Validates: Requirements 13.4**
// Inputs with SQL injection or XSS patterns SHALL be sanitized or rejected.

describe('Property 30: Input Sanitization', () => {
  it('SQL injection patterns in request body SHALL be rejected with 400', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(sqlInjectionArb, (dangerousInput) => {
        const req = createMockReq({
          body: { name: dangerousInput },
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        // Middleware should reject the request
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body.status).toBe(400);
        expect(body.message).toBe(
          'Request contains potentially dangerous content'
        );
      }),
      { numRuns: 15 }
    );
  });

  it('XSS patterns in request body SHALL be rejected with 400', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(xssPatternArb, (dangerousInput) => {
        const req = createMockReq({
          body: { content: dangerousInput },
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(400);
        const body = res.body as Record<string, unknown>;
        expect(body.status).toBe(400);
        expect(body.message).toBe(
          'Request contains potentially dangerous content'
        );
      }),
      { numRuns: 15 }
    );
  });

  it('SQL injection patterns in query params SHALL be rejected with 400', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(sqlInjectionArb, (dangerousInput) => {
        const req = createMockReq({
          body: {},
          query: { search: dangerousInput } as any,
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(400);
      }),
      { numRuns: 10 }
    );
  });

  it('XSS patterns in URL params SHALL be rejected with 400', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(xssPatternArb, (dangerousInput) => {
        const req = createMockReq({
          body: {},
          query: {},
          params: { id: dangerousInput },
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(400);
      }),
      { numRuns: 10 }
    );
  });

  it('safe strings SHALL pass through the middleware (next is called)', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(safeStringArb, (safeInput) => {
        const req = createMockReq({
          body: { name: safeInput, description: safeInput },
          query: {},
          params: {},
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        // Safe input should pass through
        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBe(0); // No status set means no rejection
      }),
      { numRuns: 15 }
    );
  });

  it('HTML tags in safe inputs SHALL be stripped (no < or > from tags remain)', () => {
    /**
     * **Validates: Requirements 13.4**
     *
     * When input contains HTML tags that are NOT dangerous patterns (e.g., <b>, <p>, <div>),
     * the middleware strips the tags but allows the request through.
     */
    // Generate safe HTML tags that won't trigger XSS detection
    const safeHtmlTagArb = fc.tuple(
      fc.constantFrom('b', 'i', 'p', 'div', 'span', 'em', 'strong', 'h1', 'h2', 'ul', 'li'),
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
        // Ensure content doesn't accidentally contain dangerous patterns
        const sqlKeywords =
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/i;
        const sqlOps = /(--|;|\/\*|\*\/)/;
        const sqlBool = /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i;
        const xssJs = /javascript:/i;
        const xssEvent = /on\w+\s*=/i;
        const xssData = /data:\s*text\/html/i;
        return (
          !sqlKeywords.test(s) &&
          !sqlOps.test(s) &&
          !sqlBool.test(s) &&
          !xssJs.test(s) &&
          !xssEvent.test(s) &&
          !xssData.test(s) &&
          !/<script/i.test(s)
        );
      })
    ).map(([tag, content]) => `<${tag}>${content}</${tag}>`);

    fc.assert(
      fc.property(safeHtmlTagArb, (htmlInput) => {
        const req = createMockReq({
          body: { content: htmlInput },
          query: {},
          params: {},
        });
        const res = createMockRes();
        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        validationMiddleware(req, res, next);

        // Should pass through (safe HTML tags are stripped, not rejected)
        expect(nextCalled).toBe(true);

        // The sanitized body should not contain HTML tag markers
        const sanitizedContent = (req.body as Record<string, string>).content;
        expect(sanitizedContent).not.toMatch(/<[^>]*>/);
      }),
      { numRuns: 15 }
    );
  });

  it('nested dangerous patterns in objects SHALL be detected and rejected', () => {
    /**
     * **Validates: Requirements 13.4**
     *
     * Verifies that the middleware recursively checks nested objects and arrays.
     */
    fc.assert(
      fc.property(
        fc.oneof(sqlInjectionArb, xssPatternArb),
        fc.string({ minLength: 1, maxLength: 20 }),
        (dangerousInput, key) => {
          const safeKey = key.replace(/[^a-zA-Z]/g, 'x') || 'field';
          const req = createMockReq({
            body: {
              nested: {
                [safeKey]: dangerousInput,
              },
            },
          });
          const res = createMockRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          validationMiddleware(req, res, next);

          expect(nextCalled).toBe(false);
          expect(res.statusCode).toBe(400);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('dangerous patterns in arrays SHALL be detected and rejected', () => {
    /**
     * **Validates: Requirements 13.4**
     */
    fc.assert(
      fc.property(
        fc.oneof(sqlInjectionArb, xssPatternArb),
        (dangerousInput) => {
          const req = createMockReq({
            body: {
              items: ['safe value', dangerousInput, 'another safe value'],
            },
          });
          const res = createMockRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          validationMiddleware(req, res, next);

          expect(nextCalled).toBe(false);
          expect(res.statusCode).toBe(400);
        }
      ),
      { numRuns: 10 }
    );
  });
});
