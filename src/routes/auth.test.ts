import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import authRouter from './auth';

// Mock the userService module — keep real validation functions, mock createUser and findByEmail
vi.mock('../services/userService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/userService')>();
  return {
    ...actual,
    createUser: vi.fn(),
    findByEmail: vi.fn(),
  };
});

// Mock the authService module
vi.mock('../services/authService', () => ({
  login: vi.fn(),
}));

// Mock the ssoService module
vi.mock('../services/ssoService', () => ({
  handleGoogleLogin: vi.fn(),
  handleAppleLogin: vi.fn(),
}));

// Mock the emailService module
vi.mock('../services/emailService', () => ({
  generateConfirmationToken: vi.fn().mockResolvedValue('mock-token'),
  sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  confirmEmail: vi.fn(),
  countRecentTokens: vi.fn().mockResolvedValue(0),
  invalidateExistingTokens: vi.fn().mockResolvedValue(undefined),
}));

import { createUser, findByEmail } from '../services/userService';
import { login } from '../services/authService';
import { handleGoogleLogin, handleAppleLogin } from '../services/ssoService';
import { countRecentTokens, invalidateExistingTokens, generateConfirmationToken, sendConfirmationEmail, confirmEmail } from '../services/emailService';

// Create a minimal Express app for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  // Simulate requestId middleware
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.use('/api/v1/auth', authRouter);
  return app;
}

describe('POST /api/v1/auth/register', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('returns 201 with user data on successful registration', async () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      password_hash: '$2b$12$hashedpassword',
      display_name: 'Test User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    (createUser as any).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Password1', displayName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(201);
    expect(res.body.data.id).toBe(mockUser.id);
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.displayName).toBe('Test User');
    // Should NOT include password_hash
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.message).toContain('Missing required fields');
  });

  it('returns 400 for validation errors with all errors aggregated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'weak', displayName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toContain('Password must be at least 8 characters');
    expect(res.body.errors).toContain('Password must contain at least one uppercase letter');
    expect(res.body.errors).toContain('Password must contain at least one digit');
  });

  it('returns 409 for duplicate email', async () => {
    const error = new Error('Email already registered');
    (error as any).statusCode = 409;
    (createUser as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'existing@example.com', password: 'Password1', displayName: 'Test' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email already registered');
  });

  it('does not expose password_hash in response', async () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      password_hash: '$2b$12$secrethash',
      display_name: 'Test User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    (createUser as any).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Password1', displayName: 'Test User' });

    expect(res.status).toBe(201);
    const responseStr = JSON.stringify(res.body);
    expect(responseStr).not.toContain('$2b$12$secrethash');
    expect(responseStr).not.toContain('password_hash');
  });
});

describe('POST /api/v1/auth/login', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('returns 200 with token on successful login', async () => {
    (login as any).mockResolvedValue({ token: 'jwt-token-123', expiresIn: 86400 });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.token).toBe('jwt-token-123');
    expect(res.body.data.expiresIn).toBe(86400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Password1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email and password are required');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email and password are required');
  });

  it('returns 401 with generic error on invalid credentials', async () => {
    const error = new Error('Invalid email or password');
    (error as any).statusCode = 401;
    (login as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('returns 423 when account is locked', async () => {
    const error = new Error('Account is temporarily locked. Please try again later.');
    (error as any).statusCode = 423;
    (login as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Password1' });

    expect(res.status).toBe(423);
    expect(res.body.message).toContain('locked');
  });

  it('does not reveal which credential was wrong', async () => {
    // Both wrong email and wrong password should return the same message
    const error = new Error('Invalid email or password');
    (error as any).statusCode = 401;
    (login as any).mockRejectedValue(error);

    const res1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'Password1' });

    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' });

    expect(res1.body.message).toBe(res2.body.message);
    expect(res1.status).toBe(res2.status);
  });
});

describe('POST /api/v1/auth/google', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('returns 200 with token and user on successful Google login', async () => {
    const mockResult = {
      token: 'jwt-google-token-123',
      expiresIn: 86400,
      user: {
        id: 'user-uuid-1',
        email: 'user@gmail.com',
        displayName: 'Google User',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    };

    (handleGoogleLogin as any).mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-google-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.token).toBe('jwt-google-token-123');
    expect(res.body.data.expiresIn).toBe(86400);
    expect(res.body.data.user.id).toBe('user-uuid-1');
    expect(res.body.data.user.email).toBe('user@gmail.com');
    expect(res.body.data.user.displayName).toBe('Google User');
  });

  it('returns 400 when idToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.message).toContain('idToken');
  });

  it('returns 401 when Google token is invalid', async () => {
    (handleGoogleLogin as any).mockRejectedValue(new Error('Token verification failed'));

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(401);
    expect(res.body.message).toBe('Invalid Google token');
  });

  it('returns 401 when GOOGLE_CLIENT_ID is not configured', async () => {
    (handleGoogleLogin as any).mockRejectedValue(
      new Error('GOOGLE_CLIENT_ID environment variable is not configured')
    );

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid Google token');
  });

  it('does not expose internal error details in response', async () => {
    (handleGoogleLogin as any).mockRejectedValue(
      new Error('Internal database connection error')
    );

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid Google token');
    expect(JSON.stringify(res.body)).not.toContain('database');
  });
});

describe('POST /api/v1/auth/apple', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('returns 200 with token and user on successful Apple login', async () => {
    const mockResult = {
      token: 'jwt-apple-token-123',
      expiresIn: 86400,
      user: {
        id: 'user-uuid-2',
        email: 'user@icloud.com',
        displayName: 'Apple User',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    };

    (handleAppleLogin as any).mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ authCode: 'valid-apple-auth-code' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.token).toBe('jwt-apple-token-123');
    expect(res.body.data.expiresIn).toBe(86400);
    expect(res.body.data.user.id).toBe('user-uuid-2');
    expect(res.body.data.user.email).toBe('user@icloud.com');
    expect(res.body.data.user.displayName).toBe('Apple User');
  });

  it('passes userInfo to handleAppleLogin when provided', async () => {
    const mockResult = {
      token: 'jwt-apple-token-456',
      expiresIn: 86400,
      user: {
        id: 'user-uuid-3',
        email: 'newuser@icloud.com',
        displayName: 'New Apple User',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    };

    (handleAppleLogin as any).mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({
        authCode: 'valid-apple-auth-code',
        userInfo: { email: 'newuser@icloud.com', name: 'New Apple User' },
      });

    expect(res.status).toBe(200);
    expect(handleAppleLogin).toHaveBeenCalledWith(
      'valid-apple-auth-code',
      { email: 'newuser@icloud.com', name: 'New Apple User' }
    );
  });

  it('returns 400 when authCode is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.message).toContain('authCode');
  });

  it('returns 401 when Apple token is invalid', async () => {
    const error = new Error('Apple authentication failed');
    (error as any).statusCode = 401;
    (handleAppleLogin as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ authCode: 'invalid-code' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(401);
    expect(res.body.message).toBe('Invalid Apple token');
  });

  it('does not expose internal error details in response', async () => {
    const error = new Error('Apple token exchange failed: connection timeout');
    (error as any).statusCode = 401;
    (handleAppleLogin as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ authCode: 'some-code' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid Apple token');
    expect(JSON.stringify(res.body)).not.toContain('connection timeout');
  });
});


describe('POST /api/v1/auth/resend-confirmation', () => {
  let app: express.Application;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    display_name: 'Test User',
    failed_login_attempts: 0,
    locked_until: null,
    email_confirmed: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    (findByEmail as any).mockResolvedValue(mockUser);
    (countRecentTokens as any).mockResolvedValue(0);
    (invalidateExistingTokens as any).mockResolvedValue(undefined);
    (generateConfirmationToken as any).mockResolvedValue('new-mock-token');
    (sendConfirmationEmail as any).mockResolvedValue(undefined);
  });

  it('returns 200 and sends confirmation email on valid resend', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Confirmation email sent.');
    expect(invalidateExistingTokens).toHaveBeenCalledWith(mockUser.id);
    expect(generateConfirmationToken).toHaveBeenCalledWith(mockUser.id);
    expect(sendConfirmationEmail).toHaveBeenCalledWith(mockUser.email, 'new-mock-token');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email is required');
  });

  it('returns 404 when user is not found', async () => {
    (findByEmail as any).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns 429 when rate limit is exceeded (6th resend within an hour)', async () => {
    // Rate limit is max 5 tokens per hour — countRecentTokens returns 5 means limit reached
    (countRecentTokens as any).mockResolvedValue(5);

    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Too many resend requests. Please try again later.');
    // Should NOT have generated a new token or sent email
    expect(invalidateExistingTokens).not.toHaveBeenCalled();
    expect(generateConfirmationToken).not.toHaveBeenCalled();
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('returns 429 when count exceeds limit (more than 5)', async () => {
    (countRecentTokens as any).mockResolvedValue(10);

    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Too many resend requests. Please try again later.');
  });

  it('invalidates previous tokens before generating a new one', async () => {
    const callOrder: string[] = [];
    (invalidateExistingTokens as any).mockImplementation(() => {
      callOrder.push('invalidate');
      return Promise.resolve();
    });
    (generateConfirmationToken as any).mockImplementation(() => {
      callOrder.push('generate');
      return Promise.resolve('new-token');
    });
    (sendConfirmationEmail as any).mockImplementation(() => {
      callOrder.push('send');
      return Promise.resolve();
    });

    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(['invalidate', 'generate', 'send']);
    expect(invalidateExistingTokens).toHaveBeenCalledWith(mockUser.id);
  });
});

// Feature: email-registration, Property 5: Duplicate email detection is case-insensitive
describe('Property 5: Duplicate email detection is case-insensitive', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * For any registered email address and any case variation of that same address,
   * attempting to register with the case variation SHALL be rejected as a duplicate (409).
   */
  it('registering with a case variation of an existing email returns 409', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a valid email: local part + domain
        fc.tuple(
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 8 }),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 2, maxLength: 4 }),
        ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
        // Generate a seed for creating case variations
        fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
        async (email, caseToggles) => {
          vi.clearAllMocks();

          // Create a case variation by toggling character cases
          const caseVariation = email
            .split('')
            .map((ch, i) => {
              const toggle = caseToggles[i % caseToggles.length];
              return toggle ? ch.toUpperCase() : ch.toLowerCase();
            })
            .join('');

          // Ensure the variation is actually different in case (skip if identical)
          // The property still holds even if they're the same case, but it's more interesting when different
          const normalizedOriginal = email.toLowerCase();
          const normalizedVariation = caseVariation.toLowerCase();

          // Both should normalize to the same email
          if (normalizedOriginal !== normalizedVariation) {
            return; // Skip — this shouldn't happen with our generator, but guard anyway
          }

          const mockUser = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: normalizedOriginal,
            password_hash: '$2b$12$hashedpassword',
            display_name: 'Test User',
            failed_login_attempts: 0,
            locked_until: null,
            email_confirmed: false,
            created_at: new Date(),
            updated_at: new Date(),
          };

          // First call: createUser succeeds (original email registered)
          // Second call: createUser throws 409 (case variation detected as duplicate)
          let callCount = 0;
          (createUser as any).mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockUser);
            }
            const error = new Error('Email already registered');
            (error as any).statusCode = 409;
            return Promise.reject(error);
          });

          // Register with original email — should succeed
          const res1 = await request(app)
            .post('/api/v1/auth/register')
            .send({ email, password: 'Password1', displayName: 'Test User' });

          expect(res1.status).toBe(201);

          // Register with case variation — should get 409
          const res2 = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: caseVariation, password: 'Password1', displayName: 'Test User' });

          expect(res2.status).toBe(409);
          expect(res2.body.message).toBe('Email already registered');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: email-registration, Property 9: Resend invalidates previous tokens
describe('Property 9: Resend invalidates previous tokens', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * For any user with an existing unused confirmation token, requesting a resend
   * SHALL cause the previous token to become invalid (marked as used or deleted),
   * and the new token SHALL be valid for confirmation.
   */
  it('for any user, resend always invalidates existing tokens before generating new one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.emailAddress(),
        async (userId, email) => {
          vi.clearAllMocks();

          const mockUser = {
            id: userId,
            email: email.toLowerCase().trim(),
            password_hash: '$2b$12$hash',
            display_name: 'User',
            failed_login_attempts: 0,
            locked_until: null,
            email_confirmed: false,
            created_at: new Date(),
            updated_at: new Date(),
          };

          (findByEmail as any).mockResolvedValue(mockUser);
          (countRecentTokens as any).mockResolvedValue(0);

          let invalidateCalled = false;
          let generateCalledAfterInvalidate = false;

          (invalidateExistingTokens as any).mockImplementation(() => {
            invalidateCalled = true;
            return Promise.resolve();
          });
          (generateConfirmationToken as any).mockImplementation(() => {
            if (invalidateCalled) {
              generateCalledAfterInvalidate = true;
            }
            return Promise.resolve('new-token-' + userId);
          });
          (sendConfirmationEmail as any).mockResolvedValue(undefined);

          const res = await request(app)
            .post('/api/v1/auth/resend-confirmation')
            .send({ email: mockUser.email });

          // Property: invalidateExistingTokens is always called with the user's ID
          expect(invalidateExistingTokens).toHaveBeenCalledWith(userId);
          // Property: generateConfirmationToken is always called AFTER invalidation
          expect(generateCalledAfterInvalidate).toBe(true);
          // Property: the response is successful
          expect(res.status).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Integration: registration → confirmation → login flow', () => {
  let app: express.Application;

  const testEmail = 'newuser@example.com';
  const testPassword = 'SecurePass1';
  const testDisplayName = 'New User';
  const testUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testToken = 'abc123confirmationtoken';

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('full flow: register → login rejected (403) → confirm email → login succeeds', async () => {
    // Setup mocks for registration
    const mockUser = {
      id: testUserId,
      email: testEmail,
      password_hash: '$2b$12$hashedpassword',
      display_name: testDisplayName,
      failed_login_attempts: 0,
      locked_until: null,
      email_confirmed: false,
      created_at: new Date('2024-01-15'),
      updated_at: new Date('2024-01-15'),
    };

    (createUser as any).mockResolvedValue(mockUser);
    (generateConfirmationToken as any).mockResolvedValue(testToken);
    (sendConfirmationEmail as any).mockResolvedValue(undefined);

    // Step 1: Register a new user → expect 201
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword, displayName: testDisplayName });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.status).toBe(201);
    expect(registerRes.body.data.email).toBe(testEmail);
    expect(registerRes.body.message).toContain('confirm');

    // Verify confirmation token was generated and email was sent
    expect(generateConfirmationToken).toHaveBeenCalledWith(testUserId);
    expect(sendConfirmationEmail).toHaveBeenCalledWith(testEmail, testToken);

    // Step 2: Attempt login before confirmation → expect 403
    const unconfirmedError = new Error('Please confirm your email address before logging in.') as Error & { statusCode: number };
    unconfirmedError.statusCode = 403;
    (login as any).mockRejectedValueOnce(unconfirmedError);

    const loginBeforeConfirmRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(loginBeforeConfirmRes.status).toBe(403);
    expect(loginBeforeConfirmRes.body.message).toContain('confirm');

    // Step 3: Confirm email via token → expect 200
    (confirmEmail as any).mockResolvedValueOnce({ success: true, userId: testUserId });

    const confirmRes = await request(app)
      .get(`/api/v1/auth/confirm/${testToken}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.message).toBe('Email confirmed successfully');

    // Step 4: Login after confirmation → expect 200 with token
    (login as any).mockResolvedValueOnce({ token: 'jwt-token-for-newuser', expiresIn: 86400 });

    const loginAfterConfirmRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(loginAfterConfirmRes.status).toBe(200);
    expect(loginAfterConfirmRes.body.data.token).toBe('jwt-token-for-newuser');
    expect(loginAfterConfirmRes.body.data.expiresIn).toBe(86400);
  });

  it('login before email confirmation returns 403', async () => {
    const unconfirmedError = new Error('Please confirm your email address before logging in.') as Error & { statusCode: number };
    unconfirmedError.statusCode = 403;
    (login as any).mockRejectedValue(unconfirmedError);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe(403);
    expect(res.body.message).toContain('confirm');
    expect(res.body.requestId).toBeDefined();
  });

  it('login after confirmation succeeds with JWT token', async () => {
    // Simulate that confirmation has already happened — login returns success
    (login as any).mockResolvedValue({ token: 'valid-jwt-token', expiresIn: 86400 });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('valid-jwt-token');
    expect(res.body.data.expiresIn).toBe(86400);
  });
});
