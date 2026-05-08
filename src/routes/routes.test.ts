import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import routesRouter from './routes';

// Mock the route service
vi.mock('../services/routeService', () => ({
  createRoute: vi.fn(),
  getRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  addWaypoint: vi.fn(),
  removeWaypoint: vi.fn(),
  reorderWaypoints: vi.fn(),
}));

// Mock the Google Maps service
vi.mock('../services/googleMapsService', () => ({
  getGoogleMapsService: vi.fn(),
}));

// Mock the database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

import {
  createRoute,
  getRoute,
  updateRoute,
  deleteRoute,
  addWaypoint,
  removeWaypoint,
  reorderWaypoints,
} from '../services/routeService';
import { getGoogleMapsService } from '../services/googleMapsService';
import { query } from '../utils/database';

const mockCreateRoute = vi.mocked(createRoute);
const mockGetRoute = vi.mocked(getRoute);
const mockUpdateRoute = vi.mocked(updateRoute);
const mockDeleteRoute = vi.mocked(deleteRoute);
const mockAddWaypoint = vi.mocked(addWaypoint);
const mockRemoveWaypoint = vi.mocked(removeWaypoint);
const mockReorderWaypoints = vi.mocked(reorderWaypoints);
const mockGetGoogleMapsService = vi.mocked(getGoogleMapsService);
const mockQuery = vi.mocked(query);

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  // Simulate requestId and auth middleware
  app.use((req, _res, next) => {
    (req as any).requestId = 'test-request-id';
    if (userId) {
      (req as any).userId = userId;
    }
    next();
  });
  app.use('/', routesRouter);
  return app;
}

const TEST_USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';

const mockRouteWithDetails = {
  route: {
    id: 'route-1',
    user_id: TEST_USER_ID,
    name: 'Test Route',
    total_distance_km: null,
    total_duration_seconds: null,
    polyline_encoded: null,
    status: 'draft' as const,
    created_at: new Date(),
    updated_at: new Date(),
  },
  waypoints: [
    {
      id: 'wp-1',
      route_id: 'route-1',
      position: 0,
      label: 'Start',
      latitude: 48.8566,
      longitude: 2.3522,
      place_id: null,
      formatted_address: null,
      waypoint_type: 'origin' as const,
    },
    {
      id: 'wp-2',
      route_id: 'route-1',
      position: 1,
      label: 'End',
      latitude: 52.52,
      longitude: 13.405,
      place_id: null,
      formatted_address: null,
      waypoint_type: 'destination' as const,
    },
  ],
  segments: [],
};

describe('POST / (Create Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp)
      .post('/')
      .send({ name: 'Test', waypoints: [{ latitude: 48.8, longitude: 2.3, waypoint_type: 'origin' }] });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns 400 when waypoints are missing', async () => {
    const res = await request(app).post('/').send({ name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one waypoint is required');
  });

  it('returns 400 when waypoints array is empty', async () => {
    const res = await request(app).post('/').send({ name: 'Test', waypoints: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At least one waypoint is required');
  });

  it('returns 400 when waypoint is missing latitude', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'Test', waypoints: [{ longitude: 2.3, waypoint_type: 'origin' }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must have latitude and longitude');
  });

  it('returns 400 when waypoint has invalid waypoint_type', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'Test', waypoints: [{ latitude: 48.8, longitude: 2.3, waypoint_type: 'invalid' }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('valid waypoint_type');
  });

  it('creates a route successfully', async () => {
    mockCreateRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).post('/').send({
      name: 'My Route',
      waypoints: [
        { latitude: 48.8566, longitude: 2.3522, waypoint_type: 'origin', label: 'Paris' },
        { latitude: 52.52, longitude: 13.405, waypoint_type: 'destination', label: 'Berlin' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.route.id).toBe('route-1');
    expect(mockCreateRoute).toHaveBeenCalledWith(
      TEST_USER_ID,
      'My Route',
      expect.any(Array)
    );
  });

  it('uses default name when none provided', async () => {
    mockCreateRoute.mockResolvedValue(mockRouteWithDetails);

    await request(app).post('/').send({
      waypoints: [{ latitude: 48.8, longitude: 2.3, waypoint_type: 'origin' }],
    });

    expect(mockCreateRoute).toHaveBeenCalledWith(
      TEST_USER_ID,
      'Untitled Route',
      expect.any(Array)
    );
  });

  it('includes requestId in response', async () => {
    mockCreateRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).post('/').send({
      name: 'Test',
      waypoints: [{ latitude: 48.8, longitude: 2.3, waypoint_type: 'origin' }],
    });

    expect(res.body.requestId).toBe('test-request-id');
  });
});

describe('GET /:id (Get Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/route-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).get('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRouteWithDetails.route, user_id: OTHER_USER_ID },
    });

    const res = await request(app).get('/route-1');

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns route with waypoints and segments', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).get('/route-1');

    expect(res.status).toBe(200);
    expect(res.body.data.route.id).toBe('route-1');
    expect(res.body.data.waypoints).toHaveLength(2);
    expect(res.body.data.segments).toHaveLength(0);
  });
});

describe('PUT /:id (Update Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).put('/route-1').send({ action: 'reorder', waypoint_ids: [] });

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).put('/nonexistent').send({ action: 'reorder', waypoint_ids: [] });

    expect(res.status).toBe(404);
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRouteWithDetails.route, user_id: OTHER_USER_ID },
    });

    const res = await request(app).put('/route-1').send({ action: 'reorder', waypoint_ids: [] });

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid action', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).put('/route-1').send({ action: 'invalid_action' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid action');
  });

  describe('add_waypoint action', () => {
    it('returns 400 when waypoint is missing', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);

      const res = await request(app).put('/route-1').send({ action: 'add_waypoint' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('latitude and longitude is required');
    });

    it('returns 400 when waypoint has invalid type', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);

      const res = await request(app).put('/route-1').send({
        action: 'add_waypoint',
        waypoint: { latitude: 50.0, longitude: 10.0, waypoint_type: 'bad' },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('valid waypoint_type');
    });

    it('adds a waypoint successfully', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);
      const updatedWaypoints = [
        ...mockRouteWithDetails.waypoints,
        {
          id: 'wp-3',
          route_id: 'route-1',
          position: 2,
          label: 'Stop',
          latitude: 50.0,
          longitude: 10.0,
          place_id: null,
          formatted_address: null,
          waypoint_type: 'stop' as const,
        },
      ];
      mockAddWaypoint.mockResolvedValue(updatedWaypoints);

      const res = await request(app).put('/route-1').send({
        action: 'add_waypoint',
        waypoint: { latitude: 50.0, longitude: 10.0, waypoint_type: 'stop', label: 'Stop' },
        position: 1,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.waypoints).toHaveLength(3);
      expect(mockAddWaypoint).toHaveBeenCalledWith('route-1', expect.any(Object), 1);
    });
  });

  describe('remove_waypoint action', () => {
    it('returns 400 when waypoint_id is missing', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);

      const res = await request(app).put('/route-1').send({ action: 'remove_waypoint' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('waypoint_id is required');
    });

    it('removes a waypoint successfully', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);
      const updatedWaypoints = [mockRouteWithDetails.waypoints[1]];
      mockRemoveWaypoint.mockResolvedValue(updatedWaypoints);

      const res = await request(app).put('/route-1').send({
        action: 'remove_waypoint',
        waypoint_id: 'wp-1',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.waypoints).toHaveLength(1);
      expect(mockRemoveWaypoint).toHaveBeenCalledWith('route-1', 'wp-1');
    });
  });

  describe('reorder action', () => {
    it('returns 400 when waypoint_ids is missing', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);

      const res = await request(app).put('/route-1').send({ action: 'reorder' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('waypoint_ids array is required');
    });

    it('reorders waypoints successfully', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);
      const reorderedWaypoints = [
        mockRouteWithDetails.waypoints[1],
        mockRouteWithDetails.waypoints[0],
      ];
      mockReorderWaypoints.mockResolvedValue(reorderedWaypoints);

      const res = await request(app).put('/route-1').send({
        action: 'reorder',
        waypoint_ids: ['wp-2', 'wp-1'],
      });

      expect(res.status).toBe(200);
      expect(res.body.data.waypoints).toHaveLength(2);
      expect(mockReorderWaypoints).toHaveBeenCalledWith('route-1', ['wp-2', 'wp-1']);
    });
  });

  describe('metadata update (no action)', () => {
    it('updates route name', async () => {
      mockGetRoute.mockResolvedValue(mockRouteWithDetails);
      mockUpdateRoute.mockResolvedValue({
        ...mockRouteWithDetails.route,
        name: 'New Name',
      });

      const res = await request(app).put('/route-1').send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.route.name).toBe('New Name');
      expect(mockUpdateRoute).toHaveBeenCalledWith('route-1', { name: 'New Name' });
    });
  });
});

describe('DELETE /:id (Delete Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).delete('/route-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).delete('/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRouteWithDetails.route, user_id: OTHER_USER_ID },
    });

    const res = await request(app).delete('/route-1');

    expect(res.status).toBe(403);
  });

  it('deletes a route successfully', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);
    mockDeleteRoute.mockResolvedValue(true);

    const res = await request(app).delete('/route-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Route deleted successfully');
    expect(mockDeleteRoute).toHaveBeenCalledWith('route-1');
  });
});

describe('POST /:id/calculate (Calculate Route)', () => {
  let app: express.Application;

  const mockMapsService = {
    getDirections: vi.fn(),
    selectFastestRoute: vi.fn(),
    parseRouteSegments: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
    mockGetGoogleMapsService.mockReturnValue(mockMapsService as any);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).post('/route-1/calculate');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).post('/nonexistent/calculate');

    expect(res.status).toBe(404);
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRouteWithDetails.route, user_id: OTHER_USER_ID },
    });

    const res = await request(app).post('/route-1/calculate');

    expect(res.status).toBe(403);
  });

  it('returns 400 when route has fewer than 2 waypoints', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      waypoints: [mockRouteWithDetails.waypoints[0]],
    });

    const res = await request(app).post('/route-1/calculate');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('At least 2 waypoints');
  });

  it('calculates route successfully', async () => {
    mockGetRoute
      .mockResolvedValueOnce(mockRouteWithDetails)
      .mockResolvedValueOnce({
        ...mockRouteWithDetails,
        route: {
          ...mockRouteWithDetails.route,
          total_distance_km: 1050.5,
          total_duration_seconds: 36000,
          status: 'calculated',
        },
        segments: [
          {
            id: 'seg-1',
            route_id: 'route-1',
            segment_index: 0,
            start_waypoint_id: null,
            end_waypoint_id: null,
            distance_km: 1050.5,
            duration_seconds: 36000,
            country_code: 'DE',
            polyline_encoded: 'encoded',
          },
        ],
      });

    const mockDirectionsRoute = { legs: [], overview_polyline: { points: 'abc' } };
    mockMapsService.getDirections.mockResolvedValue([mockDirectionsRoute]);
    mockMapsService.selectFastestRoute.mockReturnValue(mockDirectionsRoute);
    mockMapsService.parseRouteSegments.mockReturnValue({
      segments: [
        {
          id: '',
          route_id: 'route-1',
          segment_index: 0,
          start_waypoint_id: null,
          end_waypoint_id: null,
          distance_km: 1050.5,
          duration_seconds: 36000,
          country_code: 'DE',
          polyline_encoded: 'encoded',
        },
      ],
      total_distance_km: 1050.5,
      total_duration_seconds: 36000,
      polyline_encoded: 'abc',
    });

    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockUpdateRoute.mockResolvedValue({
      ...mockRouteWithDetails.route,
      total_distance_km: 1050.5,
      total_duration_seconds: 36000,
      status: 'calculated',
    });

    const res = await request(app).post('/route-1/calculate');

    expect(res.status).toBe(200);
    expect(res.body.data.total_distance_km).toBe(1050.5);
    expect(res.body.data.total_duration_seconds).toBe(36000);
    expect(mockMapsService.getDirections).toHaveBeenCalledWith({
      origin: { latitude: 48.8566, longitude: 2.3522 },
      destination: { latitude: 52.52, longitude: 13.405 },
      waypoints: undefined,
      alternatives: false,
    });
  });

  it('passes intermediate waypoints to Google Maps', async () => {
    const routeWith3Waypoints = {
      ...mockRouteWithDetails,
      waypoints: [
        ...mockRouteWithDetails.waypoints.slice(0, 1),
        {
          id: 'wp-mid',
          route_id: 'route-1',
          position: 1,
          label: 'Mid',
          latitude: 50.0,
          longitude: 8.0,
          place_id: null,
          formatted_address: null,
          waypoint_type: 'stop' as const,
        },
        ...mockRouteWithDetails.waypoints.slice(1),
      ],
    };

    mockGetRoute
      .mockResolvedValueOnce(routeWith3Waypoints)
      .mockResolvedValueOnce(routeWith3Waypoints);

    const mockDirectionsRoute = { legs: [], overview_polyline: { points: 'abc' } };
    mockMapsService.getDirections.mockResolvedValue([mockDirectionsRoute]);
    mockMapsService.selectFastestRoute.mockReturnValue(mockDirectionsRoute);
    mockMapsService.parseRouteSegments.mockReturnValue({
      segments: [],
      total_distance_km: 500,
      total_duration_seconds: 18000,
      polyline_encoded: 'abc',
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockUpdateRoute.mockResolvedValue(routeWith3Waypoints.route);

    await request(app).post('/route-1/calculate');

    expect(mockMapsService.getDirections).toHaveBeenCalledWith({
      origin: { latitude: 48.8566, longitude: 2.3522 },
      destination: { latitude: 52.52, longitude: 13.405 },
      waypoints: [{ latitude: 50.0, longitude: 8.0 }],
      alternatives: false,
    });
  });
});

describe('GET /:id/alternatives (Get Alternative Routes)', () => {
  let app: express.Application;

  const mockMapsService = {
    getDirections: vi.fn(),
    parseRouteSegments: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
    mockGetGoogleMapsService.mockReturnValue(mockMapsService as any);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/route-1/alternatives');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).get('/nonexistent/alternatives');

    expect(res.status).toBe(404);
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRouteWithDetails.route, user_id: OTHER_USER_ID },
    });

    const res = await request(app).get('/route-1/alternatives');

    expect(res.status).toBe(403);
  });

  it('returns 400 when route has fewer than 2 waypoints', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      waypoints: [mockRouteWithDetails.waypoints[0]],
    });

    const res = await request(app).get('/route-1/alternatives');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('At least 2 waypoints');
  });

  it('returns alternative routes', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);

    const mockRoute1 = { legs: [], overview_polyline: { points: 'route1' } };
    const mockRoute2 = { legs: [], overview_polyline: { points: 'route2' } };
    mockMapsService.getDirections.mockResolvedValue([mockRoute1, mockRoute2]);
    mockMapsService.parseRouteSegments
      .mockReturnValueOnce({
        segments: [],
        total_distance_km: 1050,
        total_duration_seconds: 36000,
        polyline_encoded: 'route1',
      })
      .mockReturnValueOnce({
        segments: [],
        total_distance_km: 1100,
        total_duration_seconds: 38000,
        polyline_encoded: 'route2',
      });

    const res = await request(app).get('/route-1/alternatives');

    expect(res.status).toBe(200);
    expect(res.body.data.alternatives).toHaveLength(2);
    expect(res.body.data.alternatives[0].total_distance_km).toBe(1050);
    expect(res.body.data.alternatives[1].total_distance_km).toBe(1100);
    expect(mockMapsService.getDirections).toHaveBeenCalledWith(
      expect.objectContaining({ alternatives: true })
    );
  });
});
