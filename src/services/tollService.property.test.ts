/**
 * Property-based test for toll parsing (Property 1).
 *
 * **Validates: Requirements 1.2**
 *
 * Property 1: Toll parsing extracts all entries with required fields
 * For any valid Google Routes API toll response containing N toll entries,
 * the parsed result SHALL contain exactly N entries, each with a non-empty name,
 * a non-negative cost, and a category of "bridge" or "highway".
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTollResponse } from './tollService';

/**
 * Arbitrary for a single Google Routes API estimated price entry.
 * units is a non-negative integer as a string, nanos is 0..999_999_999.
 */
const arbEstimatedPrice = fc.record({
  currencyCode: fc.stringOf(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'U', 'R'), { minLength: 3, maxLength: 3 }),
  units: fc.nat({ max: 10000 }).map(String),
  nanos: fc.option(fc.integer({ min: 0, max: 999_999_999 }), { nil: undefined }),
});

/**
 * Arbitrary for a valid Google Routes API toll response with per-leg toll entries.
 * Generates a response with 1+ legs, each with 1+ estimated price entries.
 */
const arbPerLegTollResponse = fc
  .array(
    fc.array(arbEstimatedPrice, { minLength: 1, maxLength: 3 }),
    { minLength: 1, maxLength: 5 }
  )
  .map((legsEstimatedPrices) => ({
    routes: [
      {
        legs: legsEstimatedPrices.map((estimatedPrice) => ({
          travelAdvisory: {
            tollInfo: {
              estimatedPrice,
            },
          },
        })),
      },
    ],
  }));

/**
 * Arbitrary for a valid Google Routes API toll response with route-level toll entries.
 * Generates a response with no per-leg tolls but route-level toll info.
 */
const arbRouteLevelTollResponse = fc
  .array(arbEstimatedPrice, { minLength: 1, maxLength: 5 })
  .map((estimatedPrice) => ({
    routes: [
      {
        legs: [] as Array<Record<string, unknown>>,
        travelAdvisory: {
          tollInfo: {
            estimatedPrice,
          },
        },
      },
    ],
  }));

/**
 * Count the total number of estimated price entries in a per-leg response.
 */
function countPerLegEntries(response: { routes: Array<{ legs: Array<{ travelAdvisory: { tollInfo: { estimatedPrice: unknown[] } } }> }> }): number {
  return response.routes[0].legs.reduce(
    (sum, leg) => sum + leg.travelAdvisory.tollInfo.estimatedPrice.length,
    0
  );
}

describe('tollService - Property 1: Toll parsing extracts all entries with required fields', () => {
  it('per-leg response: parsed result contains exactly N entries with valid fields', () => {
    fc.assert(
      fc.property(arbPerLegTollResponse, (response) => {
        const expectedCount = countPerLegEntries(response);
        const result = parseTollResponse(response);

        // Exactly N entries
        expect(result).toHaveLength(expectedCount);

        // Each entry has required fields with valid values
        for (const entry of result) {
          // Non-empty name
          expect(entry.name.length).toBeGreaterThan(0);
          // Non-negative cost
          expect(entry.costEur).toBeGreaterThanOrEqual(0);
          // Category is "bridge" or "highway"
          expect(['bridge', 'highway']).toContain(entry.category);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('route-level response: parsed result contains exactly N entries with valid fields', () => {
    fc.assert(
      fc.property(arbRouteLevelTollResponse, (response) => {
        const expectedCount = response.routes[0].travelAdvisory.tollInfo.estimatedPrice.length;
        const result = parseTollResponse(response);

        // Exactly N entries
        expect(result).toHaveLength(expectedCount);

        // Each entry has required fields with valid values
        for (const entry of result) {
          // Non-empty name
          expect(entry.name.length).toBeGreaterThan(0);
          // Non-negative cost
          expect(entry.costEur).toBeGreaterThanOrEqual(0);
          // Category is "bridge" or "highway"
          expect(['bridge', 'highway']).toContain(entry.category);
        }
      }),
      { numRuns: 200 }
    );
  });
});
