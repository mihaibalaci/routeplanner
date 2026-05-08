import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import vignettesRouter from './vignettes';

// Mock the vignette service
vi.mock('../services/vignetteService', () => ({
  getCountriesRequiringVignette: vi.fn(),
  getPrices: vi.fn(),
  getRouteVignetteRequirements: vi.fn(),
  calculateVignetteCost: vi.fn(),
}));

// Mock the route service
vi.mock('../services/routeService', () => ({
  getRoute: vi.fn(),
}));

import {
  getCountriesRequiringVignette,
  getPrices,
  getRouteVignetteRequirements,
  calculateVignetteCost,
} from '../services/vignetteService';
import { getRoute } from '../services/routeService';
import { VignetteDuration } from '../models/vignette';

const mockGetCountries = vi.mocked(getCountriesRequiringVignette);
const mockGetPrices = vi.mocked(getPrices);
const mockGetRouteRequirements = vi.mocked(getRouteVignetteRequirements);
const mockCalculateCost = vi.mocked(calculateVignetteCost);
const mockGetRoute = vi.mocked(getRoute);

// Create a test app with the vignettes router
function createTestApp(userId?: string) {
  const app = express();
  app.use(express.json());
  // Simulate requestId and auth middleware
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    req.userId = userId;
    next();
  });
  app.use('/api/v1/vignettes', vignettesRouter);
  return app;
}

// Helper to create a mock route details object
function createMockRouteDetails(userId: string) {
  return {
    route: {
      id: 'route-123',
      user_id: userId,
      name: 'Test Route',
      total_distance_km: 500,
      total_duration_seconds: 18000,
      polyline_encoded: null,
      status: 'calculated' as const,
      created_at: new Date(),
      updated_at: new Date(),
    },
    waypoints: [],
    segments: [
      {
        id: 'seg-1',
        route_id: 'route-123',
        segment_index: 0,
        start_waypoint_id: null,
        end_waypoint_id: null,
        distance_km: 250,
        duration_seconds: 9000,
        country_code: 'AT',
        polyline_encoded: null,
      },
      {
        id: 'seg-2',
        route_id: 'route-123',
        segment_index: 1,
        start_waypoint_id: null,
        end_waypoint_id: null,
        distance_km: 250,
        duration_seconds: 9000,
        country_code: 'CZ',
        polyline_encoded: null,
      },
    ],
  };
}

describe('GET /api/v1/vignettes/countries', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp('user-123');
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp).get('/api/v1/vignettes/countries');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 200 with list of vignette countries', async () => {
    const mockCountries = [
      {
        id: '1',
        country_code: 'AT',
        country_name: 'Austria',
        motorcycle_exempt: false,
        available_durations: ['10-day', '2-month', '1-year'] as VignetteDuration[],
        active: true,
        updated_at: new Date(),
      },
      {
        id: '2',
        country_code: 'CZ',
        country_name: 'Czech Republic',
        motorcycle_exempt: false,
        available_durations: ['10-day', '1-month', '1-year'] as VignetteDuration[],
        active: true,
        updated_at: new Date(),
      },
    ];

    mockGetCountries.mockResolvedValue(mockCountries);

    const res = await request(app).get('/api/v1/vignettes/countries');

    expect(res.status).toBe(200);
    expect(res.body.data.countries).toHaveLength(2);
    expect(res.body.data.countries[0].country_code).toBe('AT');
    expect(res.body.data.countries[1].country_code).toBe('CZ');
  });

  it('should return 200 with empty array when no countries', async () => {
    mockGetCountries.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/vignettes/countries');

    expect(res.status).toBe(200);
    expect(res.body.data.countries).toHaveLength(0);
  });

  it('should return 500 on internal error', async () => {
    mockGetCountries.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/vignettes/countries');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Failed to fetch vignette countries');
  });
});

describe('GET /api/v1/vignettes/prices', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp('user-123');
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp).get('/api/v1/vignettes/prices?country=AT&vehicle_type=car');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 400 when country parameter is missing', async () => {
    const res = await request(app).get('/api/v1/vignettes/prices?vehicle_type=car');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('country');
  });

  it('should return 400 when vehicle_type parameter is missing', async () => {
    const res = await request(app).get('/api/v1/vignettes/prices?country=AT');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('vehicle_type');
  });

  it('should return 400 for invalid country code format', async () => {
    const res = await request(app).get('/api/v1/vignettes/prices?country=AUSTRIA&vehicle_type=car');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('2-letter');
  });

  it('should return 400 for invalid vehicle type', async () => {
    const res = await request(app).get('/api/v1/vignettes/prices?country=AT&vehicle_type=truck');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid vehicle_type');
  });

  it('should return 200 with prices for valid request', async () => {
    const mockPrices = [
      {
        id: 'price-1',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car' as const,
        duration: '10-day' as const,
        price_eur: 9.9,
        source: 'i-vignette' as const,
        fetched_at: new Date(),
        expires_at: new Date(),
      },
      {
        id: 'price-2',
        vignette_country_id: 'vc-1',
        vehicle_type: 'car' as const,
        duration: '2-month' as const,
        price_eur: 28.9,
        source: 'i-vignette' as const,
        fetched_at: new Date(),
        expires_at: new Date(),
      },
    ];

    mockGetPrices.mockResolvedValue(mockPrices);

    const res = await request(app).get('/api/v1/vignettes/prices?country=AT&vehicle_type=car');

    expect(res.status).toBe(200);
    expect(res.body.data.prices).toHaveLength(2);
    expect(res.body.data.prices[0].duration).toBe('10-day');
    expect(res.body.data.prices[0].price_eur).toBe(9.9);
  });

  it('should normalize country code to uppercase', async () => {
    mockGetPrices.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/vignettes/prices?country=at&vehicle_type=car');

    expect(res.status).toBe(200);
    expect(mockGetPrices).toHaveBeenCalledWith('AT', 'car');
  });

  it('should return 500 on internal error', async () => {
    mockGetPrices.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/vignettes/prices?country=AT&vehicle_type=car');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Failed to fetch vignette prices');
  });
});

describe('GET /api/v1/vignettes/route/:routeId', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp('user-123');
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp).get('/api/v1/vignettes/route/route-123');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/vignettes/route/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Route not found');
  });

  it('should return 403 when user does not own the route', async () => {
    const otherUserRoute = createMockRouteDetails('other-user');
    mockGetRoute.mockResolvedValue(otherUserRoute);

    const res = await request(app).get('/api/v1/vignettes/route/route-123');

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('should return 200 with vignette requirements', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const mockRequirements = [
      {
        countryCode: 'AT',
        countryName: 'Austria',
        required: true,
        motorcycleExempt: false,
        availableDurations: ['10-day', '2-month', '1-year'] as any,
        prices: [],
      },
      {
        countryCode: 'CZ',
        countryName: 'Czech Republic',
        required: true,
        motorcycleExempt: false,
        availableDurations: ['10-day', '1-month', '1-year'] as any,
        prices: [],
      },
    ];

    mockGetRouteRequirements.mockResolvedValue(mockRequirements);

    const res = await request(app).get('/api/v1/vignettes/route/route-123');

    expect(res.status).toBe(200);
    expect(res.body.data.requirements).toHaveLength(2);
    expect(res.body.data.requirements[0].countryCode).toBe('AT');
    expect(res.body.data.requirements[0].required).toBe(true);
  });

  it('should pass vehicle_type to service when provided', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);
    mockGetRouteRequirements.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/vignettes/route/route-123?vehicle_type=motorcycle');

    expect(res.status).toBe(200);
    expect(mockGetRouteRequirements).toHaveBeenCalledWith('route-123', 'motorcycle');
  });

  it('should return 400 for invalid vehicle_type', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const res = await request(app).get('/api/v1/vignettes/route/route-123?vehicle_type=truck');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid vehicle_type');
  });

  it('should call service without vehicle_type when not provided', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);
    mockGetRouteRequirements.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/vignettes/route/route-123');

    expect(res.status).toBe(200);
    expect(mockGetRouteRequirements).toHaveBeenCalledWith('route-123', undefined);
  });
});

describe('GET /api/v1/vignettes/route/:routeId/cost', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp('user-123');
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp).get('/api/v1/vignettes/route/route-123/cost?vehicle_type=car');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/vignettes/route/nonexistent/cost?vehicle_type=car');

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Route not found');
  });

  it('should return 403 when user does not own the route', async () => {
    const otherUserRoute = createMockRouteDetails('other-user');
    mockGetRoute.mockResolvedValue(otherUserRoute);

    const res = await request(app).get('/api/v1/vignettes/route/route-123/cost?vehicle_type=car');

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('should return 400 when vehicle_type is missing', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const res = await request(app).get('/api/v1/vignettes/route/route-123/cost');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('vehicle_type');
  });

  it('should return 400 for invalid vehicle_type', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const res = await request(app).get('/api/v1/vignettes/route/route-123/cost?vehicle_type=truck');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid vehicle_type');
  });

  it('should return 200 with cost estimate (no duration preferences)', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const mockCostEstimate = {
      totalVignetteCostEur: 18.8,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '10-day' as const, costEur: 9.9 },
        { countryCode: 'CZ', countryName: 'Czech Republic', selectedDuration: '10-day' as const, costEur: 8.9 },
      ],
    };

    mockCalculateCost.mockResolvedValue(mockCostEstimate);

    const res = await request(app).get('/api/v1/vignettes/route/route-123/cost?vehicle_type=car');

    expect(res.status).toBe(200);
    expect(res.body.data.totalVignetteCostEur).toBe(18.8);
    expect(res.body.data.countryBreakdown).toHaveLength(2);
    expect(mockCalculateCost).toHaveBeenCalledWith('route-123', 'car', {});
  });

  it('should parse and pass duration preferences', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const mockCostEstimate = {
      totalVignetteCostEur: 65.8,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '2-month' as const, costEur: 28.9 },
        { countryCode: 'CZ', countryName: 'Czech Republic', selectedDuration: '1-month' as const, costEur: 36.9 },
      ],
    };

    mockCalculateCost.mockResolvedValue(mockCostEstimate);

    const durations = JSON.stringify({ AT: '2-month', CZ: '1-month' });
    const res = await request(app).get(
      `/api/v1/vignettes/route/route-123/cost?vehicle_type=car&durations=${encodeURIComponent(durations)}`
    );

    expect(res.status).toBe(200);
    expect(mockCalculateCost).toHaveBeenCalledWith('route-123', 'car', {
      AT: '2-month',
      CZ: '1-month',
    });
  });

  it('should return 400 for invalid JSON in durations', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const res = await request(app).get(
      '/api/v1/vignettes/route/route-123/cost?vehicle_type=car&durations=not-json'
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('valid JSON');
  });

  it('should return 400 for invalid duration value in preferences', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const durations = JSON.stringify({ AT: 'invalid-duration' });
    const res = await request(app).get(
      `/api/v1/vignettes/route/route-123/cost?vehicle_type=car&durations=${encodeURIComponent(durations)}`
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid duration');
  });

  it('should return 400 when durations is not an object', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    const durations = JSON.stringify(['10-day']);
    const res = await request(app).get(
      `/api/v1/vignettes/route/route-123/cost?vehicle_type=car&durations=${encodeURIComponent(durations)}`
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('JSON object');
  });

  it('should normalize country codes in durations to uppercase', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);

    mockCalculateCost.mockResolvedValue({
      totalVignetteCostEur: 9.9,
      countryBreakdown: [
        { countryCode: 'AT', countryName: 'Austria', selectedDuration: '10-day' as const, costEur: 9.9 },
      ],
    });

    const durations = JSON.stringify({ at: '10-day' });
    const res = await request(app).get(
      `/api/v1/vignettes/route/route-123/cost?vehicle_type=car&durations=${encodeURIComponent(durations)}`
    );

    expect(res.status).toBe(200);
    expect(mockCalculateCost).toHaveBeenCalledWith('route-123', 'car', { AT: '10-day' });
  });

  it('should return 500 on internal error', async () => {
    const routeDetails = createMockRouteDetails('user-123');
    mockGetRoute.mockResolvedValue(routeDetails);
    mockCalculateCost.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/vignettes/route/route-123/cost?vehicle_type=car');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('DB connection failed');
  });
});
