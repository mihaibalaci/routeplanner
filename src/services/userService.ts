import bcrypt from 'bcrypt';
import { query } from '../utils/database';
import { User, ValidationResult } from '../models/user';

const BCRYPT_COST_FACTOR = 12;

/**
 * Validates password strength.
 * Requirements: min 8 chars, at least one uppercase, one lowercase, one digit.
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates email format using a standard regex pattern.
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email || email.trim().length === 0) {
    errors.push('Email is required');
    return { valid: false, errors };
  }

  // Standard email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push('Email format is invalid');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a new user with hashed password.
 * Validates email format, password rules, and email uniqueness.
 * Returns the created user or throws an error.
 */
export async function createUser(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  // Validate email format
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    const error = new Error(emailValidation.errors.join('; '));
    (error as any).statusCode = 400;
    (error as any).validationErrors = emailValidation.errors;
    throw error;
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    const error = new Error(passwordValidation.errors.join('; '));
    (error as any).statusCode = 400;
    (error as any).validationErrors = passwordValidation.errors;
    throw error;
  }

  // Check email uniqueness
  const existing = await findByEmail(email);
  if (existing) {
    const error = new Error('Email already registered');
    (error as any).statusCode = 409;
    throw error;
  }

  // Hash password with bcrypt cost factor 12
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

  // Insert user into database
  const result = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email.toLowerCase().trim(), passwordHash, displayName.trim()]
  );

  return result.rows[0] as User;
}

/**
 * Finds a user by email address (case-insensitive).
 */
export async function findByEmail(email: string): Promise<User | null> {
  const result = await query(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as User;
}

/**
 * Finds a user by their UUID.
 */
export async function findById(id: string): Promise<User | null> {
  const result = await query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as User;
}
