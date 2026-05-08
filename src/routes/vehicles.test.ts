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
}));

import {
  createProfile,
  getProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
} from '../services/vehicleProfileService';

const mockCreateProfile = vi.mocked(createProfile);
const mockGetProfiles = vi.mocked(getProfiles);
const mockGetProfile = vi.mocked(getProfile);
const mockUpdateProfile = vi.mocked(updateProfile);
const mockDeleteProfile = vi.mocked(deleteProfile);

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
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
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
