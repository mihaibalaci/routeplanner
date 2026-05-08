import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../utils/database';
import { findByEmail } from './userService';
import { User } from '../models/user';

const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;
const SLIDING_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
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
 * - Checks if account is locked (resets counter if lockout expired)
 * - Verifies password with bcrypt
 * - Tracks failed attempts within a 60-minute sliding window
 * - Locks account after 5 failures within the window
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

  // If lockout has expired, reset the failed attempt counter
  if (user.locked_until && new Date(user.locked_until) <= new Date()) {
    await resetFailedAttempts(user);
    // Update local user object to reflect reset state
    user.failed_login_attempts = 0;
    user.locked_until = null;
    user.last_failed_at = null;
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
 * Handles a failed login attempt with sliding-window logic:
 * - If the last failure was more than 60 minutes ago, reset counter to 1
 * - Otherwise, increment the counter
 * - If attempts >= 5 within the window, lock the account for 30 minutes
 * - Always update last_failed_at to the current timestamp
 */
async function handleFailedAttempt(user: User): Promise<void> {
  const now = new Date();
  let newAttempts: number;

  // Check if the last failure is outside the 60-minute sliding window
  if (
    user.last_failed_at &&
    now.getTime() - new Date(user.last_failed_at).getTime() > SLIDING_WINDOW_MS
  ) {
    // Previous failures are outside the window — start fresh
    newAttempts = 1;
  } else {
    newAttempts = user.failed_login_attempts + 1;
  }

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    // Lock the account for 30 minutes
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    await query(
      `UPDATE users SET failed_login_attempts = $1, locked_until = $2, last_failed_at = $3, updated_at = NOW() WHERE id = $4`,
      [newAttempts, lockedUntil.toISOString(), now.toISOString(), user.id]
    );
  } else {
    await query(
      `UPDATE users SET failed_login_attempts = $1, last_failed_at = $2, updated_at = NOW() WHERE id = $3`,
      [newAttempts, now.toISOString(), user.id]
    );
  }
}

/**
 * Resets failed login attempts on successful login or when lockout expires.
 */
async function resetFailedAttempts(user: User): Promise<void> {
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_failed_at = NULL, updated_at = NOW() WHERE id = $1`,
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
