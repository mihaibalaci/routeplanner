import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('./userService', () => ({
  findByEmail: vi.fn(),
}));

vi.mock('./googleAuthService', () => ({
  verifyGoogleToken: vi.fn(),
}));

vi.mock('./appleAuthService', () => ({
  verifyAppleToken: vi.fn(),
}));

import { query, transaction } from '../utils/database';
import { findByEmail } from './userService';
import { verifyAppleToken } from './appleAuthService';
import { handleAppleLogin } from './ssoService';

describe('ssoService - handleAppleLogin', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'user@example.com',
    password_hash: null,
    display_name: 'Apple User',
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  it('issues JWT when auth_identity already exists for Apple user', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-001',
      email: 'user@example.com',
      isPrivateEmail: false,
    });

    // auth_identity exists
    (query as any).mockResolvedValueOnce({
      rows: [{
        id: 'identity-1',
        user_id: mockUser.id,
        provider: 'apple',
        provider_user_id: 'apple-user-001',
        provider_email: 'user@example.com',
        created_at: new Date(),
      }],
    });

    // findUserById
    (query as any).mockResolvedValueOnce({
      rows: [mockUser],
    });

    const result = await handleAppleLogin('valid-auth-code');

    expect(result.token).toBeDefined();
    expect(result.expiresIn).toBe(86400);
    expect(result.user.email).toBe('user@example.com');
    expect(result.user.displayName).toBe('Apple User');
  });

  it('links Apple identity to existing user with same email', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-002',
      email: 'existing@example.com',
      isPrivateEmail: false,
    });

    // No existing auth_identity
    (query as any).mockResolvedValueOnce({ rows: [] });

    // findByEmail returns existing user
    (findByEmail as any).mockResolvedValue({
      ...mockUser,
      email: 'existing@example.com',
    });

    // createAuthIdentity
    (query as any).mockResolvedValueOnce({
      rows: [{
        id: 'identity-2',
        user_id: mockUser.id,
        provider: 'apple',
        provider_user_id: 'apple-user-002',
        provider_email: 'existing@example.com',
        created_at: new Date(),
      }],
    });

    const result = await handleAppleLogin('valid-auth-code');

    expect(result.token).toBeDefined();
    expect(result.expiresIn).toBe(86400);
    expect(result.user.email).toBe('existing@example.com');
  });

  it('creates new user when no existing account found', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-003',
      email: 'newuser@example.com',
      isPrivateEmail: false,
    });

    // No existing auth_identity
    (query as any).mockResolvedValueOnce({ rows: [] });

    // findByEmail returns null (no existing user)
    (findByEmail as any).mockResolvedValue(null);

    const newUser = {
      ...mockUser,
      id: 'new-user-id',
      email: 'newuser@example.com',
      display_name: 'New Apple User',
    };

    // transaction mock
    (transaction as any).mockImplementation(async (cb: any) => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [newUser] }) // createSsoUser
          .mockResolvedValueOnce({ rows: [{ id: 'identity-3' }] }), // createAuthIdentity
      };
      return cb(mockClient);
    });

    const result = await handleAppleLogin('valid-auth-code', {
      name: 'New Apple User',
    });

    expect(result.token).toBeDefined();
    expect(result.expiresIn).toBe(86400);
    expect(result.user.email).toBe('newuser@example.com');
    expect(result.user.displayName).toBe('New Apple User');
  });

  it('uses email prefix as display name when userInfo.name is not provided', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-004',
      email: 'john.doe@example.com',
      isPrivateEmail: false,
    });

    // No existing auth_identity
    (query as any).mockResolvedValueOnce({ rows: [] });

    // findByEmail returns null
    (findByEmail as any).mockResolvedValue(null);

    const newUser = {
      ...mockUser,
      id: 'new-user-id-2',
      email: 'john.doe@example.com',
      display_name: 'john.doe',
    };

    (transaction as any).mockImplementation(async (cb: any) => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [newUser] })
          .mockResolvedValueOnce({ rows: [{ id: 'identity-4' }] }),
      };
      return cb(mockClient);
    });

    const result = await handleAppleLogin('valid-auth-code');

    expect(result.user.displayName).toBe('john.doe');
  });

  it('throws 401 when Apple token verification fails', async () => {
    const error = new Error('Apple token exchange failed: invalid_grant');
    (error as any).statusCode = 401;
    (verifyAppleToken as any).mockRejectedValue(error);

    await expect(handleAppleLogin('invalid-code')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when linked user account is not found', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-005',
      email: 'ghost@example.com',
      isPrivateEmail: false,
    });

    // auth_identity exists but user is gone
    (query as any).mockResolvedValueOnce({
      rows: [{
        id: 'identity-5',
        user_id: 'deleted-user-id',
        provider: 'apple',
        provider_user_id: 'apple-user-005',
        provider_email: 'ghost@example.com',
        created_at: new Date(),
      }],
    });

    // findUserById returns null
    (query as any).mockResolvedValueOnce({ rows: [] });

    await expect(handleAppleLogin('valid-code')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Linked user account not found',
    });
  });

  it('handles Apple private relay email correctly', async () => {
    (verifyAppleToken as any).mockResolvedValue({
      appleUserId: 'apple-user-006',
      email: 'abc123@privaterelay.appleid.com',
      isPrivateEmail: true,
    });

    // No existing auth_identity
    (query as any).mockResolvedValueOnce({ rows: [] });

    // findByEmail returns null
    (findByEmail as any).mockResolvedValue(null);

    const newUser = {
      ...mockUser,
      id: 'relay-user-id',
      email: 'abc123@privaterelay.appleid.com',
      display_name: 'Private User',
    };

    (transaction as any).mockImplementation(async (cb: any) => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [newUser] })
          .mockResolvedValueOnce({ rows: [{ id: 'identity-6' }] }),
      };
      return cb(mockClient);
    });

    const result = await handleAppleLogin('valid-auth-code', {
      name: 'Private User',
    });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('abc123@privaterelay.appleid.com');
  });
});
