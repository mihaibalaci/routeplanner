import { Request, Response, NextFunction } from 'express';

/**
 * Patterns that indicate potential injection attacks.
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/i,
  /(--|;|\/\*|\*\/)/,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:\s*text\/html/i,
];

/**
 * Strip HTML tags from a string.
 */
function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/**
 * Check if a string contains potentially dangerous patterns.
 */
function containsDangerousPatterns(value: string): boolean {
  return (
    SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value)) ||
    XSS_PATTERNS.some((pattern) => pattern.test(value))
  );
}

/**
 * Recursively sanitize a value (string, object, or array).
 * Strips HTML tags from strings and flags dangerous patterns.
 */
function sanitizeValue(value: unknown): { sanitized: unknown; dangerous: boolean } {
  if (typeof value === 'string') {
    const dangerous = containsDangerousPatterns(value);
    const sanitized = stripHtmlTags(value).trim();
    return { sanitized, dangerous };
  }

  if (Array.isArray(value)) {
    let hasDangerous = false;
    const sanitized = value.map((item) => {
      const result = sanitizeValue(item);
      if (result.dangerous) hasDangerous = true;
      return result.sanitized;
    });
    return { sanitized, dangerous: hasDangerous };
  }

  if (value !== null && typeof value === 'object') {
    let hasDangerous = false;
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const result = sanitizeValue(val);
      if (result.dangerous) hasDangerous = true;
      sanitized[key] = result.sanitized;
    }
    return { sanitized, dangerous: hasDangerous };
  }

  return { sanitized: value, dangerous: false };
}

/**
 * Input validation and sanitization middleware.
 * Sanitizes request body, query params, and URL params.
 * Strips HTML tags and rejects requests with SQL injection or XSS patterns.
 */
export function validationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    const bodyResult = sanitizeValue(req.body);
    if (bodyResult.dangerous) {
      res.status(400).json({
        status: 400,
        message: 'Request contains potentially dangerous content',
        requestId: req.requestId,
      });
      return;
    }
    req.body = bodyResult.sanitized;
  }

  // Sanitize query params
  if (req.query && typeof req.query === 'object') {
    const queryResult = sanitizeValue(req.query);
    if (queryResult.dangerous) {
      res.status(400).json({
        status: 400,
        message: 'Request contains potentially dangerous content',
        requestId: req.requestId,
      });
      return;
    }
    req.query = queryResult.sanitized as typeof req.query;
  }

  // Sanitize URL params
  if (req.params && typeof req.params === 'object') {
    const paramsResult = sanitizeValue(req.params);
    if (paramsResult.dangerous) {
      res.status(400).json({
        status: 400,
        message: 'Request contains potentially dangerous content',
        requestId: req.requestId,
      });
      return;
    }
    req.params = paramsResult.sanitized as typeof req.params;
  }

  next();
}
