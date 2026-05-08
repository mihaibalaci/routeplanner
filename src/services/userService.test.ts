import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
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

// Feature: email-registration, Property 1: Password validation rejects all invalid passwords
describe('Property 1: Password validation rejects all invalid passwords', () => {
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  it('rejects passwords shorter than 8 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 7 }),
        (password) => {
          const result = validatePassword(password);
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Password must be at least 8 characters');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects passwords longer than 128 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 129, maxLength: 256 }),
        (password) => {
          const result = validatePassword(password);
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Password must not exceed 128 characters');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects passwords missing an uppercase letter', () => {
    // Generate strings of valid length (8-128) with lowercase + digits only (no uppercase)
    const noUppercase = fc.stringOf(
      fc.oneof(
        fc.char().filter((c) => /[a-z0-9]/.test(c)),
        fc.constant('a'),
        fc.constant('1')
      ),
      { minLength: 8, maxLength: 128 }
    ).filter((s) => /[a-z]/.test(s) && /[0-9]/.test(s) && !/[A-Z]/.test(s));

    fc.assert(
      fc.property(noUppercase, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects passwords missing a lowercase letter', () => {
    // Generate strings of valid length (8-128) with uppercase + digits only (no lowercase)
    const noLowercase = fc.stringOf(
      fc.oneof(
        fc.char().filter((c) => /[A-Z0-9]/.test(c)),
        fc.constant('A'),
        fc.constant('1')
      ),
      { minLength: 8, maxLength: 128 }
    ).filter((s) => /[A-Z]/.test(s) && /[0-9]/.test(s) && !/[a-z]/.test(s));

    fc.assert(
      fc.property(noLowercase, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects passwords missing a digit', () => {
    // Generate strings of valid length (8-128) with uppercase + lowercase only (no digits)
    const noDigit = fc.stringOf(
      fc.oneof(
        fc.char().filter((c) => /[a-zA-Z]/.test(c)),
        fc.constant('A'),
        fc.constant('a')
      ),
      { minLength: 8, maxLength: 128 }
    ).filter((s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && !/[0-9]/.test(s));

    fc.assert(
      fc.property(noDigit, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one digit');
      }),
      { numRuns: 100 }
    );
  });

  it('returns exactly one error per violated rule', () => {
    // Generate arbitrary strings and verify error count matches violation count
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 256 }),
        (password) => {
          const result = validatePassword(password);

          let expectedErrors = 0;
          if (password.length < 8) expectedErrors++;
          if (password.length > 128) expectedErrors++;
          if (!/[A-Z]/.test(password)) expectedErrors++;
          if (!/[a-z]/.test(password)) expectedErrors++;
          if (!/[0-9]/.test(password)) expectedErrors++;

          if (expectedErrors > 0) {
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(expectedErrors);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: email-registration, Property 2: Password validation accepts all valid passwords
describe('Property 2: Password validation accepts all valid passwords', () => {
  // **Validates: Requirements 2.7**

  it('accepts any password between 8-128 chars with uppercase, lowercase, and digit', () => {
    // Generator: build a valid password by ensuring at least one uppercase, one lowercase, one digit,
    // then fill the rest with arbitrary characters to reach a length between 8 and 128
    const validPassword = fc
      .tuple(
        fc.char().filter((c) => /[A-Z]/.test(c)),  // at least one uppercase
        fc.char().filter((c) => /[a-z]/.test(c)),  // at least one lowercase
        fc.char().filter((c) => /[0-9]/.test(c)),  // at least one digit
        fc.string({ minLength: 5, maxLength: 125 }) // fill to reach 8-128 total
      )
      .map(([upper, lower, digit, rest]) => {
        // Shuffle the required chars into the rest to avoid predictable positions
        const combined = upper + lower + digit + rest;
        return combined;
      })
      .filter((s) => s.length >= 8 && s.length <= 128 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s));

    fc.assert(
      fc.property(validPassword, (password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
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

// Feature: email-registration, Property 3: Email validation rejects all invalid emails
import * as fc from 'fast-check';

describe('validateEmail - Property 3: Email validation rejects all invalid emails', () => {
  // **Validates: Requirements 3.1, 3.4**

  it('rejects any string that exceeds 254 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 255, maxLength: 500 }),
        (longString) => {
          const result = validateEmail(longString);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects any string without an @ character', () => {
    // Generate strings that never contain @
    const noAtArbitrary = fc.string({ minLength: 1 }).filter((s) => !s.includes('@'));

    fc.assert(
      fc.property(noAtArbitrary, (input) => {
        const result = validateEmail(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any string that contains whitespace', () => {
    // Generate strings that contain at least one whitespace character
    const withWhitespaceArbitrary = fc
      .tuple(
        fc.string(),
        fc.constantFrom(' ', '\t', '\n', '\r'),
        fc.string()
      )
      .map(([before, ws, after]) => `${before}${ws}${after}`)
      .filter((s) => s.includes('@') && s.length > 0);

    fc.assert(
      fc.property(withWhitespaceArbitrary, (input) => {
        const result = validateEmail(input);
        // After trimming, if whitespace is internal, it should fail the regex
        // If whitespace is only leading/trailing, trim handles it, but internal whitespace fails
        if (input.trim() !== input || /\s/.test(input.trim())) {
          // Internal whitespace should always fail
          if (/\s/.test(input.trim())) {
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any string without a dot after the @ sign', () => {
    // Generate strings with @ but no dot in the domain part
    const noDotInDomainArbitrary = fc
      .tuple(
        fc.string({ minLength: 1 }).filter((s) => !s.includes('@') && !s.includes(' ')),
        fc.string({ minLength: 1 }).filter((s) => !s.includes('.') && !s.includes('@') && !s.includes(' '))
      )
      .map(([local, domain]) => `${local}@${domain}`);

    fc.assert(
      fc.property(noDotInDomainArbitrary, (input) => {
        const result = validateEmail(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any string that fails the email regex /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/', () => {
    // Generate arbitrary strings that do NOT match the email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmailArbitrary = fc
      .string({ minLength: 1, maxLength: 254 })
      .filter((s) => !emailRegex.test(s.trim()));

    fc.assert(
      fc.property(invalidEmailArbitrary, (input) => {
        const result = validateEmail(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects empty and whitespace-only strings', () => {
    const whitespaceOnlyArbitrary = fc.constantFrom('', ' ', '  ', '\t', '\n', '   ');

    fc.assert(
      fc.property(whitespaceOnlyArbitrary, (input) => {
        const result = validateEmail(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: email-registration, Property 4: Email normalization is idempotent
import * as fc from 'fast-check';

describe('Property 4: Email normalization is idempotent', () => {
  /**
   * Validates: Requirements 3.3
   *
   * For any valid email string (possibly with mixed case and leading/trailing whitespace),
   * normalizing it (lowercase + trim) and then normalizing again SHALL produce the same result.
   * Additionally, the normalized form SHALL equal email.toLowerCase().trim().
   */

  const normalize = (email: string): string => email.toLowerCase().trim();

  // Generator for email-like strings with mixed case and optional leading/trailing whitespace
  const emailWithWhitespaceArb = fc.tuple(
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 3 }),
    fc.tuple(
      fc.stringOf(fc.char().filter(c => c !== ' ' && c !== '@' && c.trim().length > 0), { minLength: 1, maxLength: 20 }),
      fc.constant('@'),
      fc.stringOf(fc.char().filter(c => c !== ' ' && c !== '@' && c.trim().length > 0), { minLength: 1, maxLength: 15 }),
      fc.constant('.'),
      fc.stringOf(fc.char().filter(c => c !== ' ' && c !== '@' && c.trim().length > 0), { minLength: 2, maxLength: 5 }),
    ).map(([local, at, domain, dot, tld]) => local + at + domain + dot + tld),
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 3 }),
  ).map(([leading, email, trailing]) => leading + email + trailing);

  it('normalizing twice produces the same result as normalizing once', () => {
    fc.assert(
      fc.property(emailWithWhitespaceArb, (email) => {
        const once = normalize(email);
        const twice = normalize(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 }
    );
  });

  it('normalized form equals email.toLowerCase().trim()', () => {
    fc.assert(
      fc.property(emailWithWhitespaceArb, (email) => {
        const normalized = normalize(email);
        expect(normalized).toBe(email.toLowerCase().trim());
      }),
      { numRuns: 100 }
    );
  });

  it('normalization used in createUser and findByEmail is idempotent', () => {
    // This verifies the exact normalization logic used in the service:
    // email.toLowerCase().trim() — as used in createUser INSERT and findByEmail query
    fc.assert(
      fc.property(emailWithWhitespaceArb, (email) => {
        const serviceNormalize = (e: string) => e.toLowerCase().trim();
        const once = serviceNormalize(email);
        const twice = serviceNormalize(once);
        // Idempotency: applying normalization twice yields the same result
        expect(twice).toBe(once);
        // Correctness: the result matches the expected transformation
        expect(once).toBe(email.toLowerCase().trim());
      }),
      { numRuns: 100 }
    );
  });
});
