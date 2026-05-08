import { Request, Response, NextFunction } from 'express';

/**
 * Consistent error response handler.
 * Catches all unhandled errors and returns a consistent JSON structure.
 * Does not expose stack traces in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = (err as Error & { status?: number }).status || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  // Log the error with request ID
  console.error(
    `[Error] ${req.method} ${req.path} - ${status} - ${err.message}`,
    {
      requestId: req.requestId,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    }
  );

  res.status(status).json({
    status,
    message,
    requestId: req.requestId,
  });
}
