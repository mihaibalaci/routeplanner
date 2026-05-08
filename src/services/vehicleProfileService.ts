import { query } from '../utils/database';
import {
  VehicleProfile,
  CreateVehicleProfileInput,
  UpdateVehicleProfileInput,
  VALID_VEHICLE_TYPES,
  VALID_FUEL_TYPES,
  TANK_CAPACITY_MIN,
  TANK_CAPACITY_MAX,
  CONSUMPTION_MIN,
  CONSUMPTION_MAX,
  MAX_PROFILES_PER_USER,
} from '../models/vehicleProfile';

export interface ValidationError {
  valid: false;
  errors: string[];
}

export interface ValidationSuccess {
  valid: true;
}

export type ValidationResult = ValidationError | ValidationSuccess;

/**
 * Validates vehicle profile input fields.
 * Returns specific error messages for each validation failure.
 */
export function validateVehicleProfileInput(
  data: Partial<CreateVehicleProfileInput>,
  isUpdate = false
): ValidationResult {
  const errors: string[] = [];

  if (!isUpdate || data.name !== undefined) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      if (!isUpdate) {
        errors.push('Name is required');
      } else if (data.name !== undefined) {
        errors.push('Name cannot be empty');
      }
    }
  }

  if (!isUpdate || data.vehicle_type !== undefined) {
    if (!data.vehicle_type) {
      if (!isUpdate) {
        errors.push('Vehicle type is required');
      }
    } else if (!VALID_VEHICLE_TYPES.includes(data.vehicle_type as any)) {
      errors.push(
        `Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`
      );
    }
  }

  if (!isUpdate || data.fuel_type !== undefined) {
    if (!data.fuel_type) {
      if (!isUpdate) {
        errors.push('Fuel type is required');
      }
    } else if (!VALID_FUEL_TYPES.includes(data.fuel_type as any)) {
      errors.push(
        `Fuel type must be one of: ${VALID_FUEL_TYPES.join(', ')}`
      );
    }
  }

  if (!isUpdate || data.tank_capacity_liters !== undefined) {
    if (data.tank_capacity_liters === undefined || data.tank_capacity_liters === null) {
      if (!isUpdate) {
        errors.push('Tank capacity is required');
      }
    } else if (
      typeof data.tank_capacity_liters !== 'number' ||
      isNaN(data.tank_capacity_liters)
    ) {
      errors.push('Tank capacity must be a number');
    } else if (
      data.tank_capacity_liters < TANK_CAPACITY_MIN ||
      data.tank_capacity_liters > TANK_CAPACITY_MAX
    ) {
      errors.push(
        `Tank capacity must be between ${TANK_CAPACITY_MIN} and ${TANK_CAPACITY_MAX} liters`
      );
    }
  }

  if (!isUpdate || data.consumption_per_100km !== undefined) {
    if (data.consumption_per_100km === undefined || data.consumption_per_100km === null) {
      if (!isUpdate) {
        errors.push('Consumption per 100km is required');
      }
    } else if (
      typeof data.consumption_per_100km !== 'number' ||
      isNaN(data.consumption_per_100km)
    ) {
      errors.push('Consumption per 100km must be a number');
    } else if (
      data.consumption_per_100km < CONSUMPTION_MIN ||
      data.consumption_per_100km > CONSUMPTION_MAX
    ) {
      errors.push(
        `Consumption must be between ${CONSUMPTION_MIN} and ${CONSUMPTION_MAX} L/100km`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Creates a new vehicle profile for a user.
 * Validates input and enforces the max 10 profiles per user limit.
 */
export async function createProfile(
  userId: string,
  data: CreateVehicleProfileInput
): Promise<VehicleProfile> {
  // Validate input
  const validation = validateVehicleProfileInput(data);
  if (!validation.valid) {
    const error = new Error((validation as ValidationError).errors.join('; '));
    (error as any).statusCode = 400;
    (error as any).validationErrors = (validation as ValidationError).errors;
    throw error;
  }

  // Check profile count limit
  const countResult = await query(
    'SELECT COUNT(*) as count FROM vehicle_profiles WHERE user_id = $1',
    [userId]
  );
  const currentCount = parseInt(countResult.rows[0].count, 10);

  if (currentCount >= MAX_PROFILES_PER_USER) {
    const error = new Error(
      `Maximum of ${MAX_PROFILES_PER_USER} vehicle profiles per user reached`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  // Insert the profile
  const result = await query(
    `INSERT INTO vehicle_profiles (user_id, name, vehicle_type, fuel_type, tank_capacity_liters, consumption_per_100km)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      data.name.trim(),
      data.vehicle_type,
      data.fuel_type,
      data.tank_capacity_liters,
      data.consumption_per_100km,
    ]
  );

  return result.rows[0] as VehicleProfile;
}

/**
 * Retrieves all vehicle profiles for a user.
 */
export async function getProfiles(userId: string): Promise<VehicleProfile[]> {
  const result = await query(
    'SELECT * FROM vehicle_profiles WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return result.rows as VehicleProfile[];
}

/**
 * Retrieves a single vehicle profile by ID.
 */
export async function getProfile(profileId: string): Promise<VehicleProfile | null> {
  const result = await query('SELECT * FROM vehicle_profiles WHERE id = $1', [profileId]);
  return result.rows.length > 0 ? (result.rows[0] as VehicleProfile) : null;
}

/**
 * Updates an existing vehicle profile.
 * Validates input fields that are provided.
 */
export async function updateProfile(
  profileId: string,
  data: UpdateVehicleProfileInput
): Promise<VehicleProfile | null> {
  // Validate provided fields
  const validation = validateVehicleProfileInput(data, true);
  if (!validation.valid) {
    const error = new Error((validation as ValidationError).errors.join('; '));
    (error as any).statusCode = 400;
    (error as any).validationErrors = (validation as ValidationError).errors;
    throw error;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name.trim());
  }
  if (data.vehicle_type !== undefined) {
    fields.push(`vehicle_type = $${paramIndex++}`);
    values.push(data.vehicle_type);
  }
  if (data.fuel_type !== undefined) {
    fields.push(`fuel_type = $${paramIndex++}`);
    values.push(data.fuel_type);
  }
  if (data.tank_capacity_liters !== undefined) {
    fields.push(`tank_capacity_liters = $${paramIndex++}`);
    values.push(data.tank_capacity_liters);
  }
  if (data.consumption_per_100km !== undefined) {
    fields.push(`consumption_per_100km = $${paramIndex++}`);
    values.push(data.consumption_per_100km);
  }

  if (fields.length === 0) {
    // Nothing to update, return current profile
    return getProfile(profileId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(profileId);

  const result = await query(
    `UPDATE vehicle_profiles SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows.length > 0 ? (result.rows[0] as VehicleProfile) : null;
}

/**
 * Deletes a vehicle profile by ID.
 */
export async function deleteProfile(profileId: string): Promise<boolean> {
  const result = await query('DELETE FROM vehicle_profiles WHERE id = $1', [profileId]);
  return (result.rowCount ?? 0) > 0;
}
