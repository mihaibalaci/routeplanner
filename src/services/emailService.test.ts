import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import { generateConfirmationToken } from './emailService';

// Feature: email-registration, Property 8: Confirmation tokens are unique
describe('Property 8: Confirmation tokens are unique', () => {
  /**
   * Validates: Requirements 4.1
   *
   * For any sequence of N token generation calls (for the same or different users),
   * all N resulting token strings SHALL be distinct.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('all generated tokens are distinct for the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        async (n) => {
          const userId = 'user-123';
          const tokens: string[] = [];

          for (let i = 0; i < n; i++) {
            const token = await generateConfirmationToken(userId);
            tokens.push(token);
          }

          const uniqueTokens = new Set(tokens);
          expect(uniqueTokens.size).toBe(tokens.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all generated tokens are distinct across different users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        async (userIds) => {
          const tokens: string[] = [];

          for (const userId of userIds) {
            const token = await generateConfirmationToken(userId);
            tokens.push(token);
          }

          const uniqueTokens = new Set(tokens);
          expect(uniqueTokens.size).toBe(tokens.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tokens are 64-character hex strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (userId) => {
          const token = await generateConfirmationToken(userId);
          expect(token).toHaveLength(64);
          expect(token).toMatch(/^[0-9a-f]{64}$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
