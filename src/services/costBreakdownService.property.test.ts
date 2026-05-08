/**
 * Property-based tests for costBreakdownService.
 *
 * Property 4: Duration override lookup correctness
 * **Validates: Requirements 4.3**
 *
 * For any country with available vignette durations and a valid duration override,
 * the service SHALL return the price corresponding to the overridden duration
 * (not the default shortest duration's price).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { VignetteDuration, DURATION_ORDER, VignettePrice, RouteVignetteRequirement } from '../models/vignette';
import { VehicleType, FuelType } from '../models/vehicleProfile';

// Mock all external dependencies
vi.mock('./routeService');
vi.mock('./vehicleProfileService');
vi.mock('./fuelPriceService');
vi.mock('./vignetteService');
vi.mock('./tollService');

import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice } from './fuelPriceService';
import { getRouteVignetteRequirements, getPrices } from './vignetteService';
import { getTollsForRoute } from './tollService';
import { getCostBreakdown } from './costBreakdownService';

const mockedGetRoute = vi.mocked(getRoute);
const mockedGetProfile = vi.mocked(getProfile);
const mockedGetPrice = vi.mocked(getPrice);
const mockedGetRouteVignetteRequirements = vi.mocked(getRouteVignetteRequirements);
const mockedGetPrices = vi.mocked(getPrices);
const mockedGetTollsForRoute = vi.mocked(getTollsForRoute);

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const ALL_DURATIONS: VignetteDuration[] = [
  '1-day', '10-day', '1-week', '1-month', '2-month', '3-month', '6-month', '1-year',
];

const COUNTRY_CODES = ['AT', 'BG', 'CZ', 'HU', 'RO', 'SK', 'SI', 'CH', 'MD'];

/**
 * Generates a subset of durations with at least 2 entries (so override can differ from default).
 */
const arbDurations = fc
  .subarray(ALL_DURATIONS, { minLength: 2, maxLength: ALL_DURATIONS.length })
  .map((durations) => [...durations].sort((a, b) => DURATION_ORDER[a] - DURATION_ORDER[b]));

/**
 * Generates a country code from the known vignette countries.
 */
const arbCountryCode = fc.constantFrom(...COUNTRY_CODES);

/**
 * Generates a price for a given duration. Prices are positive EUR values.
 */
const arbPrice = fc.float({ min: 0.5, max: 200, noNaN: true }).map((v) => Math.round(v * 100) / 100);

/**
 * Generates a complete test scenario: a country with multiple durations and prices,
 * plus a valid override duration that is NOT the shortest.
 */
const arbDurationOverrideScenario = fc
  .tuple(arbCountryCode, arbDurations)
  .chain(([countryCode, durations]) => {
    // The shortest duration is durations[0] (sorted by DURATION_ORDER)
    // Pick an override that is NOT the shortest
    const nonShortestDurations = durations.slice(1);
    return fc
      .tuple(
        fc.constant(countryCode),
        fc.constant(durations),
        fc.constantFrom(...nonShortestDurations),
        // Generate a unique price for each duration
        fc.tuple(...durations.map(() => arbPrice))
      )
      .map(([cc, durs, overrideDuration, prices]) => ({
        countryCode: cc,
        durations: durs,
        overrideDuration,
        prices: durs.map((d, i) => ({
          duration: d,
          price_eur: prices[i],
        })),
      }));
  });

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('costBreakdownService - Property 4: Duration override lookup correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when a duration override is provided, the vignette entry uses the overridden duration price', async () => {
    await fc.assert(
      fc.asyncProperty(arbDurationOverrideScenario, async (scenario) => {
        const { countryCode, durations, overrideDuration, prices } = scenario;

        // Setup mocks for a minimal route
        mockedGetRoute.mockResolvedValue({
          route: {
            id: 'route-1',
            user_id: 'user-1',
            name: 'Test Route',
            total_distance_km: 100,
            total_duration_seconds: 3600,
            polyline_encoded: null,
            status: 'calculated',
            created_at: new Date(),
            updated_at: new Date(),
          },
          waypoints: [
            {
              id: 'wp-1', route_id: 'route-1', position: 0, label: null,
              latitude: 48.2, longitude: 16.3, place_id: null,
              formatted_address: null, waypoint_type: 'origin',
            },
            {
              id: 'wp-2', route_id: 'route-1', position: 1, label: null,
              latitude: 47.5, longitude: 19.0, place_id: null,
              formatted_address: null, waypoint_type: 'destination',
            },
          ],
          segments: [
            {
              id: 'seg-1', route_id: 'route-1', segment_index: 0,
              start_waypoint_id: 'wp-1', end_waypoint_id: 'wp-2',
              distance_km: 100, duration_seconds: 3600,
              country_code: countryCode, polyline_encoded: null,
            },
          ],
        } as any);

        mockedGetProfile.mockResolvedValue({
          id: 'vehicle-1',
          user_id: 'user-1',
          name: 'Test Car',
          vehicle_type: 'car' as VehicleType,
          fuel_type: 'diesel' as FuelType,
          tank_capacity_liters: 50,
          consumption_per_100km: 6,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Fuel price mock (not relevant to this property but needed for the service)
        mockedGetPrice.mockResolvedValue({
          id: 'fp-1',
          country_code: countryCode,
          fuel_type: 'diesel',
          price_per_liter_eur: 1.5,
          source: 'fuel-scraper',
          fetched_at: new Date(),
          expires_at: new Date(),
        } as any);

        // Toll service returns no tolls (not relevant to this property)
        mockedGetTollsForRoute.mockResolvedValue({
          bridgeTolls: [],
          highwayTolls: [],
        });

        // Vignette requirements: the country requires a vignette with the generated durations/prices
        const vignetteRequirement: RouteVignetteRequirement = {
          countryCode,
          countryName: countryCode,
          required: true,
          motorcycleExempt: false,
          availableDurations: durations,
          prices: prices.map((p, i) => ({
            id: `price-${i}`,
            vignette_country_id: `vc-${countryCode}`,
            vehicle_type: 'car' as VehicleType,
            duration: p.duration,
            price_eur: p.price_eur,
            source: 'i-vignette' as const,
            fetched_at: new Date(),
            expires_at: new Date(),
          })),
        };

        mockedGetRouteVignetteRequirements.mockResolvedValue([vignetteRequirement]);
        mockedGetPrices.mockResolvedValue(
          vignetteRequirement.prices
        );

        // Call getCostBreakdown with the duration override
        const durationOverrides = { [countryCode]: overrideDuration };
        const result = await getCostBreakdown('route-1', 'vehicle-1', durationOverrides);

        // Find the vignette entry for our country
        const vignetteEntry = result.roadCosts.vignettes.find(
          (v) => v.countryCode === countryCode
        );

        expect(vignetteEntry).toBeDefined();

        // The duration should be the overridden one
        expect(vignetteEntry!.duration).toBe(overrideDuration);

        // The cost should match the price for the overridden duration
        const expectedPrice = prices.find((p) => p.duration === overrideDuration)!.price_eur;
        expect(vignetteEntry!.cost).toBe(expectedPrice);

        // Verify it's NOT the shortest duration's price (unless they happen to be equal)
        const shortestDuration = durations[0];
        if (overrideDuration !== shortestDuration) {
          // The duration used should not be the shortest
          expect(vignetteEntry!.duration).not.toBe(shortestDuration);
        }
      }),
      { numRuns: 100 }
    );
  });
});
