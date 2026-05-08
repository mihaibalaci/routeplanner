/**
 * End-to-End Tests for Critical User Flows
 *
 * Simulates complete user journeys through the API, testing the full
 * request lifecycle including auth, route planning, cost calculation,
 * refuel suggestions, export, rate limiting, and vignette scraping fallback.
 *
 * Validates: Requirements 12.1, 12.5, 14.5, 16.4, 16.8
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
import bcrypt from 'bcrypt';

// Set environment variables before importing app
process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests';
process.env.NODE_ENV = 'test';
process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';

// Import app after mocks are set up
import app from '../../index';

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

function resetMocks() {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockReset();
  vi.mocked(cacheGet).mockReset().mockResolvedValue(null);
  vi.mocked(cacheSet).mockReset().mockResolvedValue(true);
  vi.mocked(cacheIncrement).mockReset().mockResolvedValue(1);
}

// ─── E2E Flow 1: Full Journey ─────────────────────────────────────────────────

describe('E2E Flow: Full Journey (Register → Route → Cost → Refuel → Export)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should complete the full user journey from registration to export', async () => {
    // ─── Step 1: Register ───────────────────────────────────────────────
    const mockUser = {
      id: TEST_USER_ID,
      email: 'journey@example.com',
      password_hash: '$2b$12$mockedhashvalue',
      display_name: 'Journey User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // findByEmail (no existing)
      .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 }); // INSERT user

    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'journey@example.com',
        password: 'SecurePass1',
        displayName: 'Journey User',
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.email).toBe('journey@example.com');

    // ─── Step 2: Login ──────────────────────────────────────────────────
    resetMocks();
    (query as any).mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 }); // findByEmail

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'journey@example.com',
        password: 'SecurePass1',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
    const token = loginRes.body.data.token;

    // ─── Step 3: Create Route ───────────────────────────────────────────
    resetMocks();
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

    const createRouteRes = await request(app)
      .post('/api/v1/routes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vienna to Budapest',
        waypoints: [
          { latitude: 48.2082, longitude: 16.3738, waypoint_type: 'origin', label: 'Vienna' },
          { latitude: 47.4979, longitude: 19.0402, waypoint_type: 'destination', label: 'Budapest' },
        ],
      });

    expect(createRouteRes.status).toBe(201);
    expect(createRouteRes.body.data.route.name).toBe('Vienna to Budapest');

    // ─── Step 4: Calculate Route ────────────────────────────────────────
    resetMocks();
    const mockSegments = [
      { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, distance_km: 100, duration_seconds: 3600, country_code: 'AT', polyline_encoded: 'abc' },
      { id: 'seg-2', route_id: TEST_ROUTE_ID, segment_index: 1, distance_km: 143.5, duration_seconds: 5400, country_code: 'HU', polyline_encoded: 'def' },
    ];

    // getRoute for ownership check
    (query as any)
      .mockResolvedValueOnce({ rows: [mockRoute], rowCount: 1 }) // SELECT route
      .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // SELECT waypoints
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT segments
      // calculate route queries
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE existing segments
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT segment 1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT segment 2
      .mockResolvedValueOnce({ rows: [{ ...mockRoute, status: 'calculated', total_distance_km: 243.5, total_duration_seconds: 9000 }], rowCount: 1 }) // UPDATE route
      .mockResolvedValueOnce({ rows: [{ ...mockRoute, status: 'calculated', total_distance_km: 243.5, total_duration_seconds: 9000 }], rowCount: 1 }) // getRoute route
      .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute waypoints
      .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }); // getRoute segments

    const mapsService = getGoogleMapsService();
    const mockDirectionsRoute = {
      legs: [
        { distance: { value: 100000 }, duration: { value: 3600 }, end_address: 'Bratislava', steps: [] },
        { distance: { value: 143500 }, duration: { value: 5400 }, end_address: 'Budapest, Hungary', steps: [] },
      ],
      overview_polyline: { points: 'full_encoded_polyline' },
    };

    (mapsService.getDirections as any).mockResolvedValue([mockDirectionsRoute]);
    (mapsService.selectFastestRoute as any).mockReturnValue(mockDirectionsRoute);
    (mapsService.parseRouteSegments as any).mockReturnValue({
      segments: [
        { id: '', route_id: TEST_ROUTE_ID, segment_index: 0, start_waypoint_id: null, end_waypoint_id: null, distance_km: 100, duration_seconds: 3600, country_code: 'AT', polyline_encoded: 'abc' },
        { id: '', route_id: TEST_ROUTE_ID, segment_index: 1, start_waypoint_id: null, end_waypoint_id: null, distance_km: 143.5, duration_seconds: 5400, country_code: 'HU', polyline_encoded: 'def' },
      ],
      total_distance_km: 243.5,
      total_duration_seconds: 9000,
      polyline_encoded: 'full_encoded_polyline',
    });

    const calcRes = await request(app)
      .post(`/api/v1/routes/${TEST_ROUTE_ID}/calculate`)
      .set('Authorization', `Bearer ${token}`);

    expect(calcRes.status).toBe(200);
    expect(calcRes.body.data.total_distance_km).toBe(243.5);

    // ─── Step 5: Create Vehicle Profile ─────────────────────────────────
    resetMocks();
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

    (query as any)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // COUNT profiles
      .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 }); // INSERT

    const vehicleRes = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My Car',
        vehicle_type: 'car',
        fuel_type: 'diesel',
        tank_capacity_liters: 60,
        consumption_per_100km: 6.5,
      });

    expect(vehicleRes.status).toBe(201);
    expect(vehicleRes.body.data.name).toBe('My Car');

    // ─── Step 6: Calculate Trip Cost (fuel + vignettes) ─────────────────
    resetMocks();
    const calculatedRoute = { ...mockRoute, status: 'calculated', total_distance_km: 243.5, total_duration_seconds: 9000 };

    // Route handler: getRoute for ownership check
    (query as any)
      .mockResolvedValueOnce({ rows: [calculatedRoute], rowCount: 1 }) // SELECT route
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT waypoints
      .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // SELECT segments
      // tripCostService: getRoute, getProfile, getPrice x2, INSERT
      .mockResolvedValueOnce({ rows: [calculatedRoute], rowCount: 1 }) // getRoute route
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getRoute waypoints
      .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // getRoute segments
      .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 }) // getProfile
      .mockResolvedValueOnce({ rows: [{ id: 'fp-1', country_code: 'AT', fuel_type: 'diesel', price_per_liter_eur: 1.55, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }) // getPrice AT
      .mockResolvedValueOnce({ rows: [{ id: 'fp-2', country_code: 'HU', fuel_type: 'diesel', price_per_liter_eur: 1.45, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }) // getPrice HU
      .mockResolvedValueOnce({
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
      }); // INSERT trip_cost

    const costRes = await request(app)
      .post(`/api/v1/trips/${TEST_ROUTE_ID}/cost`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(costRes.status).toBe(200);
    expect(costRes.body.data.total_cost_eur).toBeDefined();
    expect(costRes.body.data.country_breakdown).toHaveLength(2);
    expect(costRes.body.data.country_breakdown[0].country_code).toBe('AT');
    expect(costRes.body.data.country_breakdown[1].country_code).toBe('HU');

    // ─── Step 7: Suggest Refuel Stops ───────────────────────────────────
    resetMocks();
    const longSegments = [
      { id: 'seg-1', route_id: TEST_ROUTE_ID, segment_index: 0, start_waypoint_id: 'wp-1', end_waypoint_id: 'wp-2', distance_km: 800, duration_seconds: 28800, country_code: 'HU' },
    ];

    const mockStations = [
      { id: TEST_STATION_ID, name: 'Shell Budapest', latitude: 47.5, longitude: 19.0, country_code: 'HU', place_id: 'place-1', fuel_types_available: ['diesel'], distance_from_route_km: 1.2 },
    ];

    // Route handler: getRoute for ownership check
    (query as any)
      .mockResolvedValueOnce({ rows: [{ ...calculatedRoute }], rowCount: 1 }) // SELECT route
      .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // SELECT waypoints
      .mockResolvedValueOnce({ rows: longSegments, rowCount: 1 }) // SELECT segments
      // refuelAdvisorService: getRoute, getProfile, findStations, getPrice
      .mockResolvedValueOnce({ rows: [calculatedRoute], rowCount: 1 }) // getRoute route
      .mockResolvedValueOnce({ rows: mockWaypoints, rowCount: 2 }) // getRoute waypoints
      .mockResolvedValueOnce({ rows: longSegments, rowCount: 1 }) // getRoute segments
      .mockResolvedValueOnce({ rows: [mockVehicle], rowCount: 1 }) // getProfile
      .mockResolvedValueOnce({ rows: mockStations, rowCount: 1 }) // findStationsNearPoint
      .mockResolvedValueOnce({ rows: [{ id: 'fp-1', country_code: 'HU', fuel_type: 'diesel', price_per_liter_eur: 1.45, source: 'cieloweb', fetched_at: new Date(), expires_at: new Date(Date.now() + 21600000) }], rowCount: 1 }); // getPrice

    const refuelRes = await request(app)
      .post(`/api/v1/refuel/${TEST_ROUTE_ID}/suggest`)
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicleId: TEST_VEHICLE_ID });

    expect(refuelRes.status).toBe(200);
    expect(refuelRes.body.data.suggestions).toBeDefined();
    expect(refuelRes.body.data.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(refuelRes.body.data.suggestions[0].station.name).toBe('Shell Budapest');

    // ─── Step 8: Export Route in GPX ────────────────────────────────────
    resetMocks();
    const finalizedRoute = { ...mockRoute, status: 'finalized', total_distance_km: 243.5, total_duration_seconds: 9000, polyline_encoded: 'encoded' };

    const exportWaypoints = [
      { id: 'wp-1', route_id: TEST_ROUTE_ID, position: 0, label: 'Vienna', latitude: 48.2082, longitude: 16.3738, place_id: null, formatted_address: 'Vienna, Austria', waypoint_type: 'origin' },
      { id: 'wp-2', route_id: TEST_ROUTE_ID, position: 1, label: 'Budapest', latitude: 47.4979, longitude: 19.0402, place_id: null, formatted_address: 'Budapest, Hungary', waypoint_type: 'destination' },
    ];

    // getRoute for ownership check
    (query as any)
      .mockResolvedValueOnce({ rows: [finalizedRoute], rowCount: 1 }) // SELECT route
      .mockResolvedValueOnce({ rows: exportWaypoints, rowCount: 2 }) // SELECT waypoints
      .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // SELECT segments
      // exportRoute service: getRoute, getAcceptedRefuelStops
      .mockResolvedValueOnce({ rows: [finalizedRoute], rowCount: 1 }) // getRoute route
      .mockResolvedValueOnce({ rows: exportWaypoints, rowCount: 2 }) // getRoute waypoints
      .mockResolvedValueOnce({ rows: mockSegments, rowCount: 2 }) // getRoute segments
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getAcceptedRefuelStops

    const exportRes = await request(app)
      .post(`/api/v1/routes/${TEST_ROUTE_ID}/export`)
      .set('Authorization', `Bearer ${token}`)
      .send({ format: 'gpx' });

    expect(exportRes.status).toBe(200);
    expect(exportRes.body.data.format).toBe('gpx');
    expect(exportRes.body.data.files).toHaveLength(1);

    // Verify GPX content
    const gpxContent = Buffer.from(exportRes.body.data.files[0], 'base64').toString('utf-8');
    expect(gpxContent).toContain('<?xml');
    expect(gpxContent).toContain('<gpx');
    expect(gpxContent).toContain('Vienna');
    expect(gpxContent).toContain('Budapest');
  });
});


// ─── E2E Flow 2: Auth Lockout → Unlock → Login ───────────────────────────────

describe('E2E Flow: Auth Lockout → Unlock → Login', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should lock account after 5 failed attempts, then allow login after lock expires', async () => {
    const mockUser = {
      id: TEST_USER_ID,
      email: 'lockout@example.com',
      password_hash: '$2b$12$mockedhashvalue',
      display_name: 'Lockout User',
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    // Make bcrypt.compare return false for wrong password
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    // ─── Attempts 1-4: Wrong password, incrementing failed_login_attempts ──
    for (let attempt = 1; attempt <= 4; attempt++) {
      resetMocks();
      (query as any)
        .mockResolvedValueOnce({ rows: [{ ...mockUser, failed_login_attempts: attempt - 1 }], rowCount: 1 }) // findByEmail
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE failed_login_attempts

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lockout@example.com', password: 'WrongPass1' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    }

    // ─── Attempt 5: Triggers lockout ────────────────────────────────────
    resetMocks();
    (query as any)
      .mockResolvedValueOnce({ rows: [{ ...mockUser, failed_login_attempts: 4 }], rowCount: 1 }) // findByEmail
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE with locked_until

    const lockoutRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockout@example.com', password: 'WrongPass1' });

    expect(lockoutRes.status).toBe(401);
    expect(lockoutRes.body.message).toBe('Invalid email or password');

    // ─── Attempt 6: Account is now locked → 423 ────────────────────────
    resetMocks();
    const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    (query as any)
      .mockResolvedValueOnce({ rows: [{ ...mockUser, failed_login_attempts: 5, locked_until: lockedUntil }], rowCount: 1 }); // findByEmail

    const lockedRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockout@example.com', password: 'SecurePass1' });

    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.message).toContain('locked');

    // ─── After lock expires: Login succeeds ─────────────────────────────
    resetMocks();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const expiredLock = new Date(Date.now() - 1000); // Lock expired 1 second ago
    (query as any)
      .mockResolvedValueOnce({ rows: [{ ...mockUser, failed_login_attempts: 5, locked_until: expiredLock }], rowCount: 1 }) // findByEmail
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE reset failed_login_attempts

    const successRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockout@example.com', password: 'SecurePass1' });

    expect(successRes.status).toBe(200);
    expect(successRes.body.data.token).toBeDefined();

    // Verify the token is valid
    const decoded = jwt.verify(successRes.body.data.token, process.env.JWT_SECRET!) as any;
    expect(decoded.userId).toBe(TEST_USER_ID);
  });
});

// ─── E2E Flow 3: Rate Limiting ────────────────────────────────────────────────

describe('E2E Flow: Rate Limiting (Exceed Limit → 429 → Recovery)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should return 429 with Retry-After header when rate limit is exceeded', async () => {
    const token = generateToken();

    // First 100 requests succeed (cacheIncrement returns 1-100)
    // The 101st request exceeds the limit (cacheIncrement returns 101)
    vi.mocked(cacheIncrement).mockResolvedValue(101);

    const res = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(429);
    expect(res.body.status).toBe(429);
    expect(res.body.message).toContain('Rate limit exceeded');
    expect(res.headers['retry-after']).toBeDefined();
    expect(parseInt(res.headers['retry-after'])).toBe(60);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('should allow requests again after rate limit window resets', async () => {
    const token = generateToken();

    // Simulate rate limit window has reset (counter back to 1)
    vi.mocked(cacheIncrement).mockResolvedValue(1);

    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // GET vehicles returns empty

    const res = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBe('99');
  });

  it('should track rate limit headers correctly at boundary', async () => {
    const token = generateToken();

    // At exactly 100 requests (the limit) — should still pass
    vi.mocked(cacheIncrement).mockResolvedValue(100);

    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // GET vehicles

    const res = await request(app)
      .get('/api/v1/vehicles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });
});

// ─── E2E Flow 4: Vignette Scraping Fallback ───────────────────────────────────

describe('E2E Flow: Vignette Scraping Fallback (Primary Failure → Secondary → Cache)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should use vintrica.com fallback when i-vignette.com fails and cache results', async () => {
    // Import the scraper service to test directly
    const { scrapeVignettePrices } = await import('../../services/vignetteScraperService');

    // Mock primary scraper (i-vignette.com) to fail
    const mockIVignetteScraper = vi.fn().mockRejectedValue(
      new Error('i-vignette.com is unavailable')
    );

    // Mock secondary scraper (vintrica.com) to succeed
    const mockVintricaScraper = vi.fn().mockResolvedValue([
      { duration: '10-day', price_eur: 9.90 },
      { duration: '2-month', price_eur: 28.90 },
      { duration: '1-year', price_eur: 96.40 },
    ]);

    const testScrapers = [
      { name: 'i-vignette' as const, scrape: mockIVignetteScraper },
      { name: 'vintrica' as const, scrape: mockVintricaScraper },
    ];

    // Mock DB: getVignetteCountryId returns a valid ID for each country
    (query as any).mockImplementation(async (sql: string, params?: any[]) => {
      // getVignetteCountryId
      if (sql.includes('SELECT id FROM vignette_countries')) {
        return { rows: [{ id: `vc-${params?.[0]}` }], rowCount: 1 };
      }
      // persistVignettePrice (INSERT/UPSERT)
      if (sql.includes('INSERT INTO vignette_prices')) {
        return { rows: [], rowCount: 1 };
      }
      // updateVignettePriceCache (SELECT prices from DB)
      if (sql.includes('SELECT vp.vehicle_type')) {
        return {
          rows: [
            { vehicle_type: 'car', duration: '10-day', price_eur: '9.90', source: 'vintrica', fetched_at: new Date() },
            { vehicle_type: 'car', duration: '2-month', price_eur: '28.90', source: 'vintrica', fetched_at: new Date() },
            { vehicle_type: 'car', duration: '1-year', price_eur: '96.40', source: 'vintrica', fetched_at: new Date() },
          ],
          rowCount: 3,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await scrapeVignettePrices(testScrapers);

    // Verify i-vignette was attempted first
    expect(mockIVignetteScraper).toHaveBeenCalled();

    // Verify vintrica was used as fallback
    expect(mockVintricaScraper).toHaveBeenCalled();

    // Verify prices were cached in Redis
    expect(cacheSet).toHaveBeenCalled();
    const cacheSetCalls = vi.mocked(cacheSet).mock.calls;
    // At least one call should be for vignette prices
    const vignetteCacheCalls = cacheSetCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('vignette:prices:')
    );
    expect(vignetteCacheCalls.length).toBeGreaterThan(0);
  });

  it('should retain existing prices when both scrapers fail', async () => {
    const { scrapeVignettePrices } = await import('../../services/vignetteScraperService');

    // Both scrapers fail
    const mockIVignetteScraper = vi.fn().mockRejectedValue(
      new Error('i-vignette.com is unavailable')
    );
    const mockVintricaScraper = vi.fn().mockRejectedValue(
      new Error('vintrica.com is unavailable')
    );

    const testScrapers = [
      { name: 'i-vignette' as const, scrape: mockIVignetteScraper },
      { name: 'vintrica' as const, scrape: mockVintricaScraper },
    ];

    // Mock DB: getVignetteCountryId returns a valid ID
    (query as any).mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM vignette_countries')) {
        return { rows: [{ id: 'vc-AT' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // Spy on console.error to verify alert is logged
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await scrapeVignettePrices(testScrapers);

    // Both scrapers should have been attempted
    expect(mockIVignetteScraper).toHaveBeenCalled();
    expect(mockVintricaScraper).toHaveBeenCalled();

    // No INSERT should have been called (prices retained)
    const queryCalls = vi.mocked(query).mock.calls;
    const insertCalls = queryCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO vignette_prices')
    );
    expect(insertCalls).toHaveLength(0);

    // Alert should have been logged
    const alertCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('ALERT')
    );
    expect(alertCalls.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it('should verify cached vignette prices are served via API', async () => {
    const token = generateToken();

    // Simulate cached vignette prices available
    vi.mocked(cacheGet).mockImplementation(async (key: string) => {
      if (key === 'vignette:prices:AT:car') {
        return JSON.stringify([
          { duration: '10-day', priceEur: 9.90, source: 'vintrica', fetchedAt: new Date().toISOString() },
          { duration: '2-month', priceEur: 28.90, source: 'vintrica', fetchedAt: new Date().toISOString() },
        ]);
      }
      return null;
    });

    // DB fallback for the endpoint (in case cache is not used directly)
    (query as any).mockResolvedValueOnce({
      rows: [
        { id: 'vc-1', country_code: 'AT', country_name: 'Austria', motorcycle_exempt: false, available_durations: ['10-day', '2-month', '1-year'], active: true, updated_at: new Date() },
      ],
      rowCount: 1,
    }).mockResolvedValueOnce({
      rows: [
        { id: 'vp-1', vignette_country_id: 'vc-1', vehicle_type: 'car', duration: '10-day', price_eur: '9.90', source: 'vintrica', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
        { id: 'vp-2', vignette_country_id: 'vc-1', vehicle_type: 'car', duration: '2-month', price_eur: '28.90', source: 'vintrica', fetched_at: new Date(), expires_at: new Date(Date.now() + 86400000) },
      ],
      rowCount: 2,
    });

    const res = await request(app)
      .get('/api/v1/vignettes/prices?country=AT&vehicle_type=car')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.prices).toBeDefined();
    expect(res.body.data.prices.length).toBeGreaterThanOrEqual(1);
  });
});
