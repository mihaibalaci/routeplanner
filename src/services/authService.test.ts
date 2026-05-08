import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
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
    last_failed_at: null,
    email_confirmed: true,
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
      expect.arrayContaining([1])
    );
  });

  it('locks account after 5 failed attempts', async () => {
    const userWith4Attempts = { ...validUser, failed_login_attempts: 4, last_failed_at: new Date() };
    (findByEmail as any).mockResolvedValue(userWith4Attempts);
    (bcrypt.compare as any).mockResolvedValue(false);

    try {
      await login('test@example.com', 'WrongPassword1');
    } catch {
      // expected
    }

    // Should set locked_until (5th attempt triggers lockout)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('locked_until'),
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
      last_failed_at: new Date(Date.now() - 31 * 60 * 1000), // 31 min ago
    };
    (findByEmail as any).mockResolvedValue(expiredLockUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('mock-jwt-token');

    const result = await login('test@example.com', 'Password1');

    expect(result.token).toBe('mock-jwt-token');
    // Should reset failed attempts since lockout expired
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = 0'),
      [expiredLockUser.id]
    );
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


// Feature: email-registration, Property 6: Unconfirmed users cannot login
describe('Property 6: Unconfirmed users cannot login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key';
  });

  // **Validates: Requirements 4.5**
  it('login SHALL return 403 for any user with email_confirmed = false, regardless of password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 128 }),
        fc.boolean(),
        async (email, password, passwordIsCorrect) => {
          // Mock findByEmail to return an unconfirmed user
          const unconfirmedUser = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: email.toLowerCase(),
            password_hash: '$2b$12$hashedpassword',
            display_name: 'Test User',
            failed_login_attempts: 0,
            locked_until: null,
            last_failed_at: null,
            email_confirmed: false,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          };

          (findByEmail as any).mockResolvedValue(unconfirmedUser);
          // Mock bcrypt.compare to simulate both correct and incorrect passwords
          (bcrypt.compare as any).mockResolvedValue(passwordIsCorrect);

          let thrownError: any;
          try {
            await login(email, password);
          } catch (e) {
            thrownError = e;
          }

          // Must always throw with 403 regardless of password correctness
          expect(thrownError).toBeDefined();
          expect(thrownError.statusCode).toBe(403);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: email-registration, Property 7: Locked accounts cannot login
describe('Property 7: Locked accounts cannot login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key';
  });

  // **Validates: Requirements 6.2**
  it('login SHALL return 423 for any user with locked_until in the future, regardless of password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 128 }),
        fc.boolean(),
        // Generate a future timestamp: 1 second to 24 hours from now
        fc.integer({ min: 1000, max: 24 * 60 * 60 * 1000 }),
        async (email, password, passwordIsCorrect, futureOffsetMs) => {
          const lockedUntil = new Date(Date.now() + futureOffsetMs);

          // Mock findByEmail to return a locked user with email_confirmed: true
          const lockedUser = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: email.toLowerCase(),
            password_hash: '$2b$12$hashedpassword',
            display_name: 'Test User',
            failed_login_attempts: 5,
            locked_until: lockedUntil,
            last_failed_at: new Date(Date.now() - 5 * 60 * 1000),
            email_confirmed: true,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          };

          (findByEmail as any).mockResolvedValue(lockedUser);
          // Mock bcrypt.compare to simulate both correct and incorrect passwords
          (bcrypt.compare as any).mockResolvedValue(passwordIsCorrect);

          let thrownError: any;
          try {
            await login(email, password);
          } catch (e) {
            thrownError = e;
          }

          // Must always throw with 423 regardless of password correctness
          expect(thrownError).toBeDefined();
          expect(thrownError.statusCode).toBe(423);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('authService.login - sliding-window lockout behavior', () => {
  const baseUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    display_name: 'Test User',
    failed_login_attempts: 0,
    locked_until: null,
    last_failed_at: null,
    email_confirmed: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Requirement 6.1: 5 failures within 60 minutes triggers lockout', () => {
    it('locks account when 5th failure occurs within the 60-minute window', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User has 4 failed attempts, last failure was 30 minutes ago (within window)
      const userWith4Attempts = {
        ...baseUser,
        failed_login_attempts: 4,
        last_failed_at: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      };
      (findByEmail as any).mockResolvedValue(userWith4Attempts);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // The 5th attempt should trigger lockout (locked_until set)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('locked_until'),
        expect.arrayContaining([5])
      );
    });

    it('does not lock account on 4th failure within the window', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User has 3 failed attempts, last failure was 10 minutes ago
      const userWith3Attempts = {
        ...baseUser,
        failed_login_attempts: 3,
        last_failed_at: new Date(now.getTime() - 10 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(userWith3Attempts);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // Should increment to 4 but NOT set locked_until
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = $1'),
        expect.arrayContaining([4])
      );
      // The query should NOT contain locked_until
      const calls = (query as any).mock.calls;
      const updateCall = calls.find((c: any[]) => c[0].includes('failed_login_attempts'));
      expect(updateCall[0]).not.toContain('locked_until = $2');
    });

    it('sets lockout duration to 30 minutes from current time', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const userWith4Attempts = {
        ...baseUser,
        failed_login_attempts: 4,
        last_failed_at: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
      };
      (findByEmail as any).mockResolvedValue(userWith4Attempts);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected
      }

      // Verify locked_until is set to 30 minutes from now
      const expectedLockUntil = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('locked_until = $2'),
        expect.arrayContaining([expectedLockUntil])
      );
    });
  });

  describe('Requirement 6.1: failures older than 60 minutes are not counted', () => {
    it('resets counter to 1 when last failure was more than 60 minutes ago', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User had 4 failed attempts, but the last one was 61 minutes ago (outside window)
      const userWithOldAttempts = {
        ...baseUser,
        failed_login_attempts: 4,
        last_failed_at: new Date(now.getTime() - 61 * 60 * 1000), // 61 min ago
      };
      (findByEmail as any).mockResolvedValue(userWithOldAttempts);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // Counter should reset to 1 (not increment to 5), so no lockout
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = $1'),
        expect.arrayContaining([1])
      );
      // Should NOT set locked_until since counter resets to 1
      const calls = (query as any).mock.calls;
      const updateCall = calls.find((c: any[]) => c[0].includes('failed_login_attempts = $1'));
      expect(updateCall[0]).not.toContain('locked_until');
    });

    it('does not trigger lockout even with many old failures outside the window', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User had 10 failed attempts, but last failure was 2 hours ago
      const userWithManyOldAttempts = {
        ...baseUser,
        failed_login_attempts: 10,
        last_failed_at: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      };
      (findByEmail as any).mockResolvedValue(userWithManyOldAttempts);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // Counter resets to 1 because last failure is outside the 60-min window
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = $1'),
        expect.arrayContaining([1])
      );
    });

    it('counts failure when last_failed_at is exactly at the 60-minute boundary', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // Last failure was exactly 60 minutes ago (not MORE than 60 min, so still in window)
      const userAtBoundary = {
        ...baseUser,
        failed_login_attempts: 3,
        last_failed_at: new Date(now.getTime() - 60 * 60 * 1000), // exactly 60 min ago
      };
      (findByEmail as any).mockResolvedValue(userAtBoundary);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // At exactly 60 minutes, the condition is `> SLIDING_WINDOW_MS` which is NOT satisfied
      // So the counter should increment (not reset)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = $1'),
        expect.arrayContaining([4])
      );
    });
  });

  describe('Requirement 6.3: successful login resets the counter', () => {
    it('resets failed_login_attempts to 0 on successful login', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const userWithAttempts = {
        ...baseUser,
        failed_login_attempts: 3,
        last_failed_at: new Date(now.getTime() - 10 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(userWithAttempts);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      await login('test@example.com', 'Password1');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        [userWithAttempts.id]
      );
    });

    it('clears locked_until and last_failed_at on successful login', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const userWithAttempts = {
        ...baseUser,
        failed_login_attempts: 2,
        last_failed_at: new Date(now.getTime() - 5 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(userWithAttempts);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      await login('test@example.com', 'Password1');

      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/locked_until = NULL.*last_failed_at = NULL/s),
        [userWithAttempts.id]
      );
    });

    it('does not call reset query when user had zero failed attempts', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User with 0 failed attempts — no need to reset
      (findByEmail as any).mockResolvedValue(baseUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      await login('test@example.com', 'Password1');

      // Should NOT call the reset query since failed_login_attempts is 0 and locked_until is null
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 6.4: lockout expiry allows login again', () => {
    it('allows login after lockout period has expired', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      // User was locked 31 minutes ago (lockout is 30 min, so it has expired)
      const expiredLockUser = {
        ...baseUser,
        failed_login_attempts: 5,
        locked_until: new Date(now.getTime() - 1 * 60 * 1000), // expired 1 min ago
        last_failed_at: new Date(now.getTime() - 31 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(expiredLockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      const result = await login('test@example.com', 'Password1');

      expect(result.token).toBe('mock-jwt-token');
    });

    it('resets counter when lockout expires before checking password', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const expiredLockUser = {
        ...baseUser,
        failed_login_attempts: 5,
        locked_until: new Date(now.getTime() - 1000), // expired 1 second ago
        last_failed_at: new Date(now.getTime() - 31 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(expiredLockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (jwt.sign as any).mockReturnValue('mock-jwt-token');

      await login('test@example.com', 'Password1');

      // Should reset the counter because lockout expired
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        [expiredLockUser.id]
      );
    });

    it('rejects login when lockout has NOT yet expired', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const stillLockedUser = {
        ...baseUser,
        failed_login_attempts: 5,
        locked_until: new Date(now.getTime() + 15 * 60 * 1000), // 15 min remaining
        last_failed_at: new Date(now.getTime() - 15 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(stillLockedUser);

      await expect(login('test@example.com', 'Password1'))
        .rejects.toMatchObject({
          statusCode: 423,
          message: 'Account is temporarily locked. Please try again later.',
        });

      // Password should not be checked
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('allows new failure tracking after lockout expires and wrong password is given', async () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);

      const expiredLockUser = {
        ...baseUser,
        failed_login_attempts: 5,
        locked_until: new Date(now.getTime() - 1000), // expired 1 second ago
        last_failed_at: new Date(now.getTime() - 31 * 60 * 1000),
      };
      (findByEmail as any).mockResolvedValue(expiredLockUser);
      (bcrypt.compare as any).mockResolvedValue(false);

      try {
        await login('test@example.com', 'WrongPassword1');
      } catch {
        // expected 401
      }

      // First call resets the counter (lockout expired), then handleFailedAttempt increments
      // The reset happens first, then the user object is updated locally to 0 attempts
      // Then handleFailedAttempt sees last_failed_at as null (reset), so increments to 1
      const calls = (query as any).mock.calls;
      // First query: reset due to expired lockout
      expect(calls[0][0]).toContain('failed_login_attempts = 0');
      // Second query: new failed attempt (counter starts at 1 since user was reset)
      expect(calls[1][0]).toContain('failed_login_attempts = $1');
      expect(calls[1][1]).toContain(1);
    });
  });
});
