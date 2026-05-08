import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fuelRouter from './fuel';

// Mock the fuel price service
vi.mock('../services/fuelPriceService', () => ({
  getPrice: vi.fn(),
  FUEL_TYPES: ['diesel', 'petrol_95', 'petrol_98', 'lpg'],
}));

// Mock the refuel advisor service
vi.mock('../services/refuelAdvisorService', () => ({
  findStationsNearPoint: vi.fn(),
}));

import { getPrice } from '../services/fuelPriceService';
import { findStationsNearPoint } from '../services/refuelAdvisorService';

const mockGetPrice = vi.mocked(getPrice);
const mockFindStationsNearPoint = vi.mocked(findStationsNearPoint);

// Create a test app with the fuel router
function createTestApp(userId?: string) {
  const app = express();
  app.use(express.json());
  // Simulate requestId middleware
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    req.userId = userId;
    next();
  });
  app.use('/api/v1/fuel', fuelRouter);
  return app;
}

describe('GET /api/v1/fuel/prices', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('should return 400 when country parameter is missing', async () => {
    const res = await request(app).get('/api/v1/fuel/prices?type=diesel');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('country');
  });

  it('should return 400 when type parameter is missing', async () => {
    const res = await request(app).get('/api/v1/fuel/prices?country=DE');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('type');
  });

  it('should return 400 for invalid country code format', async () => {
    const res = await request(app).get('/api/v1/fuel/prices?country=GERMANY&type=diesel');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('2-letter');
  });

  it('should return 400 for invalid fuel type', async () => {
    const res = await request(app).get('/api/v1/fuel/prices?country=DE&type=hydrogen');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid fuel type');
  });

  it('should return 404 when no price data is available', async () => {
    mockGetPrice.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/fuel/prices?country=DE&type=diesel');

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('No fuel price data');
  });

  it('should return 200 with fuel price data', async () => {
    const mockPrice = {
      country_code: 'DE',
      fuel_type: 'diesel',
      price_per_liter_eur: 1.65,
      source: 'cieloweb',
      fetched_at: new Date('2024-01-01T10:00:00Z'),
      expires_at: new Date('2024-01-01T16:00:00Z'),
    };

    mockGetPrice.mockResolvedValue(mockPrice);

    const res = await request(app).get('/api/v1/fuel/prices?country=DE&type=diesel');

    expect(res.status).toBe(200);
    expect(res.body.data.country_code).toBe('DE');
    expect(res.body.data.fuel_type).toBe('diesel');
    expect(res.body.data.price_per_liter_eur).toBe(1.65);
    expect(res.body.data.source).toBe('cieloweb');
  });

  it('should normalize country code to uppercase', async () => {
    const mockPrice = {
      country_code: 'FR',
      fuel_type: 'petrol_95',
      price_per_liter_eur: 1.82,
      source: 'globalpetrolprices',
      fetched_at: new Date('2024-01-01T10:00:00Z'),
      expires_at: new Date('2024-01-01T16:00:00Z'),
    };

    mockGetPrice.mockResolvedValue(mockPrice);

    const res = await request(app).get('/api/v1/fuel/prices?country=fr&type=petrol_95');

    expect(res.status).toBe(200);
    expect(mockGetPrice).toHaveBeenCalledWith('FR', 'petrol_95');
  });

  it('should return 500 on internal error', async () => {
    mockGetPrice.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/fuel/prices?country=DE&type=diesel');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Failed to fetch fuel price');
  });
});


describe('GET /api/v1/fuel/stations', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp('user-123');
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = createTestApp(undefined);
    const res = await request(unauthApp).get('/api/v1/fuel/stations?lat=48.2&lng=16.3');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should return 400 when lat parameter is missing', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lng=16.3');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lat');
  });

  it('should return 400 when lng parameter is missing', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lng');
  });

  it('should return 400 for invalid lat value', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lat=91&lng=16.3');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lat');
  });

  it('should return 400 for invalid lng value', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=181');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lng');
  });

  it('should return 400 for invalid radius', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=16.3&radius=-5');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('radius');
  });

  it('should return 400 for radius exceeding 50 km', async () => {
    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=16.3&radius=60');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('radius');
  });

  it('should return 200 with stations using default radius', async () => {
    const mockStations = [
      {
        id: 'station-1',
        name: 'Shell Vienna',
        latitude: 48.21,
        longitude: 16.31,
        country_code: 'AT',
        place_id: null,
        fuel_types_available: ['diesel', 'petrol_95'],
        distance_from_route_km: 1.2,
      },
    ];

    mockFindStationsNearPoint.mockResolvedValue(mockStations);

    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=16.3');

    expect(res.status).toBe(200);
    expect(res.body.data.stations).toHaveLength(1);
    expect(res.body.data.stations[0].name).toBe('Shell Vienna');
    expect(mockFindStationsNearPoint).toHaveBeenCalledWith(48.2, 16.3, 5);
  });

  it('should use custom radius when provided', async () => {
    mockFindStationsNearPoint.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=16.3&radius=10');

    expect(res.status).toBe(200);
    expect(res.body.data.stations).toHaveLength(0);
    expect(mockFindStationsNearPoint).toHaveBeenCalledWith(48.2, 16.3, 10);
  });

  it('should return 500 on internal error', async () => {
    mockFindStationsNearPoint.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/v1/fuel/stations?lat=48.2&lng=16.3');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Failed to find nearby fuel stations');
  });
});
