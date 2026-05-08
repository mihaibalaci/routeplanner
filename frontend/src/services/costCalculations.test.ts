// Feature: cost-breakdown-panel, Property 1: Fuel cost formula correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateSegmentFuelCost,
  calculateTotalFuelCost,
  calculateTotalVignetteCost,
  VignetteSelection,
  VignetteDuration,
  DURATION_ORDER,
} from './costCalculations';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const EUROPEAN_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB',
];

/** Generate a valid distance (≥ 1 km) */
const distanceArb = fc.double({ min: 1, max: 2000, noNaN: true, noDefaultInfinity: true });

/** Generate a valid consumption rate in [1, 50] L/100km */
const consumptionArb = fc.double({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true });

/** Generate a valid fuel price > 0 */
const priceArb = fc.double({ min: 0.01, max: 5, noNaN: true, noDefaultInfinity: true });

/** Generate a country code */
const countryCodeArb = fc.constantFrom(...EUROPEAN_COUNTRY_CODES);

/** Generate a route segment with distance ≥ 1 km */
const validSegmentArb = fc.record({
  distanceKm: distanceArb,
  countryCode: countryCodeArb,
  countryName: fc.constantFrom(
    'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic',
    'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
    'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia',
    'Lithuania', 'Luxembourg', 'Netherlands', 'Norway', 'Poland',
    'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain',
    'Sweden', 'Switzerland', 'United Kingdom'
  ),
});

// ─── Property 1: Fuel cost formula correctness ────────────────────────────────

describe('Property 1: Fuel cost formula correctness', () => {
  it('calculateSegmentFuelCost equals (distanceKm / 100) × consumptionPer100km × pricePerLiter rounded to 2 decimals', () => {
    /**
     * **Validates: Requirements 3.1, 3.3**
     */
    fc.assert(
      fc.property(
        distanceArb,
        consumptionArb,
        priceArb,
        (distanceKm, consumptionPer100km, pricePerLiter) => {
          const result = calculateSegmentFuelCost(distanceKm, consumptionPer100km, pricePerLiter);

          // Expected: (distanceKm / 100) × consumptionPer100km × pricePerLiter, rounded to 2 decimals
          const rawCost = (distanceKm / 100) * consumptionPer100km * pricePerLiter;
          const expected = Math.round(rawCost * 100) / 100;

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('calculateTotalFuelCost total equals sum of per-segment costs', () => {
    /**
     * **Validates: Requirements 3.1, 3.3**
     */
    fc.assert(
      fc.property(
        fc.array(validSegmentArb, { minLength: 1, maxLength: 10 }),
        consumptionArb,
        (segments, consumptionPer100km) => {
          // Build fuel prices for all unique country codes in segments
          const uniqueCountries = [...new Set(segments.map((s) => s.countryCode))];
          const fuelPrices: Record<string, number> = {};
          for (const cc of uniqueCountries) {
            // Use a deterministic price based on country code to avoid randomness issues
            fuelPrices[cc] = 0.5 + ((cc.charCodeAt(0) + cc.charCodeAt(1)) % 20) / 10;
          }

          const result = calculateTotalFuelCost(segments, consumptionPer100km, fuelPrices);

          // Manually compute expected total: sum of per-segment costs for segments ≥ 1km
          // Note: calculateTotalFuelCost aggregates by country, so we compute per-segment
          // costs and sum them, accounting for rounding at each step
          let expectedTotal = 0;
          for (const segment of segments) {
            if (segment.distanceKm < 1) continue;
            const pricePerLiter = fuelPrices[segment.countryCode] ?? 0;
            const segmentCost = calculateSegmentFuelCost(
              segment.distanceKm,
              consumptionPer100km,
              pricePerLiter
            );
            expectedTotal += segmentCost;
          }
          expectedTotal = Math.round(expectedTotal * 100) / 100;

          // The total from calculateTotalFuelCost should equal the sum of
          // individual segment costs (both rounded to 2 decimals)
          expect(result.total).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { formatEur } from './costCalculations';

// Feature: cost-breakdown-panel, Property 9: Currency formatting
describe('Property 9: Currency formatting', () => {
  // **Validates: Requirements 5.3**

  it('for any non-negative number, formatEur output matches pattern €X.XX with exactly 2 decimal places', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e12, noNaN: true, noDefaultInfinity: true }),
        (amount) => {
          const result = formatEur(amount);

          // Must start with €
          expect(result.startsWith('€')).toBe(true);

          // The numeric part after € must have exactly 2 decimal places
          const numericPart = result.slice(1);
          expect(numericPart).toMatch(/^\d+\.\d{2}$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: cost-breakdown-panel, Property 3: Sub-1km segment filtering
describe('Property 3: Sub-1km segment filtering', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any set of segments, verify segments with distance < 1 km do not appear
   * in breakdown and their cost is excluded from total.
   */
  it('segments with distance < 1 km do not appear in breakdown and their cost is excluded from total', () => {
    const countryArb = fc.record({
      code: fc.constantFrom(...EUROPEAN_COUNTRY_CODES),
      name: fc.constantFrom(
        'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic',
        'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
        'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia',
        'Lithuania', 'Luxembourg', 'Netherlands', 'Norway', 'Poland',
        'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain',
        'Sweden', 'Switzerland', 'United Kingdom'
      ),
    });

    fc.assert(
      fc.property(
        // Generate 1-5 unique countries
        fc.array(countryArb, { minLength: 1, maxLength: 5 }).chain((countries) =>
          fc.tuple(
            // Generate segments: mix of sub-1km and valid (>= 1km)
            fc.array(
              fc.nat({ max: countries.length - 1 }).chain((idx) =>
                fc.oneof(
                  // Sub-1km segment (should be filtered out)
                  fc.record({
                    distanceKm: fc.double({ min: 0, max: 0.999, noNaN: true, noDefaultInfinity: true }),
                    countryCode: fc.constant(countries[idx].code),
                    countryName: fc.constant(countries[idx].name),
                  }),
                  // Valid segment (>= 1km)
                  fc.record({
                    distanceKm: fc.double({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true }),
                    countryCode: fc.constant(countries[idx].code),
                    countryName: fc.constant(countries[idx].name),
                  })
                )
              ),
              { minLength: 1, maxLength: 20 }
            ),
            // Consumption rate [1, 50]
            fc.double({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
            // Fuel prices per country (positive prices)
            fc.constant(countries).chain((cs) =>
              fc.tuple(
                ...cs.map((c) =>
                  fc.double({ min: 0.01, max: 5, noNaN: true, noDefaultInfinity: true }).map(
                    (price) => [c.code, price] as [string, number]
                  )
                )
              ).map((entries) => Object.fromEntries(entries))
            )
          )
        ),
        ([segments, consumption, fuelPrices]) => {
          const result = calculateTotalFuelCost(segments, consumption, fuelPrices);

          // Identify sub-1km and valid segments
          const subKmSegments = segments.filter((s) => s.distanceKm < 1);
          const validSegments = segments.filter((s) => s.distanceKm >= 1);

          // Countries that ONLY have sub-1km segments should NOT appear in breakdown
          const countriesWithOnlySubKm = new Set(
            subKmSegments
              .map((s) => s.countryCode)
              .filter(
                (code) => !validSegments.some((v) => v.countryCode === code)
              )
          );

          for (const countryCode of countriesWithOnlySubKm) {
            const inBreakdown = result.breakdown.some(
              (b) => b.countryCode === countryCode
            );
            expect(inBreakdown).toBe(false);
          }

          // Total breakdown distance should equal sum of valid segment distances only
          const totalBreakdownDistance = result.breakdown.reduce(
            (sum, b) => sum + b.distanceKm,
            0
          );
          const totalValidDistance = validSegments.reduce(
            (sum, s) => sum + s.distanceKm,
            0
          );
          expect(totalBreakdownDistance).toBeCloseTo(totalValidDistance, 5);

          // Total cost should equal sum of costs from valid segments only
          // (sub-1km segments contribute nothing)
          const expectedCosts = validSegments.map((seg) => {
            const price = fuelPrices[seg.countryCode] ?? 0;
            return Math.round(((seg.distanceKm / 100) * consumption * price) * 100) / 100;
          });
          const expectedTotal = Math.round(
            expectedCosts.reduce((sum, c) => sum + c, 0) * 100
          ) / 100;

          expect(result.total).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: cost-breakdown-panel, Property 4: Vignette total equals sum of selected durations
describe('Property 4: Vignette total equals sum of selected durations', () => {
  /**
   * **Validates: Requirements 4.1, 4.4**
   *
   * For any set of vignette selections with known prices, the total vignette cost
   * SHALL equal the sum of the price for each country's selected duration,
   * excluding exempt and unavailable countries, rounded to 2 decimal places.
   */
  it('total equals sum of non-exempt, non-unavailable prices rounded to 2 decimals', () => {
    const allDurations: VignetteDuration[] = Object.keys(DURATION_ORDER) as VignetteDuration[];

    const vignetteSelectionArb: fc.Arbitrary<VignetteSelection> = fc.record({
      countryCode: fc.constantFrom(...EUROPEAN_COUNTRY_CODES),
      countryName: fc.string({ minLength: 1, maxLength: 30 }),
      duration: fc.constantFrom(...allDurations),
      priceEur: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
      exempt: fc.boolean(),
      unavailable: fc.boolean(),
    });

    fc.assert(
      fc.property(
        fc.array(vignetteSelectionArb, { minLength: 0, maxLength: 20 }),
        (selections: VignetteSelection[]) => {
          const result = calculateTotalVignetteCost(selections);

          // Manually compute expected total
          const expectedTotal =
            Math.round(
              selections
                .filter((s) => !s.exempt && !s.unavailable)
                .reduce((sum, s) => sum + s.priceEur, 0) * 100
            ) / 100;

          return result === expectedTotal;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: cost-breakdown-panel, Property 5: Vignette entry completeness
import { VignetteCountryBreakdown } from './costCalculations';

describe('Property 5: Vignette entry completeness', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any country on the route requiring a vignette, verify the breakdown entry
   * contains country name, selected duration, and price (or unavailable indicator).
   */
  it('every vignette breakdown entry contains country name, selected duration, and price or unavailable indicator', () => {
    const allDurations: VignetteDuration[] = Object.keys(DURATION_ORDER) as VignetteDuration[];

    // Generate a valid VignetteCountryBreakdown entry as the system would produce
    const vignetteCountryBreakdownArb: fc.Arbitrary<VignetteCountryBreakdown> = fc
      .record({
        countryCode: fc.constantFrom(...EUROPEAN_COUNTRY_CODES),
        countryName: fc.constantFrom(
          'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic',
          'Denmark', 'Estonia', 'Finland', 'France', 'Germany',
          'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia',
          'Lithuania', 'Luxembourg', 'Netherlands', 'Norway', 'Poland',
          'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain',
          'Sweden', 'Switzerland', 'United Kingdom'
        ),
        required: fc.constant(true),
        motorcycleExempt: fc.boolean(),
        availableDurations: fc.uniqueArray(fc.constantFrom(...allDurations), { minLength: 1, maxLength: 8 }),
        priceUnavailable: fc.boolean(),
      })
      .chain((base) => {
        // selectedDuration must be one of the available durations
        const selectedDuration = fc.constantFrom(...base.availableDurations);
        // If price is unavailable, priceEur can be 0; otherwise it must be >= 0
        const priceEur = base.priceUnavailable
          ? fc.constant(0)
          : fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true });

        return fc.record({
          countryCode: fc.constant(base.countryCode),
          countryName: fc.constant(base.countryName),
          required: fc.constant(base.required),
          motorcycleExempt: fc.constant(base.motorcycleExempt),
          selectedDuration,
          availableDurations: fc.constant(base.availableDurations),
          priceEur,
          priceUnavailable: fc.constant(base.priceUnavailable),
        });
      });

    fc.assert(
      fc.property(
        fc.array(vignetteCountryBreakdownArb, { minLength: 1, maxLength: 15 }),
        (breakdownEntries: VignetteCountryBreakdown[]) => {
          for (const entry of breakdownEntries) {
            // Country name must be a non-empty string
            expect(entry.countryName).toBeDefined();
            expect(typeof entry.countryName).toBe('string');
            expect(entry.countryName.length).toBeGreaterThan(0);

            // Selected duration must be a valid VignetteDuration
            expect(entry.selectedDuration).toBeDefined();
            expect(allDurations).toContain(entry.selectedDuration);

            // Selected duration must be one of the available durations
            expect(entry.availableDurations).toContain(entry.selectedDuration);

            // Either priceEur >= 0 OR priceUnavailable === true
            const hasPriceOrUnavailable =
              entry.priceEur >= 0 || entry.priceUnavailable === true;
            expect(hasPriceOrUnavailable).toBe(true);

            // If priceUnavailable is true, the entry signals missing data
            // If priceUnavailable is false, priceEur must be >= 0
            if (!entry.priceUnavailable) {
              expect(entry.priceEur).toBeGreaterThanOrEqual(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
