import { Request, Response, NextFunction } from 'express';
import { cacheIncrement, CACHE_KEYS, CACHE_TTL } from '../utils/redis';

const RATE_LIMIT_MAX = 100; // requests per minute

/**
 * Rate limiting middleware.
 * Limits authenticated users to 100 requests per minute using Redis INCR.
 * Skips rate limiting for unauthenticated requests (they'll be caught by auth middleware).
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip rate limiting for unauthenticated requests
  if (!req.userId) {
    next();
    return;
  }

  try {
    const key = CACHE_KEYS.rateLimit(req.userId);
    const currentCount = await cacheIncrement(key, CACHE_TTL.RATE_LIMIT);

    if (currentCount === null) {
      // Redis error — allow the request through rather than blocking
      next();
      return;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - currentCount));

    if (currentCount > RATE_LIMIT_MAX) {
      res.setHeader('Retry-After', CACHE_TTL.RATE_LIMIT);
      res.status(429).json({
        status: 429,
        message: 'Rate limit exceeded. Please try again later.',
        requestId: req.requestId,
      });
      return;
    }

    next();
  } catch {
    // On Redis failure, allow the request through
    next();
  }
}
