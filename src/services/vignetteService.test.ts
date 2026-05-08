import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vignetteService from './vignetteService';

// Mock database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

// Mock redis
vi.mock('../utils/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(true),
  CACHE_KEYS: {
    vignetteCountries: () => 'vignette:countries',
    vignettePrices: (country: string, vehicleType: string) =>
      `vignette:prices:${country}:${vehicleType}`,
    vignetteRoute: (routeId: string) => `vignette:route:${routeId}`,
  },
  CACHE_TTL: {
    VIGNETTE_PRICES: 86400,
    VIGNETTE_COUNTRIES: 86400,
    VIGNETTE_ROUTE: 3600,
  },
}));

// Mock route service
vi.mock('./routeService', () => ({
  getRoute: vi.fn(),
}));

import { query } from '../utils/database';
import { cacheGet, cacheSet } from '../utils/redis';
import { getRoute } from './routeService';

const mockQuery = vi.mocked(query);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);
const mockGetRoute = vi.mocked(getRoute);

// ─── Test Data ────────────────────────────────────────────────────────────────

const mockVignetteCountries = [
  {
    id: 'vc-1',
    country_code: 'AT',
    country_name: 'Austria',
    motorcycle_exempt: false,
    available_durations: ['10-day', '2-month', '1-year'],
    active: true,
    updated_at: new Date('2024-01-01'),
  },
  {
    id: 'vc-2',
    country_code: 'RO',
    country_name: 'Romania',
    motorcycle_exempt: true,
    available_durations: ['1-week', '1-month', '3-month', '1-year'],
    active: true,
    updated_at: new Date('2024-01-01'),
  },
  {
    id: 'vc-3',
    country_code: 'HU',
    country_name: 'Hungary',
    motorcycle_exempt: false,
    available_durations: ['10-day', '1-month', '1-year'],
    active: true,
    updated_at: new Date('2024-01-01'),
  },
];

const mockPricesAT = [
  {
    id: 'vp-1',
    vignette_country_id: 'vc-1',
    vehicle_type: 'car',
    duration: '10-day',
    price_eur: 9.9,
    source: 'i-vignette',
    fetched_at: new Date('2024-01-01'),
    expires_at: new Date('2024-01-02'),
  },
  {
    id: 'vp-2',
    vignette_country_id: 'vc-1',
    vehicle_type: 'car',
    duration: '2-month',
    price_eur: 28.9,
    source: 'i-vignette',
    fetched_at: new Date('2024-01-01'),
    expires_at: new Date('2024-01-02'),
  },
  {
    id: 'vp-3',
    vignette_country_id: 'vc-1',
    vehicle_type: 'car',
    duration: '1-year',
    price_eur: 96.4,
    source: 'i-vignette',
    fetched_at: new Date('2024-01-01'),
    expires_at: new Date('2024-01-02'),
  },
];

const mockPricesHU = [
  {
    id: 'vp-4',
    vignette_country_id: 'vc-3',
    vehicle_type: 'car',
    duration: '10-day',
    price_eur: 14.9,
    source: 'i-vignette',
    fetched_at: new Date('2024-01-01'),
    expires_at: new Date('2024-01-02'),
  },
  {
    id: 'vp-5',
    vignette_country_id: 'vc-3',
    vehicle_type: 'car',
    duration: '1-month',
    price_eur: 21.9,
    source: 'i-vignette',
    fetched_at: new Date('2024-01-01'),
    expires_at: new Date('2024-01-02'),
  },
];

const mockRouteWithSegments = {
  route: {
    id: 'route-1',
    user_id: 'user-1',
    name: 'Test Route',
    total_distance_km: 800,
    total_duration_seconds: 28800,
    polyline_encoded: null,
    status: 'calculated' as const,
    created_at: new Date(),
    updated_at: new Date(),
  },
  waypoints: [],
  segments: [
    {
      id: 'seg-1',
      route_id: 'route-1',
      segment_index: 0,
      start_waypoint_id: null,
      end_waypoint_id: null,
      distance_km: 200,
      duration_seconds: 7200,
      country_code: 'DE',
      polyline_encoded: null,
    },
    {
      id: 'seg-2',
      route_id: 'route-1',
      segment_index: 1,
      start_waypoint_id: null,
      end_waypoint_id: null,
      distance_km: 300,
      duration_seconds: 10800,
      country_code: 'AT',
      polyline_encoded: null,
    },
    {
      id: 'seg-3',
      route_id: 'route-1',
      segment_index: 2,
      start_waypoint_id: null,
      end_waypoint_id: null,
      distance_km: 300,
      duration_seconds: 10800,
      country_code: 'HU',
      polyline_encoded: null,
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VignetteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCountriesRequiringVignette', () => {
    it('should return cached countries when available', async () => {
      mockCacheGet.mockResolvedValue(mockVignetteCountries);

      const result = await vignetteService.getCountriesRequiringVignette();

      expect(result).toEqual(mockVignetteCountries);
      expect(mockCacheGet).toHaveBeenCalledWith('vignette:countries');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should fall back to database when cache misses', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getCountriesRequiringVignette();

      expect(result).toHaveLength(3);
      expect(result[0].country_code).toBe('AT');
      expect(mockCacheSet).toHaveBeenCalledWith(
        'vignette:countries',
        expect.any(Array),
        86400
      );
    });

    it('should not cache empty results', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getCountriesRequiringVignette();

      expect(result).toHaveLength(0);
      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('getPrices', () => {
    it('should return cached prices when available', async () => {
      mockCacheGet.mockResolvedValue(mockPricesAT);

      const result = await vignetteService.getPrices('AT', 'car');

      expect(result).toEqual(mockPricesAT);
      expect(mockCacheGet).toHaveBeenCalledWith('vignette:prices:AT:car');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should fall back to database when cache misses', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: mockPricesAT.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getPrices('AT', 'car');

      expect(result).toHaveLength(3);
      expect(result[0].price_eur).toBe(9.9);
      expect(result[0].duration).toBe('10-day');
      expect(mockCacheSet).toHaveBeenCalledWith(
        'vignette:prices:AT:car',
        expect.any(Array),
        86400
      );
    });

    it('should return empty array when no prices exist', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getPrices('XX', 'car');

      expect(result).toHaveLength(0);
      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('getRouteVignetteRequirements', () => {
    it('should detect vignette countries on route', async () => {
      // No cache
      mockCacheGet.mockResolvedValue(null);
      // Route with AT and HU segments
      mockGetRoute.mockResolvedValue(mockRouteWithSegments);
      // DB returns vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getRouteVignetteRequirements('route-1');

      expect(result).toHaveLength(2); // AT and HU (not DE, not RO since not on route)
      expect(result.map((r) => r.countryCode)).toContain('AT');
      expect(result.map((r) => r.countryCode)).toContain('HU');
      expect(result.map((r) => r.countryCode)).not.toContain('DE');
    });

    it('should apply motorcycle exemption for exempt countries', async () => {
      mockCacheGet.mockResolvedValue(null);
      // Route crossing RO
      mockGetRoute.mockResolvedValue({
        ...mockRouteWithSegments,
        segments: [
          ...mockRouteWithSegments.segments,
          {
            id: 'seg-4',
            route_id: 'route-1',
            segment_index: 3,
            start_waypoint_id: null,
            end_waypoint_id: null,
            distance_km: 200,
            duration_seconds: 7200,
            country_code: 'RO',
            polyline_encoded: null,
          },
        ],
      });
      // DB returns vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Prices queries for AT and HU (RO is exempt for motorcycle)
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.getRouteVignetteRequirements(
        'route-1',
        'motorcycle'
      );

      const roReq = result.find((r) => r.countryCode === 'RO');
      expect(roReq).toBeDefined();
      expect(roReq!.required).toBe(false);
      expect(roReq!.motorcycleExempt).toBe(true);

      const atReq = result.find((r) => r.countryCode === 'AT');
      expect(atReq).toBeDefined();
      expect(atReq!.required).toBe(true);
    });

    it('should throw 404 when route not found', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockGetRoute.mockResolvedValue(null);

      await expect(
        vignetteService.getRouteVignetteRequirements('nonexistent')
      ).rejects.toThrow('Route not found: nonexistent');
    });

    it('should use cached requirements when available (no vehicleType)', async () => {
      const cachedRequirements = [
        {
          countryCode: 'AT',
          countryName: 'Austria',
          required: true,
          motorcycleExempt: false,
          availableDurations: ['10-day', '2-month', '1-year'],
          prices: [],
        },
      ];
      mockCacheGet.mockResolvedValue(cachedRequirements);

      const result = await vignetteService.getRouteVignetteRequirements('route-1');

      expect(result).toEqual(cachedRequirements);
      expect(mockGetRoute).not.toHaveBeenCalled();
    });
  });

  describe('calculateVignetteCost', () => {
    it('should calculate total cost for multiple countries', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockGetRoute.mockResolvedValue(mockRouteWithSegments);
      // First query: vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Second query: prices for AT
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesAT.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Third query: prices for HU
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesHU.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.calculateVignetteCost(
        'route-1',
        'car',
        { AT: '10-day', HU: '10-day' }
      );

      expect(result.totalVignetteCostEur).toBe(24.8); // 9.9 + 14.9
      expect(result.countryBreakdown).toHaveLength(2);

      const atBreakdown = result.countryBreakdown.find(
        (b) => b.countryCode === 'AT'
      );
      expect(atBreakdown!.costEur).toBe(9.9);
      expect(atBreakdown!.selectedDuration).toBe('10-day');

      const huBreakdown = result.countryBreakdown.find(
        (b) => b.countryCode === 'HU'
      );
      expect(huBreakdown!.costEur).toBe(14.9);
      expect(huBreakdown!.selectedDuration).toBe('10-day');
    });

    it('should default to shortest available duration when no preference given', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockGetRoute.mockResolvedValue({
        ...mockRouteWithSegments,
        segments: [mockRouteWithSegments.segments[1]], // Only AT segment
      });
      // Vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Prices for AT
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesAT.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.calculateVignetteCost(
        'route-1',
        'car',
        {} // No preferences — should default to shortest
      );

      expect(result.countryBreakdown[0].selectedDuration).toBe('10-day');
      expect(result.countryBreakdown[0].costEur).toBe(9.9);
    });

    it('should skip exempt countries for motorcycles', async () => {
      mockCacheGet.mockResolvedValue(null);
      // Route crossing RO only
      mockGetRoute.mockResolvedValue({
        ...mockRouteWithSegments,
        segments: [
          {
            id: 'seg-ro',
            route_id: 'route-1',
            segment_index: 0,
            start_waypoint_id: null,
            end_waypoint_id: null,
            distance_km: 400,
            duration_seconds: 14400,
            country_code: 'RO',
            polyline_encoded: null,
          },
        ],
      });
      // Vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.calculateVignetteCost(
        'route-1',
        'motorcycle',
        {}
      );

      expect(result.totalVignetteCostEur).toBe(0);
      expect(result.countryBreakdown).toHaveLength(0);
    });

    it('should use user-selected duration preference', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockGetRoute.mockResolvedValue({
        ...mockRouteWithSegments,
        segments: [mockRouteWithSegments.segments[1]], // Only AT
      });
      // Vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Prices for AT
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesAT.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.calculateVignetteCost(
        'route-1',
        'car',
        { AT: '1-year' }
      );

      expect(result.countryBreakdown[0].selectedDuration).toBe('1-year');
      expect(result.countryBreakdown[0].costEur).toBe(96.4);
    });

    it('should sum per-country costs to equal total', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockGetRoute.mockResolvedValue(mockRouteWithSegments);
      // Vignette countries
      mockQuery.mockResolvedValueOnce({
        rows: mockVignetteCountries,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Prices for AT
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesAT.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);
      // Prices for HU
      mockQuery.mockResolvedValueOnce({
        rows: mockPricesHU.map((p) => ({ ...p, price_eur: String(p.price_eur) })),
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await vignetteService.calculateVignetteCost(
        'route-1',
        'car',
        {}
      );

      const sumOfBreakdown = result.countryBreakdown.reduce(
        (sum, b) => sum + b.costEur,
        0
      );
      expect(Math.abs(result.totalVignetteCostEur - sumOfBreakdown)).toBeLessThan(0.01);
    });
  });
});
