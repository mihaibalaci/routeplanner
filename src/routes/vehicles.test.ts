import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import vehiclesRouter from './vehicles';

// Mock the vehicle profile service
vi.mock('../services/vehicleProfileService', () => ({
  createProfile: vi.fn(),
  getProfiles: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  setDefaultVehicle: vi.fn(),
}));

import {
  createProfile,
  getProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  setDefaultVehicle,
} from '../services/vehicleProfileService';

const mockCreateProfile = vi.mocked(createProfile);
const mockGetProfiles = vi.mocked(getProfiles);
const mockGetProfile = vi.mocked(getProfile);
const mockUpdateProfile = vi.mocked(updateProfile);
const mockDeleteProfile = vi.mocked(deleteProfile);
const mockSetDefaultVehicle = vi.mocked(setDefaultVehicle);

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
  app.use('/', vehiclesRouter);
  return app;
}

const TEST_USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';

const mockProfile = {
  id: 'profile-1',
  user_id: TEST_USER_ID,
  name: 'My Car',
  vehicle_type: 'car' as const,
  fuel_type: 'diesel' as const,
  tank_capacity_liters: 60,
  consumption_per_100km: 7.5,
  battery_capacity_kwh: null,
  consumption_kwh_per_100km: null,
  charge_port_type: null,
  is_default: false,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockEvProfile = {
  id: 'profile-2',
  user_id: TEST_USER_ID,
  name: 'My Tesla',
  vehicle_type: 'ev' as const,
  fuel_type: 'electric' as const,
  tank_capacity_liters: null,
  consumption_per_100km: null,
  battery_capacity_kwh: 75,
  consumption_kwh_per_100km: 15,
  charge_port_type: 'CCS' as const,
  is_default: true,
  created_at: new Date('2024-01-02'),
  updated_at: new Date('2024-01-02'),
};

describe('GET / (List Vehicle Profiles)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns empty array when user has no profiles', async () => {
    mockGetProfiles.mockResolvedValue([]);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns all profiles for the user', async () => {
    mockGetProfiles.mockResolvedValue([mockProfile]);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('profile-1');
    expect(res.body.data[0].name).toBe('My Car');
  });
});

describe('POST / (Create Vehicle Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).post('/').send({
      name: 'Car',
      vehicle_type: 'car',
      fuel_type: 'diesel',
      tank_capacity_liters: 60,
      consumption_per_100km: 7,
    });

    expect(res.status).toBe(401);
  });

  it('creates a profile successfully', async () => {
    mockCreateProfile.mockResolvedValue(mockProfile);

    const res = await request(app).post('/').send({
      name: 'My Car',
      vehicle_type: 'car',
      fuel_type: 'diesel',
      tank_capacity_liters: 60,
      consumption_per_100km: 7.5,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('profile-1');
    expect(res.body.data.name).toBe('My Car');
  });

  it('returns 400 with validation errors on invalid input', async () => {
    const error = new Error('Tank capacity must be between 5 and 200 liters');
    (error as any).statusCode = 400;
    (error as any).validationErrors = ['Tank capacity must be between 5 and 200 liters'];
    mockCreateProfile.mockRejectedValue(error);

    const res = await request(app).post('/').send({
      name: 'Car',
      vehicle_type: 'car',
      fuel_type: 'diesel',
      tank_capacity_liters: 300,
      consumption_per_100km: 7,
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0]).toContain('Tank capacity');
  });

  it('returns 400 when max profiles reached', async () => {
    const error = new Error('Maximum of 10 vehicle profiles per user reached');
    (error as any).statusCode = 400;
    mockCreateProfile.mockRejectedValue(error);

    const res = await request(app).post('/').send({
      name: 'Car',
      vehicle_type: 'car',
      fuel_type: 'diesel',
      tank_capacity_liters: 60,
      consumption_per_100km: 7,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Maximum of 10');
  });
});

describe('GET /:id (Get Vehicle Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).get('/profile-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when profile does not exist', async () => {
    mockGetProfile.mockResolvedValue(null);

    const res = await request(app).get('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Vehicle profile not found');
  });

  it('returns 403 when profile belongs to another user', async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, user_id: OTHER_USER_ID });

    const res = await request(app).get('/profile-1');

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('returns the profile successfully', async () => {
    mockGetProfile.mockResolvedValue(mockProfile);

    const res = await request(app).get('/profile-1');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('profile-1');
    expect(res.body.data.vehicle_type).toBe('car');
  });
});

describe('PUT /:id (Update Vehicle Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).put('/profile-1').send({ name: 'New Name' });

    expect(res.status).toBe(401);
  });

  it('returns 404 when profile does not exist', async () => {
    mockGetProfile.mockResolvedValue(null);

    const res = await request(app).put('/nonexistent').send({ name: 'New Name' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when profile belongs to another user', async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, user_id: OTHER_USER_ID });

    const res = await request(app).put('/profile-1').send({ name: 'New Name' });

    expect(res.status).toBe(403);
  });

  it('updates profile successfully', async () => {
    mockGetProfile.mockResolvedValue(mockProfile);
    mockUpdateProfile.mockResolvedValue({ ...mockProfile, name: 'Updated Car' });

    const res = await request(app).put('/profile-1').send({ name: 'Updated Car' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Car');
  });

  it('returns 400 with validation errors on invalid update', async () => {
    mockGetProfile.mockResolvedValue(mockProfile);
    const error = new Error('Consumption must be between 1 and 50 L/100km');
    (error as any).statusCode = 400;
    (error as any).validationErrors = ['Consumption must be between 1 and 50 L/100km'];
    mockUpdateProfile.mockRejectedValue(error);

    const res = await request(app).put('/profile-1').send({ consumption_per_100km: 100 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });
});

describe('PUT /:id/default (Set Default Vehicle)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).put('/profile-1/default');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('returns 404 when profile does not exist', async () => {
    mockGetProfile.mockResolvedValue(null);

    const res = await request(app).put('/nonexistent/default');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Vehicle profile not found');
  });

  it('returns 403 when profile belongs to another user', async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, user_id: OTHER_USER_ID });

    const res = await request(app).put('/profile-1/default');

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('sets vehicle as default successfully', async () => {
    mockGetProfile.mockResolvedValue(mockProfile);
    mockSetDefaultVehicle.mockResolvedValue({ ...mockProfile, is_default: true });

    const res = await request(app).put('/profile-1/default');

    expect(res.status).toBe(200);
    expect(res.body.data.is_default).toBe(true);
    expect(mockSetDefaultVehicle).toHaveBeenCalledWith(TEST_USER_ID, 'profile-1');
  });
});

describe('POST / (Create EV Vehicle Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('creates an EV profile with EV-specific fields', async () => {
    mockCreateProfile.mockResolvedValue(mockEvProfile);

    const res = await request(app).post('/').send({
      name: 'My Tesla',
      vehicle_type: 'ev',
      battery_capacity_kwh: 75,
      consumption_kwh_per_100km: 15,
      charge_port_type: 'CCS',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.vehicle_type).toBe('ev');
    expect(res.body.data.battery_capacity_kwh).toBe(75);
    expect(res.body.data.consumption_kwh_per_100km).toBe(15);
    expect(res.body.data.charge_port_type).toBe('CCS');
    expect(res.body.data.is_default).toBe(true);
    expect(mockCreateProfile).toHaveBeenCalledWith(TEST_USER_ID, {
      name: 'My Tesla',
      vehicle_type: 'ev',
      fuel_type: undefined,
      tank_capacity_liters: undefined,
      consumption_per_100km: undefined,
      battery_capacity_kwh: 75,
      consumption_kwh_per_100km: 15,
      charge_port_type: 'CCS',
    });
  });
});

describe('GET / (List Vehicle Profiles with EV fields)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns profiles with EV fields included', async () => {
    mockGetProfiles.mockResolvedValue([mockProfile, mockEvProfile]);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    // ICE vehicle has null EV fields
    const iceVehicle = res.body.data[0];
    expect(iceVehicle.battery_capacity_kwh).toBeNull();
    expect(iceVehicle.consumption_kwh_per_100km).toBeNull();
    expect(iceVehicle.charge_port_type).toBeNull();
    expect(iceVehicle.is_default).toBe(false);

    // EV vehicle has EV fields populated
    const evVehicle = res.body.data[1];
    expect(evVehicle.battery_capacity_kwh).toBe(75);
    expect(evVehicle.consumption_kwh_per_100km).toBe(15);
    expect(evVehicle.charge_port_type).toBe('CCS');
    expect(evVehicle.is_default).toBe(true);
  });
});

describe('DELETE /:id (Delete Vehicle Profile)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp(TEST_USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = createApp();
    const res = await request(unauthApp).delete('/profile-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 when profile does not exist', async () => {
    mockGetProfile.mockResolvedValue(null);

    const res = await request(app).delete('/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 403 when profile belongs to another user', async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, user_id: OTHER_USER_ID });

    const res = await request(app).delete('/profile-1');

    expect(res.status).toBe(403);
  });

  it('deletes profile successfully', async () => {
    mockGetProfile.mockResolvedValue(mockProfile);
    mockDeleteProfile.mockResolvedValue(true);

    const res = await request(app).delete('/profile-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Vehicle profile deleted successfully');
  });
});

// Feature: ev-vehicle-category, Property 11: Vehicle ownership authorization
describe('Property 11: Vehicle ownership authorization', () => {
  // **Validates: Requirements 10.2, 10.4**
  const fc = require('fast-check');

  // Use a mutable ref so we can change the userId per iteration without recreating the app
  let currentUserId = '';

  function createPropertyApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).requestId = 'test-request-id';
      (req as any).userId = currentUserId;
      next();
    });
    app.use('/', vehiclesRouter);
    return app;
  }

  // Arbitrary for generating URL-safe user IDs (two distinct users)
  const urlSafeIdArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,35}$/);

  const userPairArb = fc
    .tuple(urlSafeIdArb, urlSafeIdArb)
    .filter(([a, b]: [string, string]) => a !== b);

  // Arbitrary for generating a URL-safe vehicle profile ID
  const vehicleIdArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,35}$/);

  // Build a vehicle profile owned by a specific user
  const buildProfile = (ownerId: string, vehicleId: string) => ({
    id: vehicleId,
    user_id: ownerId,
    name: 'Test Vehicle',
    vehicle_type: 'car' as const,
    fuel_type: 'diesel' as const,
    tank_capacity_liters: 60,
    consumption_per_100km: 7.5,
    battery_capacity_kwh: null,
    consumption_kwh_per_100km: null,
    charge_port_type: null,
    is_default: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  });

  it('GET /:id returns 403 when requesting user does not own the vehicle', async () => {
    const app = createPropertyApp();
    await fc.assert(
      fc.asyncProperty(userPairArb, vehicleIdArb, async ([ownerUserId, requestingUserId]: [string, string], vehicleId: string) => {
        vi.clearAllMocks();
        currentUserId = requestingUserId;
        mockGetProfile.mockResolvedValue(buildProfile(ownerUserId, vehicleId));

        const res = await request(app).get(`/${vehicleId}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Access denied');
      }),
      { numRuns: 100 }
    );
  });

  it('PUT /:id returns 403 when requesting user does not own the vehicle', async () => {
    const app = createPropertyApp();
    await fc.assert(
      fc.asyncProperty(userPairArb, vehicleIdArb, async ([ownerUserId, requestingUserId]: [string, string], vehicleId: string) => {
        vi.clearAllMocks();
        currentUserId = requestingUserId;
        mockGetProfile.mockResolvedValue(buildProfile(ownerUserId, vehicleId));

        const res = await request(app).put(`/${vehicleId}`).send({ name: 'Hacked' });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Access denied');
      }),
      { numRuns: 100 }
    );
  });

  it('PUT /:id/default returns 403 when requesting user does not own the vehicle', async () => {
    const app = createPropertyApp();
    await fc.assert(
      fc.asyncProperty(userPairArb, vehicleIdArb, async ([ownerUserId, requestingUserId]: [string, string], vehicleId: string) => {
        vi.clearAllMocks();
        currentUserId = requestingUserId;
        mockGetProfile.mockResolvedValue(buildProfile(ownerUserId, vehicleId));

        const res = await request(app).put(`/${vehicleId}/default`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Access denied');
      }),
      { numRuns: 100 }
    );
  });

  it('DELETE /:id returns 403 when requesting user does not own the vehicle', async () => {
    const app = createPropertyApp();
    await fc.assert(
      fc.asyncProperty(userPairArb, vehicleIdArb, async ([ownerUserId, requestingUserId]: [string, string], vehicleId: string) => {
        vi.clearAllMocks();
        currentUserId = requestingUserId;
        mockGetProfile.mockResolvedValue(buildProfile(ownerUserId, vehicleId));

        const res = await request(app).delete(`/${vehicleId}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Access denied');
      }),
      { numRuns: 100 }
    );
  });
});
