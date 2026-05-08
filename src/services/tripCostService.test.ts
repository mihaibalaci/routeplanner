import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeTripCost,
  isPriceOutdated,
  calculateTripCost,
  getTripCost,
  calculateTotalCost,
} from './tripCostService';
import { FuelPrice } from './fuelPriceService';
import { RouteSegment } from '../models/route';
import { VehicleProfile } from '../models/vehicleProfile';

// Mock dependencies
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

vi.mock('./routeService', () => ({
  getRoute: vi.fn(),
}));

vi.mock('./vehicleProfileService', () => ({
  getProfile: vi.fn(),
}));

vi.mock('./fuelPriceService', () => ({
  getPrice: vi.fn(),
}));

vi.mock('./vignetteService', () => ({
  calculateVignetteCost: vi.fn(),
}));

import { query } from '../utils/database';
import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice } from './fuelPriceService';
import { calculateVignetteCost } from './vignetteService';

const mockQuery = vi.mocked(query);
const mockGetRoute = vi.mocked(getRoute);
const mockGetProfile = vi.mocked(getProfile);
const mockGetPrice = vi.mocked(getPrice);
const mockCalculateVignetteCost = vi.mocked(calculateVignetteCost);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const mockVehicle: VehicleProfile = {
  id: 'vehicle-1',
  user_id: 'user-1',
  name: 'My Car',
  vehicle_type: 'car',
  fuel_type: 'diesel',
  tank_capacity_liters: 60,
  consumption_per_100km: 7.5,
  created_at: new Date(),
  updated_at: new Date(),
};

const freshDate = new Date(); // Now — not outdated

const oldDate = new Date(Date.now() - 13 * 60 * 60 * 1000); // 13 hours ago — outdated

function makeFuelPrice(countryCode: string, fetchedAt: Date = freshDate): FuelPrice {
  return {
    country_code: countryCode,
    fuel_type: 'diesel',
    price_per_liter_eur: 1.5,
    source: 'cieloweb',
    fetched_at: fetchedAt,
    expires_at: new Date(fetchedAt.getTime() + 6 * 60 * 60 * 1000),
  };
}

function makeSegment(countryCode: string, distanceKm: number): RouteSegment {
  return {
    id: `seg-${countryCode}-${distanceKm}`,
    route_id: 'route-1',
    segment_index: 0,
    start_waypoint_id: null,
    end_waypoint_id: null,
    distance_km: distanceKm,
    duration_seconds: distanceKm * 60,
    country_code: countryCode,
    polyline_encoded: null,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isPriceOutdated', () => {
  it('returns false for a price fetched less than 12 hours ago', () => {
    const price = makeFuelPrice('DE', new Date(Date.now() - 11 * 60 * 60 * 1000));
    expect(isPriceOutdated(price)).toBe(false);
  });

  it('returns true for a price fetched more than 12 hours ago', () => {
    const price = makeFuelPrice('DE', oldDate);
    expect(isPriceOutdated(price)).toBe(true);
  });

  it('returns false for a price fetched exactly now', () => {
    const price = makeFuelPrice('DE', new Date());
    expect(isPriceOutdated(price)).toBe(false);
  });

  it('handles fetched_at as string (from JSON deserialization)', () => {
    const price = {
      ...makeFuelPrice('DE', oldDate),
      fetched_at: oldDate.toISOString() as any,
    };
    expect(isPriceOutdated(price)).toBe(true);
  });
});

describe('computeTripCost', () => {
  it('calculates cost for a single segment', () => {
    const segments = [makeSegment('DE', 200)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', makeFuelPrice('DE'));

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    // fuelNeeded = (200 / 100) * 7.5 = 15 liters
    // cost = 15 * 1.5 = 22.50
    expect(result.totalFuelLiters).toBe(15);
    expect(result.totalCostEur).toBe(22.5);
    expect(result.countryBreakdown).toHaveLength(1);
    expect(result.countryBreakdown[0].country_code).toBe('DE');
    expect(result.countryBreakdown[0].cost_eur).toBe(22.5);
    expect(result.pricesOutdated).toBe(false);
  });

  it('calculates cost for multiple segments in the same country', () => {
    const segments = [makeSegment('DE', 100), makeSegment('DE', 150)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', makeFuelPrice('DE'));

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    // fuelNeeded = (100/100)*7.5 + (150/100)*7.5 = 7.5 + 11.25 = 18.75
    // cost = 18.75 * 1.5 = 28.125 → rounded to 28.13
    expect(result.totalFuelLiters).toBe(18.75);
    expect(result.totalCostEur).toBe(28.13);
    expect(result.countryBreakdown).toHaveLength(1);
    expect(result.countryBreakdown[0].country_code).toBe('DE');
  });

  it('calculates cost for multi-country route with per-country breakdown', () => {
    const segments = [makeSegment('DE', 200), makeSegment('AT', 100)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', {
      ...makeFuelPrice('DE'),
      price_per_liter_eur: 1.6,
    });
    fuelPrices.set('AT:diesel', {
      ...makeFuelPrice('AT'),
      price_per_liter_eur: 1.4,
    });

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    // DE: (200/100)*7.5 = 15L, cost = 15*1.6 = 24.00
    // AT: (100/100)*7.5 = 7.5L, cost = 7.5*1.4 = 10.50
    // Total: 34.50
    expect(result.totalCostEur).toBe(34.5);
    expect(result.totalFuelLiters).toBe(22.5);
    expect(result.countryBreakdown).toHaveLength(2);

    const de = result.countryBreakdown.find((c) => c.country_code === 'DE');
    const at = result.countryBreakdown.find((c) => c.country_code === 'AT');
    expect(de?.cost_eur).toBe(24);
    expect(at?.cost_eur).toBe(10.5);
  });

  it('rounds total cost to 2 decimal places', () => {
    const segments = [makeSegment('DE', 33)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', {
      ...makeFuelPrice('DE'),
      price_per_liter_eur: 1.789,
    });

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    // fuelNeeded = (33/100)*7.5 = 2.475
    // cost = 2.475 * 1.789 = 4.427775 → rounded to 4.43
    expect(result.totalCostEur).toBe(4.43);
  });

  it('flags prices_outdated when any price is older than 12 hours', () => {
    const segments = [makeSegment('DE', 100), makeSegment('AT', 100)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', makeFuelPrice('DE', freshDate));
    fuelPrices.set('AT:diesel', makeFuelPrice('AT', oldDate));

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    expect(result.pricesOutdated).toBe(true);
  });

  it('does not flag prices_outdated when all prices are fresh', () => {
    const segments = [makeSegment('DE', 100), makeSegment('AT', 100)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', makeFuelPrice('DE', freshDate));
    fuelPrices.set('AT:diesel', makeFuelPrice('AT', freshDate));

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    expect(result.pricesOutdated).toBe(false);
  });

  it('skips segments without price data', () => {
    const segments = [makeSegment('DE', 100), makeSegment('XX', 50)];
    const fuelPrices = new Map<string, FuelPrice>();
    fuelPrices.set('DE:diesel', makeFuelPrice('DE'));
    // No price for XX

    const result = computeTripCost(segments, mockVehicle, fuelPrices);

    // Only DE segment counted
    expect(result.totalFuelLiters).toBe(7.5);
    expect(result.totalCostEur).toBe(11.25);
    expect(result.countryBreakdown).toHaveLength(1);
  });

  it('returns zero cost for empty segments', () => {
    const fuelPrices = new Map<string, FuelPrice>();

    const result = computeTripCost([], mockVehicle, fuelPrices);

    expect(result.totalCostEur).toBe(0);
    expect(result.totalFuelLiters).toBe(0);
    expect(result.countryBreakdown).toHaveLength(0);
    expect(result.pricesOutdated).toBe(false);
  });
});

describe('calculateTripCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 404 when route is not found', async () => {
    mockGetRoute.mockResolvedValueOnce(null);

    await expect(calculateTripCost('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Route not found',
    });
  });

  it('throws 400 when route has no segments', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [],
    });

    await expect(calculateTripCost('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('no calculated segments'),
    });
  });

  it('throws 404 when vehicle profile is not found', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 100)],
    });
    mockGetProfile.mockResolvedValueOnce(null);

    await expect(calculateTripCost('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vehicle profile not found',
    });
  });

  it('calculates and stores trip cost successfully', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 200)],
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);
    mockGetPrice.mockResolvedValueOnce(makeFuelPrice('DE'));

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '22.50',
        total_fuel_liters: '15.00',
        country_breakdown: JSON.stringify([{
          country_code: 'DE',
          distance_km: 200,
          fuel_liters: 15,
          cost_eur: 22.5,
          price_per_liter: 1.5,
        }]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    const result = await calculateTripCost('route-1', 'vehicle-1');

    expect(result.total_cost_eur).toBe(22.5);
    expect(result.total_fuel_liters).toBe(15);
    expect(result.country_breakdown).toHaveLength(1);
    expect(result.prices_outdated).toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trip_costs'),
      expect.any(Array)
    );
  });
});

describe('getTripCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no cost exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await getTripCost('route-1');

    expect(result).toBeNull();
  });

  it('returns the most recent cost estimate', async () => {
    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '45.67',
        total_fuel_liters: '30.45',
        country_breakdown: [{ country_code: 'DE', cost_eur: 45.67 }],
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    const result = await getTripCost('route-1');

    expect(result).not.toBeNull();
    expect(result!.total_cost_eur).toBe(45.67);
    expect(result!.total_fuel_liters).toBe(30.45);
    expect(result!.country_breakdown).toHaveLength(1);
  });
});


describe('calculateTotalCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns combined fuel and vignette costs', async () => {
    // Setup: route with segments in DE and AT
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 200), makeSegment('AT', 100)],
    });
    mockGetProfile.mockResolvedValue(mockVehicle);
    mockGetPrice.mockImplementation(async (country: string) => {
      if (country === 'DE') return { ...makeFuelPrice('DE'), price_per_liter_eur: 1.6 };
      if (country === 'AT') return { ...makeFuelPrice('AT'), price_per_liter_eur: 1.4 };
      return null;
    });

    const now = new Date();
    // Mock the INSERT for calculateTripCost
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '34.50',
        total_fuel_liters: '22.50',
        country_breakdown: JSON.stringify([
          { country_code: 'DE', distance_km: 200, fuel_liters: 15, cost_eur: 24, price_per_liter: 1.6 },
          { country_code: 'AT', distance_km: 100, fuel_liters: 7.5, cost_eur: 10.5, price_per_liter: 1.4 },
        ]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    // Mock vignette cost calculation
    mockCalculateVignetteCost.mockResolvedValueOnce({
      totalVignetteCostEur: 9.90,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '10-day', costEur: 9.90 },
      ],
    });

    const result = await calculateTotalCost('route-1', 'vehicle-1', { AT: '10-day' });

    expect(result.fuel_cost_eur).toBe(34.5);
    expect(result.vignette_cost_eur).toBe(9.90);
    expect(result.total_cost_eur).toBe(44.4); // 34.50 + 9.90 = 44.40
    expect(result.fuel_breakdown).toHaveLength(2);
    expect(result.vignette_breakdown).toHaveLength(1);
    expect(result.vignette_breakdown[0].countryCode).toBe('AT');
    expect(result.vignette_breakdown[0].selectedDuration).toBe('10-day');
    expect(result.prices_outdated).toBe(false);
  });

  it('returns zero vignette cost when no vignette countries on route', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 300)],
    });
    mockGetProfile.mockResolvedValue(mockVehicle);
    mockGetPrice.mockResolvedValue(makeFuelPrice('DE'));

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '33.75',
        total_fuel_liters: '22.50',
        country_breakdown: JSON.stringify([
          { country_code: 'DE', distance_km: 300, fuel_liters: 22.5, cost_eur: 33.75, price_per_liter: 1.5 },
        ]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    mockCalculateVignetteCost.mockResolvedValueOnce({
      totalVignetteCostEur: 0,
      countryBreakdown: [],
    });

    const result = await calculateTotalCost('route-1', 'vehicle-1');

    expect(result.fuel_cost_eur).toBe(33.75);
    expect(result.vignette_cost_eur).toBe(0);
    expect(result.total_cost_eur).toBe(33.75);
    expect(result.vignette_breakdown).toHaveLength(0);
  });

  it('rounds total cost to 2 decimal places', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 33)],
    });
    mockGetProfile.mockResolvedValue(mockVehicle);
    mockGetPrice.mockResolvedValue({
      ...makeFuelPrice('DE'),
      price_per_liter_eur: 1.789,
    });

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '4.43',
        total_fuel_liters: '2.48',
        country_breakdown: JSON.stringify([
          { country_code: 'DE', distance_km: 33, fuel_liters: 2.48, cost_eur: 4.43, price_per_liter: 1.789 },
        ]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    // Vignette cost with fractional value
    mockCalculateVignetteCost.mockResolvedValueOnce({
      totalVignetteCostEur: 9.333,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '10-day', costEur: 9.333 },
      ],
    });

    const result = await calculateTotalCost('route-1', 'vehicle-1', { AT: '10-day' });

    // 4.43 + 9.333 = 13.763 → rounded to 13.76
    expect(result.total_cost_eur).toBe(13.76);
  });

  it('throws 404 when vehicle profile not found on second lookup', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 100)],
    });
    // First call to getProfile (inside calculateTripCost) returns the vehicle
    mockGetProfile.mockResolvedValueOnce(mockVehicle);
    mockGetPrice.mockResolvedValue(makeFuelPrice('DE'));

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '11.25',
        total_fuel_liters: '7.50',
        country_breakdown: JSON.stringify([
          { country_code: 'DE', distance_km: 100, fuel_liters: 7.5, cost_eur: 11.25, price_per_liter: 1.5 },
        ]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    // Second call to getProfile (inside calculateTotalCost) returns null
    mockGetProfile.mockResolvedValueOnce(null);

    await expect(calculateTotalCost('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vehicle profile not found',
    });
  });

  it('propagates prices_outdated flag from fuel calculation', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('DE', 100)],
    });
    mockGetProfile.mockResolvedValue(mockVehicle);
    mockGetPrice.mockResolvedValue(makeFuelPrice('DE', oldDate));

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '11.25',
        total_fuel_liters: '7.50',
        country_breakdown: JSON.stringify([
          { country_code: 'DE', distance_km: 100, fuel_liters: 7.5, cost_eur: 11.25, price_per_liter: 1.5 },
        ]),
        prices_outdated: true,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    mockCalculateVignetteCost.mockResolvedValueOnce({
      totalVignetteCostEur: 0,
      countryBreakdown: [],
    });

    const result = await calculateTotalCost('route-1', 'vehicle-1');

    expect(result.prices_outdated).toBe(true);
  });

  it('uses empty durationPreferences by default', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [makeSegment('AT', 150)],
    });
    mockGetProfile.mockResolvedValue(mockVehicle);
    mockGetPrice.mockResolvedValue(makeFuelPrice('AT'));

    const now = new Date();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'cost-1',
        route_id: 'route-1',
        vehicle_profile_id: 'vehicle-1',
        total_cost_eur: '16.88',
        total_fuel_liters: '11.25',
        country_breakdown: JSON.stringify([
          { country_code: 'AT', distance_km: 150, fuel_liters: 11.25, cost_eur: 16.88, price_per_liter: 1.5 },
        ]),
        prices_outdated: false,
        calculated_at: now,
      }],
      rowCount: 1,
    } as any);

    mockCalculateVignetteCost.mockResolvedValueOnce({
      totalVignetteCostEur: 9.90,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '10-day', costEur: 9.90 },
      ],
    });

    await calculateTotalCost('route-1', 'vehicle-1');

    // Verify calculateVignetteCost was called with empty preferences
    expect(mockCalculateVignetteCost).toHaveBeenCalledWith(
      'route-1',
      'car',
      {}
    );
  });
});
