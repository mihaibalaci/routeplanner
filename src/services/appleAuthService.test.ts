import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apple-signin-auth before importing the service
vi.mock('apple-signin-auth', () => ({
  default: {
    getClientSecret: vi.fn(),
    getAuthorizationToken: vi.fn(),
    verifyIdToken: vi.fn(),
  },
  getClientSecret: vi.fn(),
  getAuthorizationToken: vi.fn(),
  verifyIdToken: vi.fn(),
}));

import appleSignin from 'apple-signin-auth';
import { verifyAppleToken } from './appleAuthService';

describe('appleAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars
    process.env.APPLE_CLIENT_ID = 'com.example.app';
    process.env.APPLE_TEAM_ID = 'TEAM123';
    process.env.APPLE_KEY_ID = 'KEY123';
    process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----';
    process.env.APPLE_REDIRECT_URI = 'https://example.com/auth/apple/callback';
  });

  describe('verifyAppleToken', () => {
    it('returns user payload on successful verification', async () => {
      (appleSignin.getClientSecret as any).mockReturnValue('mock-client-secret');
      (appleSignin.getAuthorizationToken as any).mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        id_token: 'mock-id-token',
      });
      (appleSignin.verifyIdToken as any).mockResolvedValue({
        iss: 'https://appleid.apple.com',
        sub: 'apple-user-001',
        aud: 'com.example.app',
        email: 'user@example.com',
        email_verified: 'true',
        is_private_email: 'false',
      });

      const result = await verifyAppleToken('valid-auth-code');

      expect(result).toEqual({
        appleUserId: 'apple-user-001',
        email: 'user@example.com',
        isPrivateEmail: false,
      });

      expect(appleSignin.getAuthorizationToken).toHaveBeenCalledWith(
        'valid-auth-code',
        expect.objectContaining({
          clientID: 'com.example.app',
          redirectUri: 'https://example.com/auth/apple/callback',
          clientSecret: 'mock-client-secret',
        })
      );
    });

    it('detects private relay email', async () => {
      (appleSignin.getClientSecret as any).mockReturnValue('mock-client-secret');
      (appleSignin.getAuthorizationToken as any).mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        id_token: 'mock-id-token',
      });
      (appleSignin.verifyIdToken as any).mockResolvedValue({
        iss: 'https://appleid.apple.com',
        sub: 'apple-user-002',
        aud: 'com.example.app',
        email: 'abc123@privaterelay.appleid.com',
        email_verified: 'true',
        is_private_email: 'true',
      });

      const result = await verifyAppleToken('valid-auth-code');

      expect(result.isPrivateEmail).toBe(true);
      expect(result.email).toBe('abc123@privaterelay.appleid.com');
    });

    it('throws 401 when token exchange fails', async () => {
      (appleSignin.getClientSecret as any).mockReturnValue('mock-client-secret');
      (appleSignin.getAuthorizationToken as any).mockRejectedValue(
        new Error('invalid_grant')
      );

      await expect(verifyAppleToken('invalid-code')).rejects.toMatchObject({
        message: expect.stringContaining('Apple token exchange failed'),
        statusCode: 401,
      });
    });

    it('throws 401 when ID token verification fails', async () => {
      (appleSignin.getClientSecret as any).mockReturnValue('mock-client-secret');
      (appleSignin.getAuthorizationToken as any).mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        id_token: 'mock-id-token',
      });
      (appleSignin.verifyIdToken as any).mockRejectedValue(
        new Error('Token expired')
      );

      await expect(verifyAppleToken('expired-code')).rejects.toMatchObject({
        message: expect.stringContaining('Apple ID token verification failed'),
        statusCode: 401,
      });
    });

    it('throws 401 when ID token has no email', async () => {
      (appleSignin.getClientSecret as any).mockReturnValue('mock-client-secret');
      (appleSignin.getAuthorizationToken as any).mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        id_token: 'mock-id-token',
      });
      (appleSignin.verifyIdToken as any).mockResolvedValue({
        iss: 'https://appleid.apple.com',
        sub: 'apple-user-003',
        aud: 'com.example.app',
        email: '',
        email_verified: 'true',
        is_private_email: 'false',
      });

      await expect(verifyAppleToken('no-email-code')).rejects.toMatchObject({
        message: 'Apple ID token missing email',
        statusCode: 401,
      });
    });

    it('throws when APPLE_CLIENT_ID is missing', async () => {
      delete process.env.APPLE_CLIENT_ID;

      await expect(verifyAppleToken('some-code')).rejects.toThrow(
        'Missing APPLE_CLIENT_ID environment variable'
      );
    });
  });
});
