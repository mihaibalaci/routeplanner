import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from './authService';

// Mock dependencies
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

vi.mock('./userService', () => ({
  findByEmail: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
  },
}));

import { query } from '../utils/database';
import { findByEmail } from './userService';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

describe('authService.login', () => {
  const validUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    display_name: 'Test User',
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key';
  });

  it('returns token on successful login', async () => {
    (findByEmail as any).mockResolvedValue(validUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('mock-jwt-token');

    const result = await login('test@example.com', 'Password1');

    expect(result.token).toBe('mock-jwt-token');
    expect(result.expiresIn).toBe(86400);
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: validUser.id, email: validUser.email },
      'test-secret-key',
      { expiresIn: '24h' }
    );
  });

  it('resets failed attempts on successful login', async () => {
    const userWithAttempts = { ...validUser, failed_login_attempts: 3 };
    (findByEmail as any).mockResolvedValue(userWithAttempts);
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('mock-jwt-token');

    await login('test@example.com', 'Password1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = 0'),
      [validUser.id]
    );
  });

  it('throws 401 with generic message when email not found', async () => {
    (findByEmail as any).mockResolvedValue(null);

    await expect(login('nonexistent@example.com', 'Password1'))
      .rejects.toMatchObject({
        message: 'Invalid email or password',
        statusCode: 401,
      });
  });

  it('throws 401 with generic message when password is wrong', async () => {
    (findByEmail as any).mockResolvedValue(validUser);
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(login('test@example.com', 'WrongPassword1'))
      .rejects.toMatchObject({
        message: 'Invalid email or password',
        statusCode: 401,
      });
  });

  it('returns same error message regardless of which credential is wrong', async () => {
    // Wrong email
    (findByEmail as any).mockResolvedValue(null);
    let emailError: any;
    try {
      await login('wrong@example.com', 'Password1');
    } catch (e) {
      emailError = e;
    }

    // Wrong password
    (findByEmail as any).mockResolvedValue(validUser);
    (bcrypt.compare as any).mockResolvedValue(false);
    let passwordError: any;
    try {
      await login('test@example.com', 'WrongPassword1');
    } catch (e) {
      passwordError = e;
    }

    expect(emailError.message).toBe(passwordError.message);
    expect(emailError.statusCode).toBe(passwordError.statusCode);
  });

  it('increments failed attempts on wrong password', async () => {
    (findByEmail as any).mockResolvedValue(validUser);
    (bcrypt.compare as any).mockResolvedValue(false);

    try {
      await login('test@example.com', 'WrongPassword1');
    } catch {
      // expected
    }

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = $1'),
      [1, validUser.id]
    );
  });

  it('locks account after 5 failed attempts', async () => {
    const userWith4Attempts = { ...validUser, failed_login_attempts: 4 };
    (findByEmail as any).mockResolvedValue(userWith4Attempts);
    (bcrypt.compare as any).mockResolvedValue(false);

    try {
      await login('test@example.com', 'WrongPassword1');
    } catch {
      // expected
    }

    // Should set locked_until (5th attempt triggers lockout)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('locked_until = $2'),
      expect.arrayContaining([5])
    );
  });

  it('throws 423 when account is locked', async () => {
    const lockedUser = {
      ...validUser,
      locked_until: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
    };
    (findByEmail as any).mockResolvedValue(lockedUser);

    await expect(login('test@example.com', 'Password1'))
      .rejects.toMatchObject({
        statusCode: 423,
      });

    // Should not even check the password
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('allows login when lock has expired', async () => {
    const expiredLockUser = {
      ...validUser,
      locked_until: new Date(Date.now() - 1000), // 1 second ago
      failed_login_attempts: 5,
    };
    (findByEmail as any).mockResolvedValue(expiredLockUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('mock-jwt-token');

    const result = await login('test@example.com', 'Password1');

    expect(result.token).toBe('mock-jwt-token');
  });

  it('throws 401 for SSO-only users (no password_hash)', async () => {
    const ssoUser = { ...validUser, password_hash: null };
    (findByEmail as any).mockResolvedValue(ssoUser);

    await expect(login('test@example.com', 'Password1'))
      .rejects.toMatchObject({
        message: 'Invalid email or password',
        statusCode: 401,
      });
  });
});
