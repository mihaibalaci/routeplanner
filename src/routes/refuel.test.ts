import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import refuelRouter from './refuel';

// Mock the services
vi.mock('../services/refuelAdvisorService', () => ({
  suggestRefuelStops: vi.fn(),
  acceptStop: vi.fn(),
  rejectStop: vi.fn(),
}));

vi.mock('../services/routeService', () => ({
  getRoute: vi.fn(),
}));

import { suggestRefuelStops, acceptStop, rejectStop } from '../services/refuelAdvisorService';
import { getRoute } from '../services/routeService';

const mockSuggestRefuelStops = vi.mocked(suggestRefuelStops);
const mockAcceptStop = vi.mocked(acceptStop);
const mockRejectStop = vi.mocked(rejectStop);
const mockGetRoute = vi.mocked(getRoute);

const TEST_USER_ID = 'user-123';
const TEST_ROUTE_ID = 'route-456';
const TEST_STATION_ID = 'station-789';

function createTestApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    req.userId = userId;
    next();
  });
  app.use('/api/v1/refuel', refuelRouter);
  return app;
}

function mockRouteOwnership(userId: string) {
  mockGetRoute.mockResolvedValue({
    route: { id: TEST_ROUTE_ID, user_id: userId, name: 'Test Route', status: 'calculated' } as any,
    waypoints: [],
    segments: [],
  });
}

describe('POST /api/v1/refuel/:routeId/suggest', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp(TEST_USER_ID);
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({ vehicleId: 'vehicle-1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({ vehicleId: 'vehicle-1' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });

  it('should return 403 when user does not own the route', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: TEST_ROUTE_ID, user_id: 'other-user', name: 'Test', status: 'calculated' } as any,
      waypoints: [],
      segments: [],
    });

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({ vehicleId: 'vehicle-1' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('should return 400 when vehicleId is missing', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('vehicleId');
  });

  it('should return 200 with suggestions on success', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const mockSuggestions = [
      {
        station: {
          id: 'station-1',
          name: 'Shell Station',
          latitude: 48.2,
          longitude: 16.3,
          country_code: 'AT',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: 1.2,
          fuel_price_eur: 1.55,
        },
        alternatives: [],
        distanceFromStart: 250,
        reason: 'range_warning' as const,
        expandedSearch: false,
        searchRadiusKm: 2,
      },
    ];

    mockSuggestRefuelStops.mockResolvedValue(mockSuggestions);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({ vehicleId: 'vehicle-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(1);
    expect(res.body.data.suggestions[0].station.name).toBe('Shell Station');
    expect(mockSuggestRefuelStops).toHaveBeenCalledWith(TEST_ROUTE_ID, 'vehicle-1');
  });

  it('should forward service errors with correct status code', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const error = new Error('Route has no calculated segments. Please calculate the route first.');
    (error as any).statusCode = 400;
    mockSuggestRefuelStops.mockRejectedValue(error);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .send({ vehicleId: 'vehicle-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no calculated segments');
  });
});

describe('POST /api/v1/refuel/:routeId/accept/:stationId', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp(TEST_USER_ID);
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`);

    expect(res.status).toBe(401);
  });

  it('should return 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 when user does not own the route', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: TEST_ROUTE_ID, user_id: 'other-user', name: 'Test', status: 'calculated' } as any,
      waypoints: [],
      segments: [],
    });

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`);

    expect(res.status).toBe(403);
  });

  it('should return 200 with refuel stop on success', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const mockRefuelStop = {
      id: 'refuel-stop-1',
      route_id: TEST_ROUTE_ID,
      fuel_station_id: TEST_STATION_ID,
      position_in_route: 2,
      fuel_price_eur: 1.55,
      status: 'accepted' as const,
      created_at: new Date('2024-01-01T12:00:00Z'),
    };

    mockAcceptStop.mockResolvedValue(mockRefuelStop);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.refuelStop.status).toBe('accepted');
    expect(res.body.data.refuelStop.fuel_station_id).toBe(TEST_STATION_ID);
    expect(mockAcceptStop).toHaveBeenCalledWith(TEST_ROUTE_ID, TEST_STATION_ID);
  });

  it('should forward 404 when station not found', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const error = new Error('Fuel station not found');
    (error as any).statusCode = 404;
    mockAcceptStop.mockRejectedValue(error);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Fuel station not found');
  });
});

describe('POST /api/v1/refuel/:routeId/reject/:stationId', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp(TEST_USER_ID);
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/reject/${TEST_STATION_ID}`);

    expect(res.status).toBe(401);
  });

  it('should return 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/reject/${TEST_STATION_ID}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 when user does not own the route', async () => {
    mockGetRoute.mockResolvedValue({
      route: { id: TEST_ROUTE_ID, user_id: 'other-user', name: 'Test', status: 'calculated' } as any,
      waypoints: [],
      segments: [],
    });

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/reject/${TEST_STATION_ID}`);

    expect(res.status).toBe(403);
  });

  it('should return 200 with next-best alternative on success', async () => {
    mockRouteOwnership(TEST_USER_ID);

    const mockAlternative = {
      station: {
        id: 'station-alt-1',
        name: 'BP Station',
        latitude: 48.3,
        longitude: 16.4,
        country_code: 'AT',
        place_id: null,
        fuel_types_available: ['diesel', 'petrol_95'],
        distance_from_route_km: 1.8,
        fuel_price_eur: 1.60,
      },
      alternatives: [],
      distanceFromStart: 0,
      reason: 'range_warning' as const,
      expandedSearch: false,
      searchRadiusKm: 2,
    };

    mockRejectStop.mockResolvedValue(mockAlternative);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/reject/${TEST_STATION_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.alternative.station.name).toBe('BP Station');
    expect(mockRejectStop).toHaveBeenCalledWith(TEST_ROUTE_ID, TEST_STATION_ID);
  });

  it('should return 200 with null alternative when no alternatives available', async () => {
    mockRouteOwnership(TEST_USER_ID);
    mockRejectStop.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/reject/${TEST_STATION_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.alternative).toBeNull();
  });
});
