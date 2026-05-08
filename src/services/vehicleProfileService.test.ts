import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateVehicleProfileInput,
  createProfile,
  getProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
} from './vehicleProfileService';

// Mock the database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

import { query } from '../utils/database';

const mockQuery = vi.mocked(query);

const TEST_USER_ID = 'user-123';

const validInput = {
  name: 'My Car',
  vehicle_type: 'car',
  fuel_type: 'diesel',
  tank_capacity_liters: 60,
  consumption_per_100km: 7.5,
};

describe('validateVehicleProfileInput', () => {
  it('accepts valid input', () => {
    const result = validateVehicleProfileInput(validInput);
    expect(result.valid).toBe(true);
  });

  it('rejects missing name', () => {
    const result = validateVehicleProfileInput({ ...validInput, name: '' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Name is required');
    }
  });

  it('rejects invalid vehicle_type', () => {
    const result = validateVehicleProfileInput({ ...validInput, vehicle_type: 'truck' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Vehicle type must be one of');
    }
  });

  it('rejects invalid fuel_type', () => {
    const result = validateVehicleProfileInput({ ...validInput, fuel_type: 'hydrogen' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Fuel type must be one of');
    }
  });

  it('rejects tank_capacity below minimum (5)', () => {
    const result = validateVehicleProfileInput({ ...validInput, tank_capacity_liters: 4 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Tank capacity must be between 5 and 200');
    }
  });

  it('rejects tank_capacity above maximum (200)', () => {
    const result = validateVehicleProfileInput({ ...validInput, tank_capacity_liters: 201 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Tank capacity must be between 5 and 200');
    }
  });

  it('accepts tank_capacity at minimum boundary (5)', () => {
    const result = validateVehicleProfileInput({ ...validInput, tank_capacity_liters: 5 });
    expect(result.valid).toBe(true);
  });

  it('accepts tank_capacity at maximum boundary (200)', () => {
    const result = validateVehicleProfileInput({ ...validInput, tank_capacity_liters: 200 });
    expect(result.valid).toBe(true);
  });

  it('rejects consumption below minimum (1)', () => {
    const result = validateVehicleProfileInput({ ...validInput, consumption_per_100km: 0.5 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Consumption must be between 1 and 50');
    }
  });

  it('rejects consumption above maximum (50)', () => {
    const result = validateVehicleProfileInput({ ...validInput, consumption_per_100km: 51 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('Consumption must be between 1 and 50');
    }
  });

  it('accepts consumption at minimum boundary (1)', () => {
    const result = validateVehicleProfileInput({ ...validInput, consumption_per_100km: 1 });
    expect(result.valid).toBe(true);
  });

  it('accepts consumption at maximum boundary (50)', () => {
    const result = validateVehicleProfileInput({ ...validInput, consumption_per_100km: 50 });
    expect(result.valid).toBe(true);
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const result = validateVehicleProfileInput({
      name: '',
      vehicle_type: 'truck',
      fuel_type: 'electric',
      tank_capacity_liters: 3,
      consumption_per_100km: 60,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });

  describe('update mode (isUpdate=true)', () => {
    it('accepts empty object (no fields to update)', () => {
      const result = validateVehicleProfileInput({}, true);
      expect(result.valid).toBe(true);
    });

    it('validates only provided fields', () => {
      const result = validateVehicleProfileInput({ tank_capacity_liters: 3 }, true);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Tank capacity');
      }
    });
  });
});

describe('createProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws validation error for invalid input', async () => {
    await expect(
      createProfile(TEST_USER_ID, { ...validInput, tank_capacity_liters: 0 })
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws error when user has 10 profiles already', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as any);

    await expect(createProfile(TEST_USER_ID, validInput)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Maximum of 10'),
    });
  });

  it('creates profile successfully', async () => {
    const mockProfile = {
      id: 'profile-1',
      user_id: TEST_USER_ID,
      ...validInput,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any) // count check
      .mockResolvedValueOnce({ rows: [mockProfile], rowCount: 1 } as any); // insert

    const result = await createProfile(TEST_USER_ID, validInput);

    expect(result.id).toBe('profile-1');
    expect(result.name).toBe('My Car');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('getProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all profiles for a user', async () => {
    const mockProfiles = [
      { id: 'p1', user_id: TEST_USER_ID, name: 'Car 1' },
      { id: 'p2', user_id: TEST_USER_ID, name: 'Car 2' },
    ];
    mockQuery.mockResolvedValueOnce({ rows: mockProfiles, rowCount: 2 } as any);

    const result = await getProfiles(TEST_USER_ID);

    expect(result).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id'),
      [TEST_USER_ID]
    );
  });

  it('returns empty array when user has no profiles', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await getProfiles(TEST_USER_ID);

    expect(result).toHaveLength(0);
  });
});

describe('getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns profile when found', async () => {
    const mockProfile = { id: 'p1', user_id: TEST_USER_ID, name: 'My Car' };
    mockQuery.mockResolvedValueOnce({ rows: [mockProfile], rowCount: 1 } as any);

    const result = await getProfile('p1');

    expect(result).toEqual(mockProfile);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await getProfile('nonexistent');

    expect(result).toBeNull();
  });
});

describe('updateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws validation error for invalid update data', async () => {
    await expect(
      updateProfile('p1', { tank_capacity_liters: 300 })
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('updates profile successfully', async () => {
    const updatedProfile = {
      id: 'p1',
      user_id: TEST_USER_ID,
      name: 'Updated Car',
      vehicle_type: 'car',
      fuel_type: 'diesel',
      tank_capacity_liters: 70,
      consumption_per_100km: 7.5,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [updatedProfile], rowCount: 1 } as any);

    const result = await updateProfile('p1', { name: 'Updated Car', tank_capacity_liters: 70 });

    expect(result?.name).toBe('Updated Car');
  });

  it('returns null when profile not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await updateProfile('nonexistent', { name: 'Test' });

    expect(result).toBeNull();
  });
});

describe('deleteProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when profile is deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    const result = await deleteProfile('p1');

    expect(result).toBe(true);
  });

  it('returns false when profile not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await deleteProfile('nonexistent');

    expect(result).toBe(false);
  });
});
