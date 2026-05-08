import { Router, Request, Response } from 'express';
import { createUser, validateEmail, validatePassword, validateDisplayName, findByEmail } from '../services/userService';
import { login } from '../services/authService';
import { handleGoogleLogin, handleAppleLogin } from '../services/ssoService';
import { toUserResponse } from '../models/user';
import { generateConfirmationToken, sendConfirmationEmail, confirmEmail, countRecentTokens, invalidateExistingTokens } from '../services/emailService';

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
        errors: missingFields.map(f => `${f} is required`),
        requestId: req.requestId,
      });
      return;
    }

    // Validate all fields and aggregate errors
    const emailValidation = validateEmail(email);
    const passwordValidation = validatePassword(password);
    const displayNameValidation = validateDisplayName(displayName);

    const allErrors: string[] = [
      ...emailValidation.errors,
      ...passwordValidation.errors,
      ...displayNameValidation.errors,
    ];

    if (allErrors.length > 0) {
      res.status(400).json({
        status: 400,
        message: 'Validation failed',
        errors: allErrors,
        requestId: req.requestId,
      });
      return;
    }

    const user = await createUser(email, password, displayName);

    // Generate confirmation token and send email
    try {
      const token = await generateConfirmationToken(user.id);
      await sendConfirmationEmail(email, token);
    } catch (emailErr) {
      // Don't fail registration if email sending fails — user can request resend
      console.warn('[Auth] Failed to send confirmation email:', (emailErr as Error).message);
    }

    res.status(201).json({
      status: 201,
      data: toUserResponse(user),
      message: 'Account created. Please check your email to confirm your account.',
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

    if (err.statusCode === 403) {
      res.status(403).json({
        status: 403,
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
 * POST /api/v1/auth/resend-confirmation
 * Resend a confirmation email to the user.
 *
 * Request body: { email: string }
 * Success: 200
 * Errors: 404 if user not found, 429 if rate limited
 */
router.post('/resend-confirmation', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        status: 400,
        message: 'Email is required',
        requestId: req.requestId,
      });
      return;
    }

    // Look up user by email
    const user = await findByEmail(email);
    if (!user) {
      res.status(404).json({
        status: 404,
        message: 'User not found',
        requestId: req.requestId,
      });
      return;
    }

    // Check rate limit: max 5 tokens created in the last hour
    const recentCount = await countRecentTokens(user.id);
    if (recentCount >= 5) {
      res.status(429).json({
        status: 429,
        message: 'Too many resend requests. Please try again later.',
        requestId: req.requestId,
      });
      return;
    }

    // Invalidate existing unused tokens
    await invalidateExistingTokens(user.id);

    // Generate new token and send confirmation email
    const token = await generateConfirmationToken(user.id);
    await sendConfirmationEmail(user.email, token);

    res.status(200).json({
      status: 200,
      message: 'Confirmation email sent.',
      requestId: req.requestId,
    });
  } catch (err: any) {
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

/**
 * GET /api/v1/auth/confirm/:token
 * Confirm a user's email address using the token sent via email.
 */
router.get('/confirm/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({
        status: 400,
        message: 'Invalid confirmation token',
        requestId: req.requestId,
      });
      return;
    }

    const result = await confirmEmail(token as string);

    if (!result.success) {
      const errorMessages: Record<string, string> = {
        malformed: 'Invalid confirmation token',
        expired: 'Confirmation token has expired',
        already_used: 'Confirmation token has already been used',
      };

      res.status(400).json({
        status: 400,
        message: errorMessages[result.reason!] || 'Invalid confirmation token',
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      message: 'Email confirmed successfully',
      requestId: req.requestId,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 500,
      message: 'Failed to confirm email',
      requestId: req.requestId,
    });
  }
});

export default router;
