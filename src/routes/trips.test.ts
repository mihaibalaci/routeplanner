import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies before importing the router
vi.mock('../services/tripCostService', () => ({
  calculateTripCost: vi.fn(),
  getTripCost: vi.fn(),
}));

vi.mock('../services/routeService', () => ({
  getRoute: vi.fn(),
}));

import tripsRouter from './trips';
import { calculateTripCost, getTripCost } from '../services/tripCostService';
import { getRoute } from '../services/routeService';

const mockCalculateTripCost = vi.mocked(calculateTripCost);
const mockGetTripCost = vi.mocked(getTripCost);
const mockGetRoute = vi.mocked(getRoute);

// Create a test app with the trips router
function createTestApp(userId?: string) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware
  app.use((req, _res, next) => {
    if (userId) {
      req.userId = userId;
    }
    req.requestId = 'test-request-id';
    next();
  });

  app.use('/api/v1/trips', tripsRouter);
  return app;
}

const TEST_USER_ID = 'user-123';
const TEST_ROUTE_ID = 'route-456';
const TEST_VEHICLE_ID = 'vehicle-789';

const mockRouteData = {
  route: { id: TEST_ROUTE_ID, user_id: TEST_USER_ID, status: 'calculated' },
  waypoints: [],
  segments: [
    { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 200, duration_seconds: 7200, country_code: 'DE', polyline_encoded: null, start_waypoint_id: null, end_waypoint_id: null },
  ],
};

const mockCostEstimate = {
  id: 'cost-1',
  route_id: TEST_ROUTE_ID,
  vehicle_profile_id: TEST_VEHICLE_ID,
  total_cost_eur: 22.5,
  total_fuel_liters: 15,
  country_breakdown: [
    { country_code: 'DE', distance_km: 200, fuel_liters: 15, cost_eur: 22.5, price_per_liter: 1.5 },
  ],
  prices_outdated: false,
  calculated_at: new Date(),
};

describe('POST /api/v1/trips/:routeId/cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const app = createTestApp(); // No userId

    const res = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns 400 when vehicleId is missing', async () => {
    const app = createTestApp(TEST_USER_ID);

    const res = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please select a vehicle profile');
  });

  it('returns 404 when route is not found', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(404);
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
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns 200 with cost estimate on success', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockCalculateTripCost.mockResolvedValueOnce(mockCostEstimate);

    const res = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.total_cost_eur).toBe(22.5);
    expect(res.body.data.total_fuel_liters).toBe(15);
    expect(res.body.data.country_breakdown).toHaveLength(1);
    expect(res.body.data.prices_outdated).toBe(false);
    expect(mockCalculateTripCost).toHaveBeenCalledWith(TEST_ROUTE_ID, TEST_VEHICLE_ID);
  });

  it('returns error status from service errors', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    const error = new Error('Vehicle profile not found');
    (error as any).statusCode = 404;
    mockCalculateTripCost.mockRejectedValueOnce(error);

    const res = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Vehicle profile not found');
  });
});

describe('GET /api/v1/trips/:routeId/cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const app = createTestApp(); // No userId

    const res = await request(app)
      .get(`/api/v1/trips/${TEST_ROUTE_ID}/cost`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns 404 when route is not found', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/trips/${TEST_ROUTE_ID}/cost`);

    expect(res.status).toBe(404);
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
      .get(`/api/v1/trips/${TEST_ROUTE_ID}/cost`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns 404 when no cost calculation exists', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockGetTripCost.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/trips/${TEST_ROUTE_ID}/cost`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No cost calculation found for this route');
  });

  it('returns 200 with stored cost estimate', async () => {
    const app = createTestApp(TEST_USER_ID);
    mockGetRoute.mockResolvedValueOnce(mockRouteData as any);
    mockGetTripCost.mockResolvedValueOnce(mockCostEstimate);

    const res = await request(app)
      .get(`/api/v1/trips/${TEST_ROUTE_ID}/cost`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_cost_eur).toBe(22.5);
    expect(res.body.data.total_fuel_liters).toBe(15);
    expect(res.body.data.country_breakdown).toHaveLength(1);
  });
});
