/**
 * API Integration Tests
 *
 * Tests the full HTTP request/response flow through the Express app.
 * Mocks the database module and external services (Google Maps, Redis)
 * to focus on the HTTP layer — verifying correct status codes, response
 * structure, and data flow between endpoints.
 *
 * Validates: Requirements 12.1, 12.2, 14.1, 16.1, 16.3, 16.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Mock Setup ───────────────────────────────────────────────────────────────

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getClient: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  closePool: vi.fn(),
  pool: { on: vi.fn(), query: vi.fn() },
}));

// Mock Redis
vi.mock('../../utils/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
    isOpen: true,
  }),
  disconnectRedis: vi.fn(),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(true),
  cacheDelete: vi.fn().mockResolvedValue(true),
  cacheIncrement: vi.fn().mockResolvedValue(1),
  CACHE_KEYS: {
    fuelPrice: (country: string, fuelType: string) => `fuel:price:${country}:${fuelType}`,
    routeCalc: (routeId: string) => `route:calc:${routeId}`,
    session: (userId: string) => `session:${userId}`,
    rateLimit: (userId: string) => `rate_limit:${userId}`,
    loginAttempts: (email: string) => `login_attempts:${email}`,
    placesAutocomplete: (queryHash: string) => `places:autocomplete:${queryHash}`,
    vignettePrices: (country: string, vehicleType: string) => `vignette:prices:${country}:${vehicleType}`,
    vignetteCountries: () => `vignette:countries`,
    vignetteRoute: (routeId: string) => `vignette:route:${routeId}`,
  },
  CACHE_TTL: {
    FUEL_PRICE: 21600,
    ROUTE_CALC: 3600,
    SESSION: 86400,
    RATE_LIMIT: 60,
    LOGIN_ATTEMPTS: 900,
    PLACES_AUTOCOMPLETE: 1800,
    VIGNETTE_PRICES: 86400,
    VIGNETTE_COUNTRIES: 86400,
    VIGNETTE_ROUTE: 3600,
  },
}));

// Mock Google Maps service
vi.mock('../../services/googleMapsService', () => ({
  getGoogleMapsService: vi.fn().mockReturnValue({
    geocode: vi.fn(),
    getDirections: vi.fn(),
    selectFastestRoute: vi.fn(),
    parseRouteSegments: vi.fn(),
    reverseGeocodeCountry: vi.fn(),
  }),
  resetGoogleMapsService: vi.fn(),
  GoogleMapsService: vi.fn(),
  GoogleMapsServiceError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock bcrypt for faster tests
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  compare: vi.fn().mockResolvedValue(true),
}));

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn(),
  })),
}));

// Mock apple-signin-auth
vi.mock('apple-signin-auth', () => ({
  default: {
    verifyIdToken: vi.fn(),
  },
  verifyIdToken: vi.fn(),
}));

import { query, transaction } from '../../utils/database';
import { cacheGet, cacheSet, cacheIncrement } from '../../utils/redis';
import { getGoogleMapsService } from '../../services/googleMapsService';

// Set environment variables before importing app
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
process.env.NODE_ENV = 'test';
process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';

// Import app after mocks are set up
import app from '../../index';

/** Reset all mocks and re-establish default behaviors */
function resetMocks() {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockReset();
  vi.mocked(cacheGet).mockReset().mockResolvedValue(null);
  vi.mocked(cacheSet).mockReset().mockResolvedValue(true);
  vi.mocked(cacheIncrement).mockReset().mockResolvedValue(1);
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_ROUTE_ID = '22222222-2222-2222-2222-222222222222';
const TEST_VEHICLE_ID = '33333333-3333-3333-3333-333333333333';
const TEST_STATION_ID = '44444444-4444-4444-4444-444444444444';

function generateToken(userId: string = TEST_USER_ID): string {
  return jwt.sign(
    { userId, email: 'test@example.com' },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

function generateExpiredToken(): string {
  return jwt.sign(
    { userId: TEST_USER_ID, email: 'test@example.com' },
    process.env.JWT_SECRET!,
    { expiresIn: '-1h' }
  );
}

/** Helper to mock getRoute returning a route owned by TEST_USER_ID */
function mockGetRoute(routeOverrides: any = {}, waypoints: any[] = [], segments: any[] = []) {
  const mockRoute = {
    id: TEST_ROUTE_ID,
    user_id: TEST_USER_ID,
    name: 'Test Route',
    total_distance_km: null,
    total_duration_seconds: null,
    polyline_encoded: null,
    status: 'draft',
    created_at: new Date(),
    updated_at: new Date(),
    ...routeOverrides,
  };

  (query as any)
    .mockResolvedValueOnce({ rows: [mockRoute], rowCount: 1 }) // SELECT route
    .mockResolvedValueOnce({ rows: waypoints, rowCount: waypoints.length }) // SELECT waypoints
    .mockResolvedValueOnce({ rows: segments, rowCount: segments.length }); // SELECT segments
}


// ─── Auth Flow Tests ──────────────────────────────────────────────────────────

describe('API Integration: Auth Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Register → Login → Access Protected → Token Validation', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: TEST_USER_ID,
        email: 'newuser@example.com',
        password_hash: '$2b$12$mockedhashvalue',
        display_name: 'New User',
        failed_login_attempts: 0,
        locked_until: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      // findByEmail returns no user (email not taken), then INSERT returns new user
      (query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass1',
          displayName: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(201);
      expect(res.body.data.id).toBe(TEST_USER_ID);
      expect(res.body.data.email).toBe('newuser@example.com');
      expect(res.body.data.displayName).toBe('New User');
      // Should NOT expose password hash
      expect(JSON.stringify(res.body)).not.toContain('password_hash');
      expect(JSON.stringify(res.body)).not.toContain('$2b$12$');
    });

    it('should login with valid credentials and receive a JWT', async () => {
      const mockUser = {
        id: TEST_USER_ID,
        email: 'newuser@example.com',
        password_hash: '$2b$12$mockedhashvalue',
        display_name: 'New User',
        failed_login_attempts: 0,
        locked_until: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      // findByEmail returns user
      (query as any).mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.expiresIn).toBe(86400);

      // Verify the token is valid
      const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe(TEST_USER_ID);
      expect(decoded.email).toBe('newuser@example.com');
    });

    it('should access protected endpoint with valid token', async () => {
      const token = generateToken();

      mockGetRoute({ name: 'My Route', status: 'calculated' });

      const res = await request(app)
        .get(`/api/v1/routes/${TEST_ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.route.id).toBe(TEST_ROUTE_ID);
    });

    it('should reject access to protected endpoint without token', async () => {
      const res = await request(app)
        .get(`/api/v1/routes/${TEST_ROUTE_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Authentication required');
    });

    it('should reject access with expired token', async () => {
      const expiredToken = generateExpiredToken();

      const res = await request(app)
        .get(`/api/v1/routes/${TEST_ROUTE_ID}`)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Token expired');
    });

    it('should reject access with invalid token', async () => {
      const res = await request(app)
        .get(`/api/v1/routes/${TEST_ROUTE_ID}`)
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid token');
    });
  });
});


// ─── Route Planning Flow Tests ────────────────────────────────────────────────

describe('API Integration: Route Planning Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Create Route → Add Waypoints → Calculate → Get Alternatives', () => {
    it('should create a route with waypoints', async () => {
      const token = generateToken();

      const mockRoute = {
        id: TEST_ROUTE_ID,
        user_id: TEST_USER_ID,
        name: 'Vienna to Budapest',
        total_distance_km: null,
        total_duration_seconds: null,
        polyline_encoded: null,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, label: 'Vienna', latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, label: 'Budapest', latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination' },
      ];

      (transaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [mockRoute], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [mockWaypoints[0]], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [mockWaypoints[1]], rowCount: 1 }),
        };
        return callback(mockClient);
      });

      const res = await request(app)
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Vienna to Budapest',
          waypoints: [
            { latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin', label: 'Vienna' },
            { latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination', label: 'Budapest' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(201);
      expect(res.body.data.route.name).toBe('Vienna to Budapest');
      expect(res.body.data.waypoints).toHaveLength(2);
    });

    it('should add a waypoint to an existing route', async () => {
      const token = generateToken();

      const existingWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination' },
      ];

      const updatedWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin' },
        { id: 'wp-3', route_id: TEST_ROUTE_ID, position: 1, latitude: 47.8, longitude: 17.5, waypoint_type: 'stop', label: 'Bratislava' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 2, latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination' },
      ];

      // Mock getRoute for ownership check
      mockGetRoute({ name: 'Vienna to Budapest' }, existingWaypoints);

      // Mock addWaypoint transaction
      (transaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: updatedWaypoints, rowCount: 3 }),
        };
        return callback(mockClient);
      });

      const res = await request(app)
        .put(`/api/v1/routes/${TEST_ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'add_waypoint',
          waypoint: { latitude: 47.8, longitude: 17.5, waypoint_type: 'stop', label: 'Bratislava' },
          position: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.waypoints).toHaveLength(3);
    });

    it('should calculate a route using Google Maps', async () => {
      const token = generateToken();

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination' },
      ];

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 243.5, duration_seconds: 9000, country_code: 'AT', polyline_encoded: 'abc' },
      ];

      // Mock getRoute for ownership check
      mockGetRoute({ name: 'Vienna to Budapest' }, mockWaypoints);

      // Mock: DELETE segments, INSERT segment, UPDATE route, then getRoute again
      (query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE existing segments
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT segment
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'calculated', total_distance_km: 243.5, total_duration_seconds: 9000 }], rowCount: 1 }) // UPDATE route
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'calculated', total_distance_km: 243.5, total_duration_seconds: 9000, created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute SELECT route
        .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute SELECT waypoints
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 1 }); // getRoute SELECT segments

      // Mock Google Maps service
      const mapsService = getGoogleMapsService();
      const mockDirectionsRoute = {
        legs: [{ distance: { value: 243500 }, duration: { value: 9000 }, end_address: 'Budapest, Hungary', steps: [] }],
        overview_polyline: { points: 'full_encoded_polyline' },
      };

      (mapsService.getDirections as any).mockResolvedValue([mockDirectionsRoute]);
      (mapsService.selectFastestRoute as any).mockReturnValue(mockDirectionsRoute);
      (mapsService.parseRouteSegments as any).mockReturnValue({
        segments: [{ id: '', route_id: TEST_ROUTE_ID, segment_index: 0, start_waypoint_id: null, end_waypoint_id: null, distance_km: 243.5, duration_seconds: 9000, country_code: 'AT', polyline_encoded: 'encoded_polyline' }],
        total_distance_km: 243.5,
        total_duration_seconds: 9000,
        polyline_encoded: 'full_encoded_polyline',
      });

      const res = await request(app)
        .post(`/api/v1/routes/${TEST_ROUTE_ID}/calculate`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total_distance_km).toBe(243.5);
      expect(res.body.data.total_duration_seconds).toBe(9000);
      expect(mapsService.getDirections).toHaveBeenCalled();
    });

    it('should get alternative routes', async () => {
      const token = generateToken();

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination' },
      ];

      // Mock getRoute for ownership check
      mockGetRoute({ name: 'Vienna to Budapest', status: 'calculated' }, mockWaypoints);

      const mapsService = getGoogleMapsService();
      const mockRoutes = [
        { legs: [{ distance: { value: 243500 }, duration: { value: 9000 }, end_address: 'Budapest, Hungary', steps: [] }], overview_polyline: { points: 'route1' } },
        { legs: [{ distance: { value: 260000 }, duration: { value: 9500 }, end_address: 'Budapest, Hungary', steps: [] }], overview_polyline: { points: 'route2' } },
      ];

      (mapsService.getDirections as any).mockResolvedValue(mockRoutes);
      (mapsService.parseRouteSegments as any)
        .mockReturnValueOnce({ segments: [{ segment_index: 0, distance_km: 243.5, duration_seconds: 9000, country_code: 'AT' }], total_distance_km: 243.5, total_duration_seconds: 9000, polyline_encoded: 'route1' })
        .mockReturnValueOnce({ segments: [{ segment_index: 0, distance_km: 260, duration_seconds: 9500, country_code: 'SK' }], total_distance_km: 260, total_duration_seconds: 9500, polyline_encoded: 'route2' });

      const res = await request(app)
        .get(`/api/v1/routes/${TEST_ROUTE_ID}/alternatives`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.alternatives).toHaveLength(2);
      expect(res.body.data.alternatives[0].total_distance_km).toBe(243.5);
      expect(res.body.data.alternatives[1].total_distance_km).toBe(260);
    });
  });
});


// ─── Trip Cost Flow Tests ─────────────────────────────────────────────────────

describe('API Integration: Trip Cost Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Create Vehicle → Calculate Cost → Verify Breakdown', () => {
    it('should create a vehicle profile', async () => {
      const token = generateToken();

      const mockProfile = {
        id: TEST_VEHICLE_ID,
        user_id: TEST_USER_ID,
        name: 'My Car',
        vehicle_type: 'car',
        fuel_type: 'diesel',
        tank_capacity_liters: 60,
        consumption_per_100km: 6.5,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      // COUNT profiles, then INSERT
      (query as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockProfile], rowCount: 1 });

      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'My Car',
          vehicle_type: 'car',
          fuel_type: 'diesel',
          tank_capacity_liters: 60,
          consumption_per_100km: 6.5,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(201);
      expect(res.body.data.name).toBe('My Car');
      expect(res.body.data.vehicle_type).toBe('car');
      expect(res.body.data.fuel_type).toBe('diesel');
      expect(res.body.data.tank_capacity_liters).toBe(60);
      expect(res.body.data.consumption_per_100km).toBe(6.5);
    });

    it('should reject vehicle profile with invalid tank capacity', async () => {
      const token = generateToken();

      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Bad Vehicle',
          vehicle_type: 'car',
          fuel_type: 'diesel',
          tank_capacity_liters: 300,
          consumption_per_100km: 6.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.some((e: string) => e.includes('Tank capacity'))).toBe(true);
    });

    it('should calculate trip cost for a route with country breakdown', async () => {
      const token = generateToken();

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 100, duration_seconds: 3600, country_code: 'AT', polyline_encoded: 'abc' },
        { id: 'seg-2', route_id: TEST_ROUTE_ID, segment_index: 1, distance_km: 143.5, duration_seconds: 5400, country_code: 'HU', polyline_encoded: 'def' },
      ];

      const mockVehicle = {
        id: TEST_VEHICLE_ID,
        user_id: TEST_USER_ID,
        name: 'My Car',
        vehicle_type: 'car',
        fuel_type: 'diesel',
        tank_capacity_liters: 60,
        consumption_per_100km: 6.5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Trips route handler: getRoute for ownership check
      mockGetRoute({ name: 'Vienna to Budapest', status: 'calculated' }, [], mockSegments);

      // tripCostService.calculateTripCost: getRoute, getProfile, getPrice x2, INSERT
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute route
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getRoute waypoints
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // getRoute segments
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 }) // getProfile
        .mockResolvedValueOnce({ rows: [{ id: 'fp-1', country_code: 'AT', fuel_type: 'diesel', price_per_liter_eur: 1.55, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }) // getPrice AT
        .mockResolvedValueOnce({ rows: [{ id: 'fp-2', country_code: 'HU', fuel_type: 'diesel', price_per_liter_eur: 1.45, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }) // getPrice HU
        .mockResolvedValueOnce({ // INSERT trip_cost
          rows: [{
            id: 'tc-1',
            route_id: TEST_ROUTE_ID,
            vehicle_profile_id: TEST_VEHICLE_ID,
            total_cost_eur: '23.58',
            total_fuel_liters: '15.83',
            country_breakdown: JSON.stringify([
              { country_code: 'AT', distance_km: 100, fuel_liters: 6.5, cost_eur: 10.08, price_per_liter: 1.55 },
              { country_code: 'HU', distance_km: 143.5, fuel_liters: 9.33, cost_eur: 13.53, price_per_liter: 1.45 },
            ]),
            prices_outdated: false,
            calculated_at: new Date(),
          }],
          rowCount: 1,
        });

      const res = await request(app)
        .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleId: TEST_VEHICLE_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.total_cost_eur).toBeDefined();
      expect(res.body.data.country_breakdown).toBeDefined();
      expect(res.body.data.country_breakdown).toHaveLength(2);
      expect(res.body.data.country_breakdown[0].country_code).toBe('AT');
      expect(res.body.data.country_breakdown[1].country_code).toBe('HU');
      expect(res.body.data.prices_outdated).toBe(false);
    });

    it('should return 400 when no vehicle is selected', async () => {
      const token = generateToken();

      mockGetRoute({ status: 'calculated' });

      const res = await request(app)
        .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('vehicle');
    });
  });
});


// ─── Vignette Flow Tests ──────────────────────────────────────────────────────

describe('API Integration: Vignette Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Route crossing AT, HU → Get Vignette Requirements → Verify Cost', () => {
    it('should return vignette requirements for a route crossing AT and HU', async () => {
      const token = generateToken();

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 100, duration_seconds: 3600, country_code: 'AT' },
        { id: 'seg-2', route_id: TEST_ROUTE_ID, segment_index: 1, distance_km: 143.5, duration_seconds: 5400, country_code: 'HU' },
      ];

      const mockVignetteCountries = [
        { id: 'vc-1', country_code: 'AT', country_name: 'Austria', motorcycle_exempt: false, available_durations: ['10-day', '2-month', '1-year'], active: true, updated_at: new Date() },
        { id: 'vc-2', country_code: 'HU', country_name: 'Hungary', motorcycle_exempt: false, available_durations: ['10-day', '1-month', '1-year'], active: true, updated_at: new Date() },
      ];

      const mockPricesAT = [
        { id: 'vp-1', vignette_country_id: 'vc-1', vehicle_type: 'car', duration: '10-day', price_eur: '9.90', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
        { id: 'vp-2', vignette_country_id: 'vc-1', vehicle_type: 'car', duration: '2-month', price_eur: '28.90', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
      ];

      const mockPricesHU = [
        { id: 'vp-3', vignette_country_id: 'vc-2', vehicle_type: 'car', duration: '10-day', price_eur: '12.50', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
        { id: 'vp-4', vignette_country_id: 'vc-2', vehicle_type: 'car', duration: '1-month', price_eur: '18.00', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
      ];

      // Route handler: getRoute for ownership check (3 queries)
      mockGetRoute({ name: 'Vienna to Budapest', status: 'calculated' }, [], mockSegments);

      // vignetteService.getRouteVignetteRequirements: getRoute (3 queries), getCountriesRequiringVignette (1 query), getPrices x2 (2 queries)
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute route
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getRoute waypoints
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // getRoute segments
        .mockResolvedValueOnce({ rows: mockVignetteCountries, rowCount: 2 }) // getCountriesRequiringVignette
        .mockResolvedValueOnce({ rows: mockPricesAT, rowCount: 2 }) // getPrices AT
        .mockResolvedValueOnce({ rows: mockPricesHU, rowCount: 2 }); // getPrices HU

      const res = await request(app)
        .get(`/api/v1/vignettes/route/${TEST_ROUTE_ID}?vehicle_type=car`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requirements).toBeDefined();
      expect(res.body.data.requirements).toHaveLength(2);

      const atReq = res.body.data.requirements.find((r: any) => r.countryCode === 'AT');
      const huReq = res.body.data.requirements.find((r: any) => r.countryCode === 'HU');

      expect(atReq).toBeDefined();
      expect(atReq.required).toBe(true);
      expect(atReq.countryName).toBe('Austria');

      expect(huReq).toBeDefined();
      expect(huReq.required).toBe(true);
      expect(huReq.countryName).toBe('Hungary');
    });

    it('should calculate vignette cost with selected durations', async () => {
      const token = generateToken();

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 100, duration_seconds: 3600, country_code: 'AT' },
        { id: 'seg-2', route_id: TEST_ROUTE_ID, segment_index: 1, distance_km: 143.5, duration_seconds: 5400, country_code: 'HU' },
      ];

      const mockVignetteCountries = [
        { id: 'vc-1', country_code: 'AT', country_name: 'Austria', motorcycle_exempt: false, available_durations: ['10-day', '2-month', '1-year'], active: true, updated_at: new Date() },
        { id: 'vc-2', country_code: 'HU', country_name: 'Hungary', motorcycle_exempt: false, available_durations: ['10-day', '1-month', '1-year'], active: true, updated_at: new Date() },
      ];

      const mockPricesAT = [
        { id: 'vp-1', vignette_country_id: 'vc-1', vehicle_type: 'car', duration: '10-day', price_eur: '9.90', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
      ];

      const mockPricesHU = [
        { id: 'vp-3', vignette_country_id: 'vc-2', vehicle_type: 'car', duration: '10-day', price_eur: '12.50', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
      ];

      // Route handler: getRoute for ownership check
      mockGetRoute({ name: 'Vienna to Budapest', status: 'calculated' }, [], mockSegments);

      // vignetteService.calculateVignetteCost → getRouteVignetteRequirements → getRoute, getCountries, getPrices x2
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 })
        .mockResolvedValueOnce({ rows: mockVignetteCountries, rowCount: 2 })
        .mockResolvedValueOnce({ rows: mockPricesAT, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockPricesHU, rowCount: 1 });

      const durations = JSON.stringify({ AT: '10-day', HU: '10-day' });

      const res = await request(app)
        .get(`/api/v1/vignettes/route/${TEST_ROUTE_ID}/cost?vehicle_type=car&durations=${encodeURIComponent(durations)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalVignetteCostEur).toBe(22.4);
      expect(res.body.data.countryBreakdown).toHaveLength(2);

      const atBreakdown = res.body.data.countryBreakdown.find((b: any) => b.countryCode === 'AT');
      const huBreakdown = res.body.data.countryBreakdown.find((b: any) => b.countryCode === 'HU');

      expect(atBreakdown.costEur).toBe(9.9);
      expect(atBreakdown.selectedDuration).toBe('10-day');
      expect(huBreakdown.costEur).toBe(12.5);
      expect(huBreakdown.selectedDuration).toBe('10-day');
    });
  });

  describe('Motorcycle Exemption', () => {
    it('should not require vignette for motorcycle crossing RO', async () => {
      const token = generateToken();

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 200, duration_seconds: 7200, country_code: 'RO' },
      ];

      const mockVignetteCountries = [
        { id: 'vc-ro', country_code: 'RO', country_name: 'Romania', motorcycle_exempt: true, available_durations: ['10-day', '1-month', '1-year'], active: true, updated_at: new Date() },
      ];

      // Route handler: getRoute for ownership check
      mockGetRoute({ name: 'Route through Romania', status: 'calculated' }, [], mockSegments);

      // vignetteService: getRoute, getCountriesRequiringVignette
      // No getPrices call because motorcycle is exempt for RO
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Route through Romania', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockVignetteCountries, rowCount: 1 });

      const res = await request(app)
        .get(`/api/v1/vignettes/route/${TEST_ROUTE_ID}?vehicle_type=motorcycle`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requirements).toHaveLength(1);
      expect(res.body.data.requirements[0].countryCode).toBe('RO');
      expect(res.body.data.requirements[0].required).toBe(false);
      expect(res.body.data.requirements[0].motorcycleExempt).toBe(true);
    });
  });
});


// ─── Refuel Flow Tests ────────────────────────────────────────────────────────

describe('API Integration: Refuel Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Suggest Stops → Accept → Verify Route Updated', () => {
    it('should suggest refuel stops for a route', async () => {
      const token = generateToken();

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2, longitude: 16.4, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, latitude: 44.4, longitude: 26.1, waypoint_type: 'destination' },
      ];

      // Vehicle: 60L tank, 6.5L/100km → max range ~923km, threshold ~785km
      const mockVehicle = {
        id: TEST_VEHICLE_ID,
        user_id: TEST_USER_ID,
        name: 'My Car',
        vehicle_type: 'car',
        fuel_type: 'diesel',
        tank_capacity_liters: 60,
        consumption_per_100km: 6.5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Segments totaling 800km to trigger refuel (exceeds 785km threshold)
      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, start_waypoint_id: 'wp-1', end_waypoint_id: 'wp-2', distance_km: 800, duration_seconds: 28800, country_code: 'HU' },
      ];

      const mockStations = [
        { id: TEST_STATION_ID, name: 'Shell Budapest', latitude: 47.5, longitude: 19.0, country_code: 'HU', place_id: 'place-1', fuel_types_available: ['diesel'], distance_from_route_km: 1.2 },
        { id: 'station-2', name: 'MOL Budapest', latitude: 47.51, longitude: 19.01, country_code: 'HU', place_id: 'place-2', fuel_types_available: ['diesel'], distance_from_route_km: 1.8 },
      ];

      // Route handler: getRoute for ownership check (verifyRouteOwnership)
      mockGetRoute({ name: 'Long Route', status: 'calculated' }, mockWaypoints, mockSegments);

      // refuelAdvisorService.suggestRefuelStops: getRoute, getProfile, findStationsNearPoint, getPrice x2
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Long Route', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute route
        .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute waypoints
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 1 }) // getRoute segments
        .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 }) // getProfile
        .mockResolvedValueOnce({ rows: mockStations, rowCount: 2 }) // findStationsNearPoint (2km radius)
        .mockResolvedValueOnce({ rows: [{ id: 'fp-1', country_code: 'HU', fuel_type: 'diesel', price_per_liter_eur: 1.45, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }) // getPrice station 1
        .mockResolvedValueOnce({ rows: [{ id: 'fp-1', country_code: 'HU', fuel_type: 'diesel', price_per_liter_eur: 1.45, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }); // getPrice station 2

      const res = await request(app)
        .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleId: TEST_VEHICLE_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions).toBeDefined();
      expect(res.body.data.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.suggestions[0].station).toBeDefined();
      expect(res.body.data.suggestions[0].station.name).toBe('Shell Budapest');
      expect(res.body.data.suggestions[0].reason).toBe('range_warning');
    });

    it('should accept a refuel stop and update the route', async () => {
      const token = generateToken();

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, latitude: 48.2, longitude: 16.4, waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, latitude: 44.4, longitude: 26.1, waypoint_type: 'destination' },
      ];

      const mockStation = {
        id: TEST_STATION_ID,
        name: 'Shell Budapest',
        latitude: 47.5,
        longitude: 19.0,
        country_code: 'HU',
        place_id: 'place-1',
        fuel_types_available: ['diesel'],
        fuel_price_eur: 1.45,
      };

      const mockRefuelStop = {
        id: 'rs-1',
        route_id: TEST_ROUTE_ID,
        fuel_station_id: TEST_STATION_ID,
        position_in_route: 1,
        fuel_price_eur: 1.45,
        status: 'accepted',
        created_at: new Date(),
      };

      // Route handler: verifyRouteOwnership → getRoute
      mockGetRoute({ name: 'Long Route', status: 'calculated' }, mockWaypoints);

      // acceptStop service: getRoute, SELECT fuel_station, then transaction
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Long Route', status: 'calculated', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute route
        .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute waypoints
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getRoute segments
        .mockResolvedValueOnce({ rows: [mockStation], rowCount: 1 }); // SELECT fuel_station

      // Mock transaction for acceptStop
      (transaction as any).mockImplementation(async (callback: any) => {
        const mockClient = {
          query: vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE waypoint positions
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT waypoint
            .mockResolvedValueOnce({ rows: [mockRefuelStop], rowCount: 1 }) // INSERT refuel_stop
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }), // UPDATE route status
        };
        return callback(mockClient);
      });

      const res = await request(app)
        .post(`/api/v1/refuel/${TEST_ROUTE_ID}/accept/${TEST_STATION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.refuelStop).toBeDefined();
      expect(res.body.data.refuelStop.status).toBe('accepted');
      expect(res.body.data.refuelStop.fuel_station_id).toBe(TEST_STATION_ID);
    });
  });
});


// ─── Export Flow Tests ────────────────────────────────────────────────────────

describe('API Integration: Export Flow', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Export Route in GPX Format', () => {
    it('should export a route in GPX format with valid XML', async () => {
      const token = generateToken();

      const mockWaypoints = [
        { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, label: 'Vienna', latitude: 48.2082, longitude: 16.3738, place_id: null, formatted_address: 'Vienna, Austria', waypoint_type: 'origin' },
        { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, label: 'Budapest', latitude: 47.4979, longitude: 19.0402, place_id: null, formatted_address: 'Budapest, Hungary', waypoint_type: 'destination' },
      ];

      const mockSegments = [
        { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 243.5, duration_seconds: 9000, country_code: 'AT', polyline_encoded: '_p~iF~ps|U' },
      ];

      // Export route handler: first validates format, then calls getRoute for ownership
      mockGetRoute({ name: 'Vienna to Budapest', status: 'finalized', total_distance_km: 243.5 }, mockWaypoints, mockSegments);

      // exportRoute service: getRoute, then getAcceptedRefuelStops
      (query as any)
        .mockResolvedValueOnce({ rows: [{ id: TEST_ROUTE_ID, user_id: TEST_USER_ID, name: 'Vienna to Budapest', status: 'finalized', total_distance_km: 243.5, total_duration_seconds: 9000, polyline_encoded: 'encoded', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }) // getRoute route
        .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute waypoints
        .mockResolvedValueOnce({ rows: mockSegments, rowCount: 1 }) // getRoute segments
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getAcceptedRefuelStops

      const res = await request(app)
        .post(`/api/v1/routes/${TEST_ROUTE_ID}/export`)
        .set('Authorization', `Bearer ${token}`)
        .send({ format: 'gpx' });

      expect(res.status).toBe(200);
      expect(res.body.data.format).toBe('gpx');
      expect(res.body.data.files).toBeDefined();
      expect(res.body.data.files).toHaveLength(1);
      expect(res.body.data.split).toBe(false);

      // Decode the base64 file and verify it's valid GPX XML
      const gpxContent = Buffer.from(res.body.data.files[0], 'base64').toString('utf-8');
      expect(gpxContent).toContain('<?xml');
      expect(gpxContent).toContain('<gpx');
      expect(gpxContent).toContain('Vienna');
      expect(gpxContent).toContain('Budapest');
      expect(gpxContent).toContain('<wpt');
    });

    it('should reject export with unsupported format', async () => {
      const token = generateToken();

      const res = await request(app)
        .post(`/api/v1/routes/${TEST_ROUTE_ID}/export`)
        .set('Authorization', `Bearer ${token}`)
        .send({ format: 'pdf' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Unsupported export format');
    });

    it('should return 404 for non-existent route export', async () => {
      const token = generateToken();

      // getRoute returns null (no route found)
      (query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT route returns empty

      const res = await request(app)
        .post(`/api/v1/routes/${TEST_ROUTE_ID}/export`)
        .set('Authorization', `Bearer ${token}`)
        .send({ format: 'gpx' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Route not found');
    });
  });
});


// ─── Response Structure Tests ─────────────────────────────────────────────────

describe('API Integration: Response Structure', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should return health check without authentication', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return consistent error structure for 401', async () => {
    const res = await request(app)
      .get('/api/v1/vehicles');

    expect(res.status).toBe(401);
    expect(res.body.status).toBe(401);
    expect(res.body.message).toBeDefined();
    expect(typeof res.body.message).toBe('string');
  });

  it('should return JSON content type for all API responses', async () => {
    const token = generateToken();

    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.headers['content-type']).toContain('application/json');
  });

  it('should include requestId in error responses', async () => {
    const res = await request(app)
      .get('/api/v1/routes/nonexistent');

    expect(res.status).toBe(401);
    expect(res.body.requestId).toBeDefined();
    expect(typeof res.body.requestId).toBe('string');
  });
});
