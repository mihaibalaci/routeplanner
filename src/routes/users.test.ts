import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import usersRouter from './users';

// Mock the user service
vi.mock('../services/userService', () => ({
  findById: vi.fn(),
}));

// Mock the route service
vi.mock('../services/routeService', () => ({
  getRoutesByUser: vi.fn(),
  getRoute: vi.fn(),
  deleteRoute: vi.fn(),
  updateRoute: vi.fn(),
}));

// Mock the database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

import { findById } from '../services/userService';
import {
  getRoutesByUser,
  getRoute,
  deleteRoute,
  updateRoute,
} from '../services/routeService';

const mockFindById = vi.mocked(findById);
const mockGetRoutesByUser = vi.mocked(getRoutesByUser);
const mockGetRoute = vi.mocked(getRoute);
const mockDeleteRoute = vi.mocked(deleteRoute);
const mockUpdateRoute = vi.mocked(updateRoute);

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).requestId = 'test-request-id';
    if (userId) {
      (req as any).userId = userId;
    }
    next();
  });
  app.use('/', usersRouter);
  return app;
}

const TEST_USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';

const mockUser = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  password_hash: '$2b$12$hashedpassword',
  display_name: 'Test User',
  failed_login_attempts: 0,
  locked_until: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockRoute = {
  id: 'route-1',
  user_id: TEST_USER_ID,
  name: 'Test Route',
  total_distance_km: 500.5,
  total_duration_seconds: 18000,
  polyline_encoded: 'encoded-polyline',
  status: 'finalized' as const,
  created_at: new Date('2024-01-15'),
  updated_at: new Date('2024-01-15'),
};

const mockRouteWithDetails = {
  route: mockRoute,
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

describe('GET /me (Get User Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns 404 when user not found', async () => {
    mockFindById.mockResolvedValue(null);

    const res = await request(app).get('/me');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('returns user profile without sensitive data', async () => {
    mockFindById.mockResolvedValue(mockUser);

    const res = await request(app).get('/me');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(TEST_USER_ID);
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.displayName).toBe('Test User');
    // Should NOT include password_hash or internal fields
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.failed_login_attempts).toBeUndefined();
    expect(res.body.data.locked_until).toBeUndefined();
  });

  it('includes requestId in response', async () => {
    mockFindById.mockResolvedValue(mockUser);

    const res = await request(app).get('/me');

    expect(res.body.requestId).toBe('test-request-id');
  });
});

describe('GET /me/routes (Get Route History)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/me/routes');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns empty array when user has no routes', async () => {
    mockGetRoutesByUser.mockResolvedValue([]);

    const res = await request(app).get('/me/routes');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns routes sorted by creation date (newest first)', async () => {
    const routes = [
      { ...mockRoute, id: 'route-3', created_at: new Date('2024-03-01') },
      { ...mockRoute, id: 'route-2', created_at: new Date('2024-02-01') },
      { ...mockRoute, id: 'route-1', created_at: new Date('2024-01-01') },
    ];
    mockGetRoutesByUser.mockResolvedValue(routes);

    const res = await request(app).get('/me/routes');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].id).toBe('route-3');
    expect(res.body.data[1].id).toBe('route-2');
    expect(res.body.data[2].id).toBe('route-1');
  });

  it('returns route summaries without waypoints or segments', async () => {
    mockGetRoutesByUser.mockResolvedValue([mockRoute]);

    const res = await request(app).get('/me/routes');

    expect(res.status).toBe(200);
    const routeSummary = res.body.data[0];
    expect(routeSummary.id).toBe('route-1');
    expect(routeSummary.name).toBe('Test Route');
    expect(routeSummary.total_distance_km).toBe(500.5);
    expect(routeSummary.total_duration_seconds).toBe(18000);
    expect(routeSummary.status).toBe('finalized');
    expect(routeSummary.created_at).toBeDefined();
    // Should NOT include waypoints, segments, polyline, or user_id
    expect(routeSummary.waypoints).toBeUndefined();
    expect(routeSummary.segments).toBeUndefined();
    expect(routeSummary.polyline_encoded).toBeUndefined();
    expect(routeSummary.user_id).toBeUndefined();
  });

  it('limits results to max 100 routes', async () => {
    const routes = Array.from({ length: 120 }, (_, i) => ({
      ...mockRoute,
      id: `route-${i}`,
      created_at: new Date(2024, 0, 120 - i),
    }));
    mockGetRoutesByUser.mockResolvedValue(routes);

    const res = await request(app).get('/me/routes');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(100);
  });
});

describe('GET /me/routes/:routeId (Load Saved Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/me/routes/route-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).get('/me/routes/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRoute, user_id: OTHER_USER_ID },
    });

    const res = await request(app).get('/me/routes/route-1');

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns full route details with waypoints and segments', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).get('/me/routes/route-1');

    expect(res.status).toBe(200);
    expect(res.body.data.route.id).toBe('route-1');
    expect(res.body.data.waypoints).toHaveLength(2);
    expect(res.body.data.segments).toBeDefined();
  });
});

describe('DELETE /me/routes/:routeId (Delete Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).delete('/me/routes/route-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).delete('/me/routes/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRoute, user_id: OTHER_USER_ID },
    });

    const res = await request(app).delete('/me/routes/route-1');

    expect(res.status).toBe(403);
  });

  it('deletes route permanently', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);
    mockDeleteRoute.mockResolvedValue(true);

    const res = await request(app).delete('/me/routes/route-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Route deleted successfully');
    expect(mockDeleteRoute).toHaveBeenCalledWith('route-1');
  });
});

describe('POST /me/routes/:routeId/finalize (Finalize Route)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(401);
  });

  it('returns 404 when route does not exist', async () => {
    mockGetRoute.mockResolvedValue(null);

    const res = await request(app).post('/me/routes/nonexistent/finalize');

    expect(res.status).toBe(404);
  });

  it('returns 403 when route belongs to another user', async () => {
    mockGetRoute.mockResolvedValue({
      ...mockRouteWithDetails,
      route: { ...mockRoute, user_id: OTHER_USER_ID, status: 'calculated' as const },
    });

    const res = await request(app).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(403);
  });

  it('returns 200 with message when route is already finalized', async () => {
    mockGetRoute.mockResolvedValue(mockRouteWithDetails);

    const res = await request(app).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Route is already finalized');
  });

  it('finalizes a calculated route', async () => {
    const calculatedRoute = {
      ...mockRouteWithDetails,
      route: { ...mockRoute, status: 'calculated' as const },
    };
    mockGetRoute
      .mockResolvedValueOnce(calculatedRoute) // First call: check route
      .mockResolvedValueOnce({ ...mockRouteWithDetails, route: { ...mockRoute, status: 'finalized' as const } }); // After finalization

    mockGetRoutesByUser.mockResolvedValue([]);
    mockUpdateRoute.mockResolvedValue({ ...mockRoute, status: 'finalized' as const });

    const res = await request(app).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Route finalized successfully');
    expect(mockUpdateRoute).toHaveBeenCalledWith('route-1', { status: 'finalized' });
  });

  it('deletes oldest route when user has 100 routes', async () => {
    const calculatedRoute = {
      ...mockRouteWithDetails,
      route: { ...mockRoute, status: 'calculated' as const },
    };
    mockGetRoute
      .mockResolvedValueOnce(calculatedRoute)
      .mockResolvedValueOnce({ ...mockRouteWithDetails, route: { ...mockRoute, status: 'finalized' as const } });

    // Create 100 existing routes (sorted newest first)
    const existingRoutes = Array.from({ length: 100 }, (_, i) => ({
      ...mockRoute,
      id: `route-${i}`,
      created_at: new Date(2024, 0, 100 - i),
    }));
    mockGetRoutesByUser.mockResolvedValue(existingRoutes);
    mockDeleteRoute.mockResolvedValue(true);
    mockUpdateRoute.mockResolvedValue({ ...mockRoute, status: 'finalized' as const });

    const res = await request(app).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(200);
    // Should delete the oldest route(s) to make room
    expect(mockDeleteRoute).toHaveBeenCalled();
    // The oldest route is the last in the array (index 99)
    expect(mockDeleteRoute).toHaveBeenCalledWith('route-99');
  });

  it('does not delete routes when user has fewer than 100', async () => {
    const calculatedRoute = {
      ...mockRouteWithDetails,
      route: { ...mockRoute, status: 'calculated' as const },
    };
    mockGetRoute
      .mockResolvedValueOnce(calculatedRoute)
      .mockResolvedValueOnce({ ...mockRouteWithDetails, route: { ...mockRoute, status: 'finalized' as const } });

    mockGetRoutesByUser.mockResolvedValue([mockRoute]);
    mockUpdateRoute.mockResolvedValue({ ...mockRoute, status: 'finalized' as const });

    const res = await request(app).post('/me/routes/route-1/finalize');

    expect(res.status).toBe(200);
    expect(mockDeleteRoute).not.toHaveBeenCalled();
  });
});
