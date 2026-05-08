import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../utils/database';
import { findByEmail } from './userService';
import { User } from '../models/user';

const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;
const JWT_EXPIRY = '24h';
const JWT_EXPIRY_SECONDS = 86400;

export interface LoginResult {
  token: string;
  expiresIn: number;
}

export interface LoginError {
  message: string;
  statusCode: number;
}

/**
 * Authenticates a user with email and password.
 * - Checks if account is locked
 * - Verifies password with bcrypt
 * - Tracks failed attempts and locks account after 5 failures in 15 min
 * - Issues JWT on success
 *
 * Returns a LoginResult on success, or throws an error with statusCode.
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  const genericError = 'Invalid email or password';

  // Find user by email
  const user = await findByEmail(email);

  if (!user) {
    // Don't reveal that the email doesn't exist
    const error = new Error(genericError) as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  // Check if email is confirmed (skip check if field not present — for backward compat)
  if (user.email_confirmed === false) {
    const error = new Error('Please confirm your email address before logging in. Check your inbox for the confirmation link.') as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const error = new Error('Account is temporarily locked. Please try again later.') as Error & { statusCode: number };
    error.statusCode = 423;
    throw error;
  }

  // SSO-only users don't have a password
  if (!user.password_hash) {
    const error = new Error(genericError) as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    await handleFailedAttempt(user);
    const error = new Error(genericError) as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  // Success: reset failed attempts
  await resetFailedAttempts(user);

  // Issue JWT
  const token = issueToken(user);

  return {
    token,
    expiresIn: JWT_EXPIRY_SECONDS,
  };
}

/**
 * Handles a failed login attempt:
 * - Increments failed_login_attempts in the database
 * - If attempts >= 5, locks the account for 30 minutes
 */
async function handleFailedAttempt(user: User): Promise<void> {
  const newAttempts = user.failed_login_attempts + 1;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    // Lock the account for 30 minutes
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await query(
      `UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3`,
      [newAttempts, lockedUntil.toISOString(), user.id]
    );
  } else {
    await query(
      `UPDATE users SET failed_login_attempts = $1, updated_at = NOW() WHERE id = $2`,
      [newAttempts, user.id]
    );
  }
}

/**
 * Resets failed login attempts on successful login.
 */
async function resetFailedAttempts(user: User): Promise<void> {
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
      [user.id]
    );
  }
}

/**
 * Issues a JWT token with userId and email, 24-hour expiry.
 */
function issueToken(user: User): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(
    { userId: user.id, email: user.email },
    secret,
    { expiresIn: JWT_EXPIRY }
  );
}
