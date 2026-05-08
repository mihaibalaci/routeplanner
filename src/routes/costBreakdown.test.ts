import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies before importing the router
vi.mock('../services/routeService', () => ({
  getRoute: vi.fn(),
}));

vi.mock('../services/costBreakdownService', () => ({
  getCostBreakdown: vi.fn(),
}));

import costBreakdownRouter from './costBreakdown';
import { getRoute } from '../services/routeService';
import { getCostBreakdown } from '../services/costBreakdownService';

const mockGetRoute = vi.mocked(getRoute);
const mockGetCostBreakdown = vi.mocked(getCostBreakdown);

// Create a test app with the cost breakdown router
function createTestApp(userId?: string) {
  const app = express();
  app.use(express.json());

  // Simulate auth + requestId middleware
  app.use((req, _res, next) => {
    if (userId) {
      req.userId = userId;
    }
    req.requestId = 'test-request-id';
    next();
  });

  app.use('/api/v1/cost-breakdown', costBreakdownRouter);
  return app;
}

const TEST_USER_ID = 'user-123';
const TEST_ROUTE_ID = 'route-456';
const TEST_VEHICLE_ID = 'vehicle-789';

const mockRouteData = {
  route: { id: TEST_ROUTE_ID, user_id: TEST_USER_ID, status: 'calculated' },
  waypoints: [],
  segments: [
    {
      id: 'seg-1',
      route_id: TEST_ROUTE_ID,
      segment_index: 0,
      distance_km: 200,
      duration_seconds: 7200,
      country_code: 'DE',
      polyline_encoded: null,
      start_waypoint_id: null,
      end_waypoint_id: null,
    },
  ],
};

const mockCostBreakdownData = {
  totalCostEur: 45.67,
  isPartialEstimate: false,
  fuel: {
    totalFuelCostEur: 30.50,
    breakdown: [
      {
        countryCode: 'DE',
        countryName: 'Germany',
        distanceKm: 200,
        fuelPricePerLiter: 1.65,
        fuelCostEur: 30.50,
      },
    ],
  },
  vignettes: {
    totalVignetteCostEur: 15.17,
    breakdown: [
      {
        countryCode: 'AT',
        countryName: 'Austria',
        required: true,
        motorcycleExempt: false,
        selectedDuration: '10-day',
        availableDurations: ['1-day', '10-day', '1-month', '1-year'],
        priceEur: 15.17,
        priceUnavailable: false,
      },
    ],
  },
  vehicleProfile: {
    id: TEST_VEHICLE_ID,
    name: 'My Car',
    fuelType: 'diesel',
    consumptionPer100km: 6.5,
  },
};

describe('GET /api/v1/cost-breakdown/:routeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const app = createTestApp(); // No userId

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
    expect(res.body.requestId).toBe('test-request-id');
  });

  it('returns 400 when vehicleId query param is missing', async () => {
    const app = createTestApp(TEST_USER_ID);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.message).toBe('vehicleId query parameter is required');
    expect(res.body.requestId).toBe('test-request-id');
  });

  it('returns 404 when route is not found', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });

  it('returns 403 when user does not own the route', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce({
      route: { id: TEST_ROUTE_ID, user_id: 'other-user' } as any,
      waypoints: [],
      segments: [],
    });

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns 200 with CostBreakdownData shape on success', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockGetCostBreakdown.mockResolvedValueOnce(mockCostBreakdownData as any);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.requestId).toBe('test-request-id');

    const data = res.body.data;
    // Verify CostBreakdownData interface shape
    expect(data).toHaveProperty('totalCostEur');
    expect(data).toHaveProperty('isPartialEstimate');
    expect(data).toHaveProperty('fuel');
    expect(data).toHaveProperty('vignettes');
    expect(data).toHaveProperty('vehicleProfile');

    // Verify fuel breakdown shape
    expect(data.fuel).toHaveProperty('totalFuelCostEur');
    expect(data.fuel).toHaveProperty('breakdown');
    expect(data.fuel.breakdown[0]).toHaveProperty('countryCode');
    expect(data.fuel.breakdown[0]).toHaveProperty('countryName');
    expect(data.fuel.breakdown[0]).toHaveProperty('distanceKm');
    expect(data.fuel.breakdown[0]).toHaveProperty('fuelPricePerLiter');
    expect(data.fuel.breakdown[0]).toHaveProperty('fuelCostEur');

    // Verify vignette breakdown shape
    expect(data.vignettes).toHaveProperty('totalVignetteCostEur');
    expect(data.vignettes).toHaveProperty('breakdown');
    expect(data.vignettes.breakdown[0]).toHaveProperty('countryCode');
    expect(data.vignettes.breakdown[0]).toHaveProperty('countryName');
    expect(data.vignettes.breakdown[0]).toHaveProperty('required');
    expect(data.vignettes.breakdown[0]).toHaveProperty('motorcycleExempt');
    expect(data.vignettes.breakdown[0]).toHaveProperty('selectedDuration');
    expect(data.vignettes.breakdown[0]).toHaveProperty('availableDurations');
    expect(data.vignettes.breakdown[0]).toHaveProperty('priceEur');
    expect(data.vignettes.breakdown[0]).toHaveProperty('priceUnavailable');

    // Verify vehicle profile shape
    expect(data.vehicleProfile).toHaveProperty('id');
    expect(data.vehicleProfile).toHaveProperty('name');
    expect(data.vehicleProfile).toHaveProperty('fuelType');
    expect(data.vehicleProfile).toHaveProperty('consumptionPer100km');

    // Verify actual values
    expect(data.totalCostEur).toBe(45.67);
    expect(data.isPartialEstimate).toBe(false);
    expect(data.fuel.totalFuelCostEur).toBe(30.50);
    expect(data.vignettes.totalVignetteCostEur).toBe(15.17);
  });

  it('returns isPartialEstimate true when fuel price is unavailable', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);

    const partialData = {
      ...mockCostBreakdownData,
      isPartialEstimate: true,
      fuel: {
        totalFuelCostEur: 0,
        breakdown: [
          {
            countryCode: 'DE',
            countryName: 'Germany',
            distanceKm: 200,
            fuelPricePerLiter: 0,
            fuelCostEur: 0,
          },
        ],
      },
    };
    mockGetCostBreakdown.mockResolvedValueOnce(partialData as any);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.isPartialEstimate).toBe(true);
    expect(res.body.data.fuel.breakdown[0].fuelPricePerLiter).toBe(0);
    expect(res.body.data.fuel.breakdown[0].fuelCostEur).toBe(0);
  });

  it('returns motorcycle exemption in vignette breakdown', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);

    const motorcycleData = {
      ...mockCostBreakdownData,
      vehicleProfile: {
        id: TEST_VEHICLE_ID,
        name: 'My Motorcycle',
        fuelType: 'petrol_95',
        consumptionPer100km: 4.5,
      },
      vignettes: {
        totalVignetteCostEur: 0,
        breakdown: [
          {
            countryCode: 'RO',
            countryName: 'Romania',
            required: false,
            motorcycleExempt: true,
            selectedDuration: '1-day',
            availableDurations: ['1-day', '10-day', '1-month', '1-year'],
            priceEur: 0,
            priceUnavailable: false,
          },
        ],
      },
    };
    mockGetCostBreakdown.mockResolvedValueOnce(motorcycleData as any);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(200);
    const vignetteBreakdown = res.body.data.vignettes.breakdown[0];
    expect(vignetteBreakdown.motorcycleExempt).toBe(true);
    expect(vignetteBreakdown.required).toBe(false);
    expect(vignetteBreakdown.priceEur).toBe(0);
    expect(res.body.data.vignettes.totalVignetteCostEur).toBe(0);
  });

  it('passes duration overrides to the service', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockGetCostBreakdown.mockResolvedValueOnce(mockCostBreakdownData as any);

    const durations = JSON.stringify({ AT: '1-month' });

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID, durations });

    expect(res.status).toBe(200);
    expect(mockGetCostBreakdown).toHaveBeenCalledWith(
      TEST_ROUTE_ID,
      TEST_VEHICLE_ID,
      { AT: '1-month' }
    );
  });

  it('returns 400 for invalid durations JSON', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID, durations: 'not-valid-json' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid durations format: must be a valid JSON string');
  });

  it('returns 500 when service throws unexpected error', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockGetCostBreakdown.mockRejectedValueOnce(new Error('Database connection failed'));

    const res = await request(app)
      .get(`/api/v1/cost-breakdown/${TEST_ROUTE_ID}`)
      .query({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Database connection failed');
  });
});
