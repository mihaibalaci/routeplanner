import { Router, Request, Response } from 'express';
import { createUser } from '../services/userService';
import { login } from '../services/authService';
import { handleGoogleLogin, handleAppleLogin } from '../services/ssoService';
import { toUserResponse } from '../models/user';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user with email, password, and display name.
 *
 * Request body: { email: string, password: string, displayName: string }
 * Success: 201 with user info (no password_hash)
 * Errors: 400 for validation, 409 for duplicate email
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    // Check required fields
    const missingFields: string[] = [];
    if (!email) missingFields.push('email');
    if (!password) missingFields.push('password');
    if (!displayName) missingFields.push('displayName');

    if (missingFields.length > 0) {
      res.status(400).json({
        status: 400,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        requestId: req.requestId,
      });
      return;
    }

    const user = await createUser(email, password, displayName);

    res.status(201).json({
      status: 201,
      data: toUserResponse(user),
      requestId: req.requestId,
    });
  } catch (err: any) {
    if (err.statusCode === 400) {
      res.status(400).json({
        status: 400,
        message: err.message,
        errors: err.validationErrors || [err.message],
        requestId: req.requestId,
      });
      return;
    }

    if (err.statusCode === 409) {
      res.status(409).json({
        status: 409,
        message: err.message,
        requestId: req.requestId,
      });
      return;
    }

    // Unexpected error — let the error handler deal with it
    throw err;
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate a user with email and password.
 *
 * Request body: { email: string, password: string }
 * Success: 200 with { token, expiresIn: 86400 }
 * Errors: 401 for invalid credentials, 423 for locked account
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check required fields
    if (!email || !password) {
      res.status(400).json({
        status: 400,
        message: 'Email and password are required',
        requestId: req.requestId,
      });
      return;
    }

    const result = await login(email, password);

    res.status(200).json({
      status: 200,
      data: {
        token: result.token,
        expiresIn: result.expiresIn,
      },
      requestId: req.requestId,
    });
  } catch (err: any) {
    if (err.statusCode === 401) {
      res.status(401).json({
        status: 401,
        message: err.message,
        requestId: req.requestId,
      });
      return;
    }

    if (err.statusCode === 423) {
      res.status(423).json({
        status: 423,
        message: err.message,
        requestId: req.requestId,
      });
      return;
    }

    // Unexpected error — let the error handler deal with it
    throw err;
  }
});

/**
 * POST /api/v1/auth/google
 * Authenticate via Google SSO using a Google ID token.
 *
 * Request body: { idToken: string }
 * Success: 200 with { token, expiresIn: 86400, user: UserResponse }
 * Errors: 400 for missing idToken, 401 for invalid token
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({
        status: 400,
        message: 'Missing required field: idToken',
        requestId: req.requestId,
      });
      return;
    }

    const result = await handleGoogleLogin(idToken);

    res.status(200).json({
      status: 200,
      data: {
        token: result.token,
        expiresIn: result.expiresIn,
        user: result.user,
      },
      requestId: req.requestId,
    });
  } catch (err: any) {
    // Any error from token verification or missing config → 401
    res.status(401).json({
      status: 401,
      message: 'Invalid Google token',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/auth/apple
 * Authenticate via Apple SSO using an Apple authorization code.
 *
 * Request body: { authCode: string, userInfo?: { email?: string, name?: string } }
 * Success: 200 with { token, expiresIn: 86400, user: UserResponse }
 * Errors: 400 for missing authCode, 401 for invalid token
 */
router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { authCode, userInfo } = req.body;

    if (!authCode) {
      res.status(400).json({
        status: 400,
        message: 'Missing required field: authCode',
        requestId: req.requestId,
      });
      return;
    }

    const result = await handleAppleLogin(authCode, userInfo);

    res.status(200).json({
      status: 200,
      data: {
        token: result.token,
        expiresIn: result.expiresIn,
        user: result.user,
      },
      requestId: req.requestId,
    });
  } catch (err: any) {
    if (err.statusCode === 401) {
      res.status(401).json({
        status: 401,
        message: 'Invalid Apple token',
        requestId: req.requestId,
      });
      return;
    }

    // Unexpected error — let the error handler deal with it
    throw err;
  }
});

export default router;
