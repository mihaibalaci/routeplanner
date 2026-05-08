import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockVerifyIdToken = vi.fn();

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import { verifyGoogleToken } from './googleAuthService';

describe('googleAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  describe('verifyGoogleToken', () => {
    it('returns user info when token is valid', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-123',
          email: 'user@gmail.com',
          name: 'Test User',
        }),
      });

      const result = await verifyGoogleToken('valid-id-token');

      expect(result).toEqual({
        googleUserId: 'google-user-123',
        email: 'user@gmail.com',
        name: 'Test User',
      });

      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-id-token',
        audience: 'test-client-id.apps.googleusercontent.com',
      });
    });

    it('uses email prefix as name when name is not provided', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-456',
          email: 'noname@gmail.com',
          name: undefined,
        }),
      });

      const result = await verifyGoogleToken('valid-token');

      expect(result.name).toBe('noname');
    });

    it('throws when GOOGLE_CLIENT_ID is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      await expect(verifyGoogleToken('some-token')).rejects.toThrow(
        'GOOGLE_CLIENT_ID environment variable is not configured'
      );
    });

    it('throws when payload is undefined', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => undefined,
      });

      await expect(verifyGoogleToken('bad-token')).rejects.toThrow(
        'Unable to extract payload from Google ID token'
      );
    });

    it('throws when payload is missing required fields', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: undefined,
          email: undefined,
        }),
      });

      await expect(verifyGoogleToken('incomplete-token')).rejects.toThrow(
        'Google token payload missing required fields'
      );
    });

    it('throws when verifyIdToken rejects (invalid token)', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token verification failed'));

      await expect(verifyGoogleToken('invalid-token')).rejects.toThrow(
        'Token verification failed'
      );
    });
  });
});
