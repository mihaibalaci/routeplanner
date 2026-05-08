import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePassword, validateEmail, createUser } from './userService';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  },
}));

import { query } from '../utils/database';
import bcrypt from 'bcrypt';

describe('validatePassword', () => {
  it('accepts a valid password with all requirements', () => {
    const result = validatePassword('Abcdef1x');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = validatePassword('Ab1cdef');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('rejects password without uppercase letter', () => {
    const result = validatePassword('abcdef1x');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('rejects password without lowercase letter', () => {
    const result = validatePassword('ABCDEF1X');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('rejects password without digit', () => {
    const result = validatePassword('Abcdefgh');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one digit');
  });

  it('returns multiple errors for multiple violations', () => {
    const result = validatePassword('abc');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('validateEmail', () => {
  it('accepts a valid email', () => {
    const result = validateEmail('user@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty email', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email is required');
  });

  it('rejects email without @', () => {
    const result = validateEmail('userexample.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email format is invalid');
  });

  it('rejects email without domain', () => {
    const result = validateEmail('user@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email format is invalid');
  });

  it('rejects email with spaces', () => {
    const result = validateEmail('user @example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Email format is invalid');
  });
});

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user with valid input', async () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      password_hash: '$2b$12$hashedpassword',
      display_name: 'Test User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // First call: findByEmail (no existing user)
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Second call: INSERT
    (query as any).mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

    const user = await createUser('test@example.com', 'Password1', 'Test User');

    expect(user.email).toBe('test@example.com');
    expect(user.display_name).toBe('Test User');
    expect(bcrypt.hash).toHaveBeenCalledWith('Password1', 12);
  });

  it('throws 400 for invalid email', async () => {
    await expect(createUser('invalid', 'Password1', 'Test')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 400 for weak password', async () => {
    await expect(createUser('test@example.com', 'weak', 'Test')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 409 for duplicate email', async () => {
    (query as any).mockResolvedValueOnce({
      rows: [{ id: 'existing-id', email: 'test@example.com' }],
      rowCount: 1,
    });

    await expect(
      createUser('test@example.com', 'Password1', 'Test')
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('normalizes email to lowercase', async () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      password_hash: '$2b$12$hashedpassword',
      display_name: 'Test User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (query as any).mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

    await createUser('TEST@Example.COM', 'Password1', 'Test User');

    // The INSERT query should use lowercase email
    const insertCall = (query as any).mock.calls[1];
    expect(insertCall[1][0]).toBe('test@example.com');
  });
});
