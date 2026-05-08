import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RouteWithDetails } from '../models/route';
import type { VehicleProfile } from '../models/vehicleProfile';
import type { TollServiceResult } from '../models/roadCosts';
import type { RouteVignetteRequirement, VignettePrice } from '../models/vignette';

// Mock dependencies
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
  getRouteVignetteRequirements: vi.fn(),
  getPrices: vi.fn(),
}));

vi.mock('./tollService', () => ({
  getTollsForRoute: vi.fn(),
}));

import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice } from './fuelPriceService';
import { getRouteVignetteRequirements, getPrices } from './vignetteService';
import { getTollsForRoute } from './tollService';
import { getCostBreakdown, calculateTotalRoadCosts } from './costBreakdownService';

const mockGetRoute = vi.mocked(getRoute);
const mockGetProfile = vi.mocked(getProfile);
const mockGetPrice = vi.mocked(getPrice);
const mockGetRouteVignetteRequirements = vi.mocked(getRouteVignetteRequirements);
const mockGetPrices = vi.mocked(getPrices);
const mockGetTollsForRoute = vi.mocked(getTollsForRoute);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const mockVehicle: VehicleProfile = {
  id: 'vehicle-1',
  user_id: 'user-1',
  name: 'My Car',
  vehicle_type: 'car',
  fuel_type: 'diesel',
  tank_capacity_liters: 60,
  consumption_per_100km: 6.5,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockRouteData: RouteWithDetails = {
  route: {
    id: 'route-1',
    user_id: 'user-1',
    name: 'Test Route',
    total_distance_km: 500,
    total_duration_seconds: 18000,
    polyline_encoded: null,
    status: 'calculated',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  },
  waypoints: [
    {
      id: 'wp-1',
      route_id: 'route-1',
      position: 0,
      label: 'Start',
      latitude: 48.2082,
      longitude: 16.3738,
      place_id: null,
      formatted_address: null,
      waypoint_type: 'origin',
    },
    {
      id: 'wp-2',
      route_id: 'route-1',
      position: 1,
      label: 'End',
      latitude: 47.4979,
      longitude: 19.0402,
      place_id: null,
      formatted_address: null,
      waypoint_type: 'destination',
    },
  ],
  segments: [
    {
      id: 'seg-1',
      route_id: 'route-1',
      segment_index: 0,
      start_waypoint_id: 'wp-1',
      end_waypoint_id: 'wp-2',
      distance_km: 250,
      duration_seconds: 9000,
      country_code: 'AT',
      polyline_encoded: null,
    },
    {
      id: 'seg-2',
      route_id: 'route-1',
      segment_index: 1,
      start_waypoint_id: null,
      end_waypoint_id: null,
      distance_km: 250,
      duration_seconds: 9000,
      country_code: 'HU',
      polyline_encoded: null,
    },
  ],
};

const mockVignetteRequirements: RouteVignetteRequirement[] = [
  {
    countryCode: 'AT',
    countryName: 'Austria',
    required: true,
    motorcycleExempt: false,
    availableDurations: ['1-day', '10-day', '2-month', '1-year'],
    prices: [
      {
        id: 'price-1',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car',
        duration: '1-day',
        price_eur: 8.6,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
      {
        id: 'price-2',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car',
        duration: '10-day',
        price_eur: 9.9,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
      {
        id: 'price-3',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car',
        duration: '2-month',
        price_eur: 28.9,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
      {
        id: 'price-4',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car',
        duration: '1-year',
        price_eur: 96.4,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
    ] as VignettePrice[],
  },
  {
    countryCode: 'HU',
    countryName: 'Hungary',
    required: true,
    motorcycleExempt: false,
    availableDurations: ['1-day', '10-day', '1-month', '1-year'],
    prices: [
      {
        id: 'price-5',
        vignette_country_id: 'vc-2',
        vehicle_type: 'car',
        duration: '1-day',
        price_eur: 6.5,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
      {
        id: 'price-6',
        vignette_country_id: 'vc-2',
        vehicle_type: 'car',
        duration: '10-day',
        price_eur: 12.0,
        source: 'i-vignette',
        fetched_at: new Date(),
        expires_at: new Date(),
      },
    ] as VignettePrice[],
  },
];

const mockTollResult: TollServiceResult = {
  bridgeTolls: [{ name: 'Øresund Bridge', cost: 52.0 }],
  highwayTolls: [{ segment: 'A1 Autostrada', cost: 15.5 }],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('costBreakdownService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCostBreakdown - road costs response structure (Requirement 2.1)', () => {
    it('should return a roadCosts object with vignettes, bridgeTolls, highwayTolls, and totalRoadCostsEur', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      // Verify roadCosts structure exists with all required fields
      expect(result.roadCosts).toBeDefined();
      expect(result.roadCosts).toHaveProperty('vignettes');
      expect(result.roadCosts).toHaveProperty('bridgeTolls');
      expect(result.roadCosts).toHaveProperty('highwayTolls');
      expect(result.roadCosts).toHaveProperty('totalRoadCostsEur');

      // Verify arrays
      expect(Array.isArray(result.roadCosts.vignettes)).toBe(true);
      expect(Array.isArray(result.roadCosts.bridgeTolls)).toBe(true);
      expect(Array.isArray(result.roadCosts.highwayTolls)).toBe(true);
      expect(typeof result.roadCosts.totalRoadCostsEur).toBe('number');
    });

    it('should return vignette entries with countryCode, countryName, duration, cost, and availableDurations', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      for (const vignette of result.roadCosts.vignettes) {
        expect(vignette).toHaveProperty('countryCode');
        expect(vignette).toHaveProperty('countryName');
        expect(vignette).toHaveProperty('duration');
        expect(vignette).toHaveProperty('cost');
        expect(vignette).toHaveProperty('availableDurations');
        expect(typeof vignette.countryCode).toBe('string');
        expect(typeof vignette.countryName).toBe('string');
        expect(typeof vignette.duration).toBe('string');
        expect(typeof vignette.cost).toBe('number');
        expect(Array.isArray(vignette.availableDurations)).toBe(true);
      }
    });

    it('should return bridge toll entries with name and cost', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      expect(result.roadCosts.bridgeTolls).toHaveLength(1);
      expect(result.roadCosts.bridgeTolls[0]).toEqual({ name: 'Øresund Bridge', cost: 52.0 });
    });

    it('should return highway toll entries with segment and cost', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      expect(result.roadCosts.highwayTolls).toHaveLength(1);
      expect(result.roadCosts.highwayTolls[0]).toEqual({ segment: 'A1 Autostrada', cost: 15.5 });
    });
  });

  describe('getCostBreakdown - graceful degradation when toll API fails (Requirement 1.3)', () => {
    it('should set isPartialEstimate to true when toll API returns null', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(null);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      expect(result.isPartialEstimate).toBe(true);
    });

    it('should still return fuel and vignette data when toll API fails', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(null);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      // Fuel data should still be present
      expect(result.fuel.totalFuelCostEur).toBeGreaterThan(0);
      expect(result.fuel.breakdown.length).toBeGreaterThan(0);

      // Vignette data should still be present
      expect(result.roadCosts.vignettes.length).toBeGreaterThan(0);

      // Toll arrays should be empty
      expect(result.roadCosts.bridgeTolls).toEqual([]);
      expect(result.roadCosts.highwayTolls).toEqual([]);
    });

    it('should set isPartialEstimate to false when toll API succeeds with no tolls', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue({ bridgeTolls: [], highwayTolls: [] });

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      expect(result.isPartialEstimate).toBe(false);
    });
  });

  describe('getCostBreakdown - totalCostEur includes road costs (Requirement 6.1)', () => {
    it('should calculate totalCostEur as fuel + road costs', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      const expectedTotal = Math.round(
        (result.fuel.totalFuelCostEur + result.roadCosts.totalRoadCostsEur) * 100
      ) / 100;

      expect(result.totalCostEur).toBe(expectedTotal);
    });

    it('should include vignette costs in totalCostEur', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue({ bridgeTolls: [], highwayTolls: [] });

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      // totalCostEur should be greater than just fuel cost because vignettes are included
      expect(result.totalCostEur).toBeGreaterThan(result.fuel.totalFuelCostEur);
    });

    it('should include bridge and highway tolls in totalCostEur', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      // No vignette requirements to isolate toll contribution
      mockGetRouteVignetteRequirements.mockResolvedValue([]);
      mockGetTollsForRoute.mockResolvedValue(mockTollResult);

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      // totalCostEur should include toll costs (52.0 + 15.5 = 67.5)
      expect(result.totalCostEur).toBe(
        Math.round((result.fuel.totalFuelCostEur + 67.5) * 100) / 100
      );
    });
  });

  describe('getCostBreakdown - duration overrides (Requirement 4.3)', () => {
    it('should apply duration override and return the corresponding price', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue({ bridgeTolls: [], highwayTolls: [] });

      // Override Austria to use '2-month' instead of default '1-day'
      const result = await getCostBreakdown('route-1', 'vehicle-1', { AT: '2-month' });

      const atVignette = result.roadCosts.vignettes.find((v) => v.countryCode === 'AT');
      expect(atVignette).toBeDefined();
      expect(atVignette!.duration).toBe('2-month');
      expect(atVignette!.cost).toBe(28.9); // 2-month price for Austria
    });

    it('should use shortest duration as default when no override is provided', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue({ bridgeTolls: [], highwayTolls: [] });

      const result = await getCostBreakdown('route-1', 'vehicle-1');

      const atVignette = result.roadCosts.vignettes.find((v) => v.countryCode === 'AT');
      expect(atVignette).toBeDefined();
      // '1-day' is the shortest available duration for Austria
      expect(atVignette!.duration).toBe('1-day');
      expect(atVignette!.cost).toBe(8.6);
    });

    it('should apply different overrides per country independently', async () => {
      mockGetRoute.mockResolvedValue(mockRouteData);
      mockGetProfile.mockResolvedValue(mockVehicle);
      mockGetPrice.mockResolvedValue({
        country_code: 'AT',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.55,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(),
      });
      mockGetRouteVignetteRequirements.mockResolvedValue(mockVignetteRequirements);
      mockGetTollsForRoute.mockResolvedValue({ bridgeTolls: [], highwayTolls: [] });

      // Override Austria to '1-year' and Hungary to '10-day'
      const result = await getCostBreakdown('route-1', 'vehicle-1', {
        AT: '1-year',
        HU: '10-day',
      });

      const atVignette = result.roadCosts.vignettes.find((v) => v.countryCode === 'AT');
      const huVignette = result.roadCosts.vignettes.find((v) => v.countryCode === 'HU');

      expect(atVignette!.duration).toBe('1-year');
      expect(atVignette!.cost).toBe(96.4);
      expect(huVignette!.duration).toBe('10-day');
      expect(huVignette!.cost).toBe(12.0);
    });
  });

  describe('calculateTotalRoadCosts (Requirement 2.5)', () => {
    it('should sum vignette, bridge toll, and highway toll costs', () => {
      const vignettes = [
        { countryCode: 'AT', countryName: 'Austria', duration: '1-day', cost: 8.6, availableDurations: ['1-day'] },
        { countryCode: 'HU', countryName: 'Hungary', duration: '1-day', cost: 6.5, availableDurations: ['1-day'] },
      ];
      const bridgeTolls = [{ name: 'Bridge A', cost: 10.0 }];
      const highwayTolls = [{ segment: 'Highway B', cost: 5.5 }];

      const total = calculateTotalRoadCosts(vignettes, bridgeTolls, highwayTolls);

      expect(total).toBe(30.6); // 8.6 + 6.5 + 10.0 + 5.5
    });

    it('should return 0 when all arrays are empty', () => {
      const total = calculateTotalRoadCosts([], [], []);
      expect(total).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      const vignettes = [
        { countryCode: 'AT', countryName: 'Austria', duration: '1-day', cost: 1.111, availableDurations: ['1-day'] },
      ];
      const bridgeTolls = [{ name: 'Bridge', cost: 2.222 }];
      const highwayTolls = [{ segment: 'Highway', cost: 3.333 }];

      const total = calculateTotalRoadCosts(vignettes, bridgeTolls, highwayTolls);

      expect(total).toBe(6.67); // (1.111 + 2.222 + 3.333) = 6.666 → rounded to 6.67
    });
  });
});
