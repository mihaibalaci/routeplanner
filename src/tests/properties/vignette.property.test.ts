import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn(),
}));

// Mock the redis module
vi.mock('../../utils/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(true),
  cacheDelete: vi.fn(),
  CACHE_KEYS: {
    fuelPrice: (country: string, fuelType: string) =>
      `fuel:price:${country}:${fuelType}`,
    vignettePrices: (country: string, vehicleType: string) =>
      `vignette:prices:${country}:${vehicleType}`,
    vignetteCountries: () => `vignette:countries`,
    vignetteRoute: (routeId: string) => `vignette:route:${routeId}`,
  },
  CACHE_TTL: {
    FUEL_PRICE: 6 * 60 * 60,
    VIGNETTE_PRICES: 24 * 60 * 60,
    VIGNETTE_COUNTRIES: 24 * 60 * 60,
    VIGNETTE_ROUTE: 60 * 60,
  },
}));

// Mock the routeService module
vi.mock('../../services/routeService', () => ({
  getRoute: vi.fn(),
}));

// Mock the vehicleProfileService module
vi.mock('../../services/vehicleProfileService', () => ({
  getProfile: vi.fn(),
}));

// Mock the fuelPriceService module
vi.mock('../../services/fuelPriceService', () => ({
  getPrice: vi.fn(),
}));

import { query } from '../../utils/database';
import { cacheGet, cacheSet } from '../../utils/redis';
import { getRoute } from '../../services/routeService';
import { getProfile } from '../../services/vehicleProfileService';
import { getPrice } from '../../services/fuelPriceService';
import { RouteSegment } from '../../models/route';
import { VehicleType } from '../../models/vehicleProfile';
import {
  VIGNETTE_COUNTRY_CODES,
  MOTORCYCLE_EXEMPT_COUNTRIES,
  VignetteDuration,
  VALID_VIGNETTE_DURATIONS,
} from '../../models/vignette';
import type { VignetteScraperSource, ScrapedVignettePrice } from '../../services/vignetteScraperService';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIGNETTE_CODES = [...VIGNETTE_COUNTRY_CODES];
const NON_VIGNETTE_CODES = ['DE', 'FR', 'IT', 'ES', 'PL', 'NL', 'BE', 'PT', 'SE', 'NO'];
const ALL_COUNTRY_CODES = [...VIGNETTE_CODES, ...NON_VIGNETTE_CODES];

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const countryCodeArb = fc.constantFrom(...ALL_COUNTRY_CODES);
const vignetteCountryArb = fc.constantFrom(...VIGNETTE_CODES);
const durationArb = fc.constantFrom<VignetteDuration>(...VALID_VIGNETTE_DURATIONS);

const routeSegmentArb = (ccArb?: fc.Arbitrary<string>): fc.Arbitrary<RouteSegment> => {
  const cc = ccArb || countryCodeArb;
  return fc.record({
    id: fc.uuid(),
    route_id: fc.uuid(),
    segment_index: fc.nat({ max: 100 }),
    start_waypoint_id: fc.option(fc.uuid(), { nil: null }),
    end_waypoint_id: fc.option(fc.uuid(), { nil: null }),
    distance_km: fc.double({ min: 10, max: 500, noNaN: true }),
    duration_seconds: fc.integer({ min: 600, max: 36000 }),
    country_code: cc,
    polyline_encoded: fc.constant(null),
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVignetteCountryRows() {
  const countryNames: Record<string, string> = {
    AT: 'Austria', BG: 'Bulgaria', CZ: 'Czech Republic', HU: 'Hungary',
    MD: 'Moldova', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia', CH: 'Switzerland',
  };
  return VIGNETTE_CODES.map((code, idx) => ({
    id: `vc-${idx}`,
    country_code: code,
    country_name: countryNames[code] || code,
    motorcycle_exempt: MOTORCYCLE_EXEMPT_COUNTRIES.has(code),
    available_durations: JSON.stringify(['10-day', '1-month', '1-year']),
    active: true,
    updated_at: new Date(),
  }));
}

function setupVignetteDbMocks(
  _segments: RouteSegment[],
  priceEur: number = 15.0,
  duration: string = '10-day'
) {
  const countryRows = makeVignetteCountryRows();

  (query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM vignette_countries WHERE active')) {
      return { rows: countryRows, rowCount: countryRows.length };
    }
    if (sql.includes('FROM vignette_prices vp')) {
      // Return a price for the requested country/vehicle_type
      return {
        rows: [{
          id: 'vp-1',
          vignette_country_id: 'vc-1',
          vehicle_type: params?.[1] || 'car',
          duration,
          price_eur: priceEur,
          source: 'i-vignette',
          fetched_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO trip_costs')) {
      // We need to compute the actual values for the INSERT return
      return {
        rows: [{
          id: 'tc-1',
          route_id: params?.[0] || 'route-id',
          vehicle_profile_id: params?.[1] || 'vehicle-id',
          total_cost_eur: String(params?.[2] || 0),
          total_fuel_liters: String(params?.[3] || 0),
          country_breakdown: params?.[4] || '[]',
          prices_outdated: params?.[5] || false,
          calculated_at: new Date(),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
}


// ─── Property 33: Vignette Country Detection with Motorcycle Exemption ────────
// Route segments crossing vignette countries (AT, BG, CZ, HU, MD, RO, SK, SI, CH)
// are detected; motorcycle exemptions applied for RO, BG.
// **Validates: Requirements 16.1, 16.6**

describe('Property 33: Vignette Country Detection with Motorcycle Exemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('detects vignette countries from route segments and applies motorcycle exemptions for RO, BG', async () => {
    /**
     * **Validates: Requirements 16.1, 16.6**
     */
    const { getRouteVignetteRequirements } = await import('../../services/vignetteService');

    await fc.assert(
      fc.asyncProperty(
        fc.array(routeSegmentArb(), { minLength: 1, maxLength: 5 }),
        async (segments) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          const routeId = 'test-route-id';

          // Mock getRoute to return our segments
          (getRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
            route: { id: routeId, user_id: 'u1', status: 'calculated' },
            waypoints: [],
            segments,
          });

          // Mock DB queries for vignette countries and prices
          setupVignetteDbMocks(segments);

          // Call with motorcycle vehicle type
          const requirements = await getRouteVignetteRequirements(routeId, 'motorcycle');

          // Get unique countries from segments that are vignette countries
          const countriesOnRoute = new Set(segments.map((s) => s.country_code));
          const expectedVignetteCountries = [...countriesOnRoute].filter((c) =>
            VIGNETTE_COUNTRY_CODES.has(c)
          );

          // All vignette countries on the route should be in requirements
          for (const code of expectedVignetteCountries) {
            const req = requirements.find((r) => r.countryCode === code);
            expect(req).toBeDefined();

            // RO and BG should be marked as exempt for motorcycles
            if (MOTORCYCLE_EXEMPT_COUNTRIES.has(code)) {
              expect(req!.required).toBe(false);
              expect(req!.motorcycleExempt).toBe(true);
            } else {
              expect(req!.required).toBe(true);
            }
          }

          // Non-vignette countries should NOT appear in requirements
          const nonVignetteOnRoute = [...countriesOnRoute].filter(
            (c) => !VIGNETTE_COUNTRY_CODES.has(c)
          );
          for (const code of nonVignetteOnRoute) {
            const req = requirements.find((r) => r.countryCode === code);
            expect(req).toBeUndefined();
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});


// ─── Property 34: Total Trip Cost Includes Vignettes ──────────────────────────
// Total trip cost SHALL equal fuel cost + vignette cost, rounded to 2 decimal places.
// **Validates: Requirements 16.3**

describe('Property 34: Total Trip Cost Includes Vignettes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('total_cost_eur equals fuel_cost_eur + vignette_cost_eur within 0.01 tolerance', async () => {
    /**
     * **Validates: Requirements 16.3**
     */
    const { calculateTotalCost } = await import('../../services/tripCostService');

    await fc.assert(
      fc.asyncProperty(
        fc.array(routeSegmentArb(vignetteCountryArb), { minLength: 1, maxLength: 3 }),
        fc.double({ min: 1.0, max: 3.0, noNaN: true }),
        fc.double({ min: 5, max: 50, noNaN: true }),
        async (segments, fuelPricePerLiter, consumption) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          const routeId = 'test-route-id';
          const vehicleId = 'test-vehicle-id';

          // Mock getRoute
          (getRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
            route: { id: routeId, user_id: 'u1', status: 'calculated' },
            waypoints: [],
            segments,
          });

          // Mock getProfile
          (getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: vehicleId,
            user_id: 'u1',
            name: 'Test Car',
            vehicle_type: 'car' as VehicleType,
            fuel_type: 'diesel',
            tank_capacity_liters: 60,
            consumption_per_100km: consumption,
            created_at: new Date(),
            updated_at: new Date(),
          });

          // Mock getPrice for fuel prices
          (getPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
            country_code: 'XX',
            fuel_type: 'diesel',
            price_per_liter_eur: fuelPricePerLiter,
            source: 'cieloweb',
            fetched_at: new Date(),
            expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
          });

          // Mock DB queries
          setupVignetteDbMocks(segments, 15.0, '10-day');

          const result = await calculateTotalCost(routeId, vehicleId, {});

          // Property: total_cost_eur = fuel_cost_eur + vignette_cost_eur (within 0.01)
          const expectedTotal = Math.round(
            (result.fuel_cost_eur + result.vignette_cost_eur) * 100
          ) / 100;
          expect(Math.abs(result.total_cost_eur - expectedTotal)).toBeLessThanOrEqual(0.01);
        }
      ),
      { numRuns: 5 }
    );
  });
});


// ─── Property 35: Vignette Price Fallback Chain ───────────────────────────────
// Sources attempted in order (i-vignette.com → vintrica.com), first success used.
// **Validates: Requirements 16.4**

describe('Property 35: Vignette Price Fallback Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('sources are attempted in order and the first successful source is used', async () => {
    /**
     * **Validates: Requirements 16.4**
     */
    const { scrapeVignettePrices } = await import('../../services/vignetteScraperService');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1 }),
        async (successIndex) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          // Mock DB: return a country ID for each vignette country
          (query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id FROM vignette_countries')) {
              return { rows: [{ id: 'vc-test-id' }], rowCount: 1 };
            }
            if (sql.includes('INSERT INTO vignette_prices')) {
              return { rows: [], rowCount: 1 };
            }
            if (sql.includes('SELECT vp.vehicle_type')) {
              return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
          });

          const sourceNames: Array<'i-vignette' | 'vintrica'> = ['i-vignette', 'vintrica'];
          const callOrder: string[] = [];

          // Build mock scrapers: scrapers before successIndex throw, the one at successIndex succeeds
          const scrapers: VignetteScraperSource[] = sourceNames.map((name, idx) => ({
            name,
            scrape: vi.fn(async (_country: string, _vehicleType: VehicleType) => {
              callOrder.push(name);
              if (idx < successIndex) {
                throw new Error(`${name} unavailable`);
              }
              if (idx === successIndex) {
                return [{ duration: '10-day', price_eur: 15.0 }] as ScrapedVignettePrice[];
              }
              return [{ duration: '10-day', price_eur: 20.0 }] as ScrapedVignettePrice[];
            }),
          }));

          await scrapeVignettePrices(scrapers);

          // Verify: for the first country/vehicleType combo, scrapers before successIndex
          // were called, and the successful one was called.
          const firstComboCallOrder = callOrder.slice(0, successIndex + 1);
          const expectedOrder = sourceNames.slice(0, successIndex + 1);
          expect(firstComboCallOrder).toEqual(expectedOrder);

          // Verify that the DB persist was called with the correct source
          const queryMock = query as ReturnType<typeof vi.fn>;
          const insertCalls = queryMock.mock.calls.filter(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO vignette_prices')
          );
          if (insertCalls.length > 0) {
            // The source parameter (5th param, index 4) should be the successful source
            const firstInsertSource = insertCalls[0][1][4];
            expect(firstInsertSource).toBe(sourceNames[successIndex]);
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});

// ─── Property 37: Vignette Price Retention on Total Failure ───────────────────
// Existing cached prices unchanged when all sources fail.
// **Validates: Requirements 16.7**

describe('Property 37: Vignette Price Retention on Total Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('when all scrapers fail, no new prices are cached or persisted', async () => {
    /**
     * **Validates: Requirements 16.7**
     */
    const { scrapeVignettePrices } = await import('../../services/vignetteScraperService');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (numScrapers) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          // Mock DB: return a country ID for each vignette country
          (query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id FROM vignette_countries')) {
              return { rows: [{ id: 'vc-test-id' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          });

          // Create scrapers that ALL throw errors
          const scrapers: VignetteScraperSource[] = Array.from(
            { length: Math.min(numScrapers, 2) },
            (_, i) => ({
              name: (i === 0 ? 'i-vignette' : 'vintrica') as 'i-vignette' | 'vintrica',
              scrape: vi.fn(async () => {
                throw new Error(`Source ${i} is down`);
              }),
            })
          );

          await scrapeVignettePrices(scrapers);

          // Verify: cacheSet was never called (no prices cached)
          const cacheSetMock = cacheSet as ReturnType<typeof vi.fn>;
          expect(cacheSetMock).not.toHaveBeenCalled();

          // Verify: no INSERT INTO vignette_prices was called
          const queryMock = query as ReturnType<typeof vi.fn>;
          const insertCalls = queryMock.mock.calls.filter(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO vignette_prices')
          );
          expect(insertCalls).toHaveLength(0);
        }
      ),
      { numRuns: 5 }
    );
  });
});


// ─── Property 36: Vignette Duration Preference Respected ──────────────────────
// Cost for each country uses selected duration price; defaults to shortest available duration.
// **Validates: Requirements 16.5**

describe('Property 36: Vignette Duration Preference Respected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('uses selected duration price when preference is provided, defaults to shortest otherwise', async () => {
    /**
     * **Validates: Requirements 16.5**
     */
    const { calculateVignetteCost } = await import('../../services/vignetteService');

    await fc.assert(
      fc.asyncProperty(
        // Generate 1-3 non-exempt vignette countries
        fc.array(
          fc.constantFrom('AT', 'CZ', 'HU', 'SK', 'SI', 'CH'),
          { minLength: 2, maxLength: 3 }
        ),
        durationArb,
        async (countryCodes, preferredDuration) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          const uniqueCountries = [...new Set(countryCodes)];
          if (uniqueCountries.length < 2) return; // Need at least 2 countries

          const routeId = 'test-route-id';
          const segments: RouteSegment[] = uniqueCountries.map((cc, idx) => ({
            id: `seg-${idx}`,
            route_id: routeId,
            segment_index: idx,
            start_waypoint_id: null,
            end_waypoint_id: null,
            distance_km: 100,
            duration_seconds: 3600,
            country_code: cc,
            polyline_encoded: null,
          }));

          // Mock getRoute
          (getRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
            route: { id: routeId, user_id: 'u1', status: 'calculated' },
            waypoints: [],
            segments,
          });

          // Mock DB queries - return multiple durations per country
          const countryRows = makeVignetteCountryRows();
          (query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: any[]) => {
            if (sql.includes('FROM vignette_countries WHERE active')) {
              return { rows: countryRows, rowCount: countryRows.length };
            }
            if (sql.includes('FROM vignette_prices vp') && params) {
              const cc = params[0] as string;
              // First country gets the preferred duration + '10-day' + '1-month'
              // Other countries only get '10-day' and '1-month'
              const isFirstCountry = cc === uniqueCountries[0];
              const durations = [
                { duration: '10-day', price_eur: 15.0 },
                { duration: '1-month', price_eur: 30.0 },
              ];
              if (isFirstCountry && preferredDuration !== '10-day' && preferredDuration !== '1-month') {
                durations.push({ duration: preferredDuration, price_eur: 25.0 });
              }
              return {
                rows: durations.map((d, idx) => ({
                  id: `vp-${idx}`,
                  vignette_country_id: 'vc-1',
                  vehicle_type: params[1] || 'car',
                  duration: d.duration,
                  price_eur: d.price_eur,
                  source: 'i-vignette',
                  fetched_at: new Date(),
                  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
                })),
                rowCount: durations.length,
              };
            }
            return { rows: [], rowCount: 0 };
          });

          // Set duration preference for the first country only
          const durationPreferences: Record<string, VignetteDuration> = {};
          durationPreferences[uniqueCountries[0]] = preferredDuration;

          const result = await calculateVignetteCost(routeId, 'car', durationPreferences);

          // Verify: the first country uses the preferred duration
          const firstCountryBreakdown = result.countryBreakdown.find(
            (b) => b.countryCode === uniqueCountries[0]
          );
          expect(firstCountryBreakdown).toBeDefined();
          expect(firstCountryBreakdown!.selectedDuration).toBe(preferredDuration);

          // Verify: countries without preference use shortest available duration ('10-day')
          for (let i = 1; i < uniqueCountries.length; i++) {
            const breakdown = result.countryBreakdown.find(
              (b) => b.countryCode === uniqueCountries[i]
            );
            if (breakdown) {
              // Should default to '10-day' which is the shortest in our mock data
              expect(breakdown.selectedDuration).toBe('10-day');
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 38: Vignette Country Breakdown Sums to Total ────────────────────
// Sum of per-country vignette costs equals total vignette cost within 0.01 EUR tolerance.
// **Validates: Requirements 16.8**

describe('Property 38: Vignette Country Breakdown Sums to Total', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('sum of per-country vignette costs equals totalVignetteCostEur within 0.01 tolerance', async () => {
    /**
     * **Validates: Requirements 16.8**
     */
    const { calculateVignetteCost } = await import('../../services/vignetteService');

    await fc.assert(
      fc.asyncProperty(
        // Generate 1-4 non-exempt vignette countries
        fc.array(
          fc.constantFrom('AT', 'CZ', 'HU', 'MD', 'SK', 'SI', 'CH'),
          { minLength: 1, maxLength: 4 }
        ),
        // Generate random prices for each country (as integers to avoid floating point issues)
        fc.array(fc.integer({ min: 500, max: 10000 }), { minLength: 4, maxLength: 4 }),
        async (countryCodes, pricesCents) => {
          vi.clearAllMocks();
          (cacheGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          (cacheSet as ReturnType<typeof vi.fn>).mockResolvedValue(true);

          const uniqueCountries = [...new Set(countryCodes)];
          const routeId = 'test-route-id';

          const segments: RouteSegment[] = uniqueCountries.map((cc, idx) => ({
            id: `seg-${idx}`,
            route_id: routeId,
            segment_index: idx,
            start_waypoint_id: null,
            end_waypoint_id: null,
            distance_km: 100,
            duration_seconds: 3600,
            country_code: cc,
            polyline_encoded: null,
          }));

          // Mock getRoute
          (getRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
            route: { id: routeId, user_id: 'u1', status: 'calculated' },
            waypoints: [],
            segments,
          });

          // Mock DB queries with per-country prices
          const countryRows = makeVignetteCountryRows();
          (query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: any[]) => {
            if (sql.includes('FROM vignette_countries WHERE active')) {
              return { rows: countryRows, rowCount: countryRows.length };
            }
            if (sql.includes('FROM vignette_prices vp') && params) {
              const cc = params[0] as string;
              const idx = uniqueCountries.indexOf(cc);
              const priceEur = idx >= 0 && idx < pricesCents.length
                ? pricesCents[idx] / 100
                : 10.0;
              return {
                rows: [{
                  id: `vp-${idx}`,
                  vignette_country_id: `vc-${idx}`,
                  vehicle_type: params[1] || 'car',
                  duration: '10-day',
                  price_eur: priceEur,
                  source: 'i-vignette',
                  fetched_at: new Date(),
                  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
                }],
                rowCount: 1,
              };
            }
            return { rows: [], rowCount: 0 };
          });

          const result = await calculateVignetteCost(routeId, 'car', {});

          // Property: sum of breakdown costs equals total within 0.01 tolerance
          const breakdownSum = result.countryBreakdown.reduce(
            (sum, entry) => sum + entry.costEur,
            0
          );
          const roundedBreakdownSum = Math.round(breakdownSum * 100) / 100;

          expect(Math.abs(roundedBreakdownSum - result.totalVignetteCostEur)).toBeLessThanOrEqual(0.01);
        }
      ),
      { numRuns: 10 }
    );
  });
});
