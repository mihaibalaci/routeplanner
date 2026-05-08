import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/** Paths that do not require authentication */
const PUBLIC_PATHS = [
  '/auth/register',
  '/auth/login',
  '/auth/google',
  '/auth/apple',
  '/health',
];

interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header.
 * Skips authentication for public paths.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if the path is public (strip /api/v1 prefix for matching)
  const path = req.path.replace(/^\/api\/v1/, '');

  // Skip auth for non-API paths (frontend static files, SPA routes)
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 401,
      message: 'Authentication required',
      requestId: req.requestId,
    });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({
      status: 500,
      message: 'Server configuration error',
      requestId: req.requestId,
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token expired'
        : 'Invalid token';

    res.status(401).json({
      status: 401,
      message,
      requestId: req.requestId,
    });
  }
}
