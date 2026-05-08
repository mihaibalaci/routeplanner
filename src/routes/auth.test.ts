import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from './auth';

// Mock the userService module
vi.mock('../services/userService', () => ({
  createUser: vi.fn(),
}));

// Mock the authService module
vi.mock('../services/authService', () => ({
  login: vi.fn(),
}));

// Mock the ssoService module
vi.mock('../services/ssoService', () => ({
  handleGoogleLogin: vi.fn(),
  handleAppleLogin: vi.fn(),
}));

import { createUser } from '../services/userService';
import { login } from '../services/authService';
import { handleGoogleLogin, handleAppleLogin } from '../services/ssoService';

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

  it('returns 400 for validation errors from service', async () => {
    const error = new Error('Password must be at least 8 characters');
    (error as any).statusCode = 400;
    (error as any).validationErrors = ['Password must be at least 8 characters'];
    (createUser as any).mockRejectedValue(error);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'weak', displayName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('Password must be at least 8 characters');
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
