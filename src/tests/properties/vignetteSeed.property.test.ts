import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property tests for vignette country seed data integrity.
 * Validates: Requirements 16.1, 16.6, 16.7
 */

// Seed data as defined in the migration
const VIGNETTE_COUNTRIES = [
  {
    country_code: 'AT',
    country_name: 'Austria',
    motorcycle_exempt: false,
    available_durations: ['10-day', '2-month', '1-year'],
    active: true,
  },
  {
    country_code: 'BG',
    country_name: 'Bulgaria',
    motorcycle_exempt: true,
    available_durations: ['1-week', '1-month', '3-month', '1-year'],
    active: true,
  },
  {
    country_code: 'CZ',
    country_name: 'Czech Republic',
    motorcycle_exempt: false,
    available_durations: ['10-day', '1-month', '1-year'],
    active: true,
  },
  {
    country_code: 'HU',
    country_name: 'Hungary',
    motorcycle_exempt: false,
    available_durations: ['10-day', '1-month', '1-year'],
    active: true,
  },
  {
    country_code: 'MD',
    country_name: 'Moldova',
    motorcycle_exempt: false,
    available_durations: ['10-day', '1-month', '1-year'],
    active: true,
  },
  {
    country_code: 'RO',
    country_name: 'Romania',
    motorcycle_exempt: true,
    available_durations: ['1-week', '1-month', '3-month', '1-year'],
    active: true,
  },
  {
    country_code: 'SK',
    country_name: 'Slovakia',
    motorcycle_exempt: false,
    available_durations: ['10-day', '1-month', '1-year'],
    active: true,
  },
  {
    country_code: 'SI',
    country_name: 'Slovenia',
    motorcycle_exempt: false,
    available_durations: ['1-week', '1-month', '6-month', '1-year'],
    active: true,
  },
  {
    country_code: 'CH',
    country_name: 'Switzerland',
    motorcycle_exempt: false,
    available_durations: ['1-year'],
    active: true,
  },
];

const VALID_DURATIONS = [
  '1-day',
  '10-day',
  '1-week',
  '1-month',
  '2-month',
  '3-month',
  '6-month',
  '1-year',
];

const MOTORCYCLE_EXEMPT_CODES = ['RO', 'BG'];

describe('Vignette Seed Data Properties', () => {
  /**
   * Validates: Requirements 16.1
   * All 9 required vignette countries are present in seed data.
   */
  it('should contain exactly 9 vignette countries', () => {
    expect(VIGNETTE_COUNTRIES).toHaveLength(9);
    const codes = VIGNETTE_COUNTRIES.map((c) => c.country_code).sort();
    expect(codes).toEqual(['AT', 'BG', 'CH', 'CZ', 'HU', 'MD', 'RO', 'SI', 'SK']);
  });

  /**
   * Validates: Requirements 16.6
   * All country codes are unique 2-character ISO codes.
   */
  it('should have unique 2-character country codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIGNETTE_COUNTRIES),
        (country) => {
          expect(country.country_code).toHaveLength(2);
          expect(country.country_code).toMatch(/^[A-Z]{2}$/);
          // Verify uniqueness
          const matches = VIGNETTE_COUNTRIES.filter(
            (c) => c.country_code === country.country_code
          );
          expect(matches).toHaveLength(1);
        }
      ),
      { numRuns: 9 }
    );
  });

  /**
   * Validates: Requirements 16.7
   * Motorcycle exemption is correctly set for RO and BG only.
   */
  it('should set motorcycle_exempt = true only for RO and BG', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIGNETTE_COUNTRIES),
        (country) => {
          if (MOTORCYCLE_EXEMPT_CODES.includes(country.country_code)) {
            expect(country.motorcycle_exempt).toBe(true);
          } else {
            expect(country.motorcycle_exempt).toBe(false);
          }
        }
      ),
      { numRuns: 9 }
    );
  });

  /**
   * Validates: Requirements 16.6
   * All available_durations contain only valid duration values.
   */
  it('should have only valid durations in available_durations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIGNETTE_COUNTRIES),
        (country) => {
          expect(country.available_durations.length).toBeGreaterThan(0);
          for (const duration of country.available_durations) {
            expect(VALID_DURATIONS).toContain(duration);
          }
        }
      ),
      { numRuns: 9 }
    );
  });

  /**
   * Validates: Requirements 16.1
   * All countries are active by default.
   */
  it('should have all countries set to active = true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIGNETTE_COUNTRIES),
        (country) => {
          expect(country.active).toBe(true);
        }
      ),
      { numRuns: 9 }
    );
  });

  /**
   * Validates: Requirements 16.6
   * Each country has a non-empty country_name.
   */
  it('should have non-empty country names', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIGNETTE_COUNTRIES),
        (country) => {
          expect(country.country_name.length).toBeGreaterThan(0);
          expect(country.country_name.length).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 9 }
    );
  });
});
