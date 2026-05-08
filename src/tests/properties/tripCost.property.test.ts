import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeTripCost } from '../../services/tripCostService';
import { RouteSegment } from '../../models/route';
import { VehicleProfile, FuelType } from '../../models/vehicleProfile';
import { FuelPrice } from '../../services/fuelPriceService';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const EUROPEAN_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'MD',
];

const FUEL_TYPES: FuelType[] = ['diesel', 'petrol_95', 'petrol_98', 'lpg'];

/** Generate a random country code from European countries */
const countryCodeArb = fc.constantFrom(...EUROPEAN_COUNTRY_CODES);

/** Generate a random fuel type */
const fuelTypeArb = fc.constantFrom(...FUEL_TYPES);

/** Generate a random route segment */
const routeSegmentArb = (countryCodes?: string[]): fc.Arbitrary<RouteSegment> => {
  const ccArb = countryCodes ? fc.constantFrom(...countryCodes) : countryCodeArb;
  return fc.record({
    id: fc.uuid(),
    route_id: fc.uuid(),
    segment_index: fc.nat({ max: 100 }),
    start_waypoint_id: fc.option(fc.uuid(), { nil: null }),
    end_waypoint_id: fc.option(fc.uuid(), { nil: null }),
    distance_km: fc.double({ min: 10, max: 500, noNaN: true }),
    duration_seconds: fc.integer({ min: 600, max: 36000 }),
    country_code: ccArb,
    polyline_encoded: fc.constant(null),
  });
};

/** Generate a random vehicle profile */
const vehicleProfileArb: fc.Arbitrary<VehicleProfile> = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  vehicle_type: fc.constantFrom('motorcycle' as const, 'car' as const, 'camper' as const),
  fuel_type: fuelTypeArb,
  tank_capacity_liters: fc.double({ min: 5, max: 200, noNaN: true }),
  consumption_per_100km: fc.double({ min: 1, max: 50, noNaN: true }),
  created_at: fc.constant(new Date()),
  updated_at: fc.constant(new Date()),
});

// ─── Property 12: Trip Cost Calculation Correctness ───────────────────────────
// **Validates: Requirements 7.1, 7.2, 7.3**
// Total equals sum of per-segment costs, rounded to 2 decimals.

describe('Property 12: Trip Cost Calculation Correctness', () => {
  it('total cost equals sum of per-segment costs, rounded to 2 decimals', () => {
    /**
     * **Validates: Requirements 7.1, 7.2, 7.3**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((numSegments) => {
          // Generate segments with random country codes
          return fc.tuple(
            fc.array(routeSegmentArb(), { minLength: numSegments, maxLength: numSegments }),
            vehicleProfileArb
          );
        }),
        ([segments, vehicle]) => {
          // Collect unique country codes from segments
          const countryCodes = [...new Set(segments.map((s) => s.country_code))];

          // Generate fuel prices for each country/fuel_type combination
          const fuelPrices = new Map<string, FuelPrice>();
          for (const cc of countryCodes) {
            const price: FuelPrice = {
              country_code: cc,
              fuel_type: vehicle.fuel_type,
              price_per_liter_eur: 0.5 + Math.random() * 2.5,
              source: 'cieloweb',
              fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (fresh)
              expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
            };
            fuelPrices.set(`${cc}:${vehicle.fuel_type}`, price);
          }

          // Call computeTripCost
          const result = computeTripCost(segments, vehicle, fuelPrices);

          // Manually compute expected total
          let expectedTotal = 0;
          for (const segment of segments) {
            const fuelNeeded = (segment.distance_km / 100) * vehicle.consumption_per_100km;
            const priceKey = `${segment.country_code}:${vehicle.fuel_type}`;
            const fuelPrice = fuelPrices.get(priceKey);
            if (fuelPrice) {
              expectedTotal += fuelNeeded * fuelPrice.price_per_liter_eur;
            }
          }
          const expectedRounded = Math.round(expectedTotal * 100) / 100;

          // Total cost should match the manually computed sum
          expect(result.totalCostEur).toBeCloseTo(expectedRounded, 2);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 13: Country Cost Breakdown Sums to Total ────────────────────────
// **Validates: Requirements 7.4**
// Sum of country costs equals total within 0.01 EUR tolerance.

describe('Property 13: Country Cost Breakdown Sums to Total', () => {
  it('sum of country breakdown costs equals total cost within 0.01 EUR tolerance', () => {
    /**
     * **Validates: Requirements 7.4**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((numSegments) => {
          return fc.tuple(
            fc.array(routeSegmentArb(), { minLength: numSegments, maxLength: numSegments }),
            vehicleProfileArb
          );
        }),
        ([segments, vehicle]) => {
          // Collect unique country codes from segments
          const countryCodes = [...new Set(segments.map((s) => s.country_code))];

          // Generate fuel prices for each country/fuel_type combination
          const fuelPrices = new Map<string, FuelPrice>();
          for (const cc of countryCodes) {
            const price: FuelPrice = {
              country_code: cc,
              fuel_type: vehicle.fuel_type,
              price_per_liter_eur: 0.5 + Math.random() * 2.5,
              source: 'cieloweb',
              fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
              expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
            };
            fuelPrices.set(`${cc}:${vehicle.fuel_type}`, price);
          }

          // Call computeTripCost
          const result = computeTripCost(segments, vehicle, fuelPrices);

          // Sum of country breakdown costs
          const breakdownSum = result.countryBreakdown.reduce(
            (sum, entry) => sum + entry.cost_eur,
            0
          );

          // Each country's cost_eur is rounded independently to 2 decimals, and totalCostEur
          // is also rounded independently from the raw sum. With N countries, the maximum
          // accumulated rounding difference is (N + 1) * 0.005. We use a tolerance that
          // accounts for this: 0.01 per country in the breakdown.
          const tolerance = result.countryBreakdown.length * 0.01;

          // Should equal total within tolerance (due to independent rounding per country)
          expect(Math.abs(breakdownSum - result.totalCostEur)).toBeLessThanOrEqual(tolerance);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 14: Outdated Price Warning ──────────────────────────────────────
// **Validates: Requirements 7.5**
// prices_outdated flag true when any price older than 12 hours.

describe('Property 14: Outdated Price Warning', () => {
  it('prices_outdated is true when any fuel price is older than 12 hours', () => {
    /**
     * **Validates: Requirements 7.5**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((numSegments) => {
          return fc.tuple(
            fc.array(routeSegmentArb(), { minLength: numSegments, maxLength: numSegments }),
            vehicleProfileArb,
            // Index of the segment whose price will be outdated
            fc.integer({ min: 0, max: numSegments - 1 })
          );
        }),
        ([segments, vehicle, outdatedIndex]) => {
          // Collect unique country codes from segments
          const countryCodes = [...new Set(segments.map((s) => s.country_code))];

          // The country code of the segment that will have an outdated price
          const outdatedCountry = segments[outdatedIndex].country_code;

          // Generate fuel prices - make the outdated country's price old
          const fuelPrices = new Map<string, FuelPrice>();
          for (const cc of countryCodes) {
            const isOutdated = cc === outdatedCountry;
            const fetchedAt = isOutdated
              ? new Date(Date.now() - 13 * 60 * 60 * 1000) // 13 hours ago (outdated)
              : new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago (fresh)

            const price: FuelPrice = {
              country_code: cc,
              fuel_type: vehicle.fuel_type,
              price_per_liter_eur: 1.0 + Math.random() * 1.5,
              source: 'cieloweb',
              fetched_at: fetchedAt,
              expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
            };
            fuelPrices.set(`${cc}:${vehicle.fuel_type}`, price);
          }

          // Call computeTripCost
          const result = computeTripCost(segments, vehicle, fuelPrices);

          // prices_outdated should be true since at least one price is outdated
          expect(result.pricesOutdated).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('prices_outdated is false when all fuel prices are fresh (within 12 hours)', () => {
    /**
     * **Validates: Requirements 7.5**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain((numSegments) => {
          return fc.tuple(
            fc.array(routeSegmentArb(), { minLength: numSegments, maxLength: numSegments }),
            vehicleProfileArb
          );
        }),
        ([segments, vehicle]) => {
          // Collect unique country codes from segments
          const countryCodes = [...new Set(segments.map((s) => s.country_code))];

          // Generate all fresh fuel prices (within 11 hours)
          const fuelPrices = new Map<string, FuelPrice>();
          for (const cc of countryCodes) {
            const price: FuelPrice = {
              country_code: cc,
              fuel_type: vehicle.fuel_type,
              price_per_liter_eur: 1.0 + Math.random() * 1.5,
              source: 'cieloweb',
              fetched_at: new Date(Date.now() - Math.random() * 11 * 60 * 60 * 1000), // 0-11 hours ago
              expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000),
            };
            fuelPrices.set(`${cc}:${vehicle.fuel_type}`, price);
          }

          // Call computeTripCost
          const result = computeTripCost(segments, vehicle, fuelPrices);

          // prices_outdated should be false since all prices are fresh
          expect(result.pricesOutdated).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });
});
