import { query, transaction } from '../utils/database';
import {
  VehicleProfile,
  CreateVehicleProfileInput,
  UpdateVehicleProfileInput,
  VALID_VEHICLE_TYPES,
  VALID_FUEL_TYPES,
  VALID_CHARGE_PORT_TYPES,
  TANK_CAPACITY_MIN,
  TANK_CAPACITY_MAX,
  CONSUMPTION_MIN,
  CONSUMPTION_MAX,
  BATTERY_CAPACITY_MIN,
  BATTERY_CAPACITY_MAX,
  CONSUMPTION_KWH_MIN,
  CONSUMPTION_KWH_MAX,
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
 * Applies conditional validation based on vehicle_type:
 * - EV vehicles require battery_capacity_kwh, consumption_kwh_per_100km, charge_port_type
 * - Non-EV vehicles require fuel_type, tank_capacity_liters, consumption_per_100km
 */
export function validateVehicleProfileInput(
  data: Partial<CreateVehicleProfileInput>,
  isUpdate = false
): ValidationResult {
  const errors: string[] = [];

  // Name validation
  if (!isUpdate || data.name !== undefined) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      if (!isUpdate) {
        errors.push('Name is required');
      } else if (data.name !== undefined) {
        errors.push('Name cannot be empty');
      }
    }
  }

  // Vehicle type validation
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

  const vehicleType = data.vehicle_type;
  const isEv = vehicleType === 'ev';

  if (isEv) {
    // EV-specific validation: require EV fields, validate ranges
    validateEvFields(data, isUpdate, errors);
  } else if (vehicleType || !isUpdate) {
    // Non-EV validation (ICE vehicles): require fuel_type, tank_capacity_liters, consumption_per_100km
    validateIceFields(data, isUpdate, errors);
  } else {
    // Update mode without vehicle_type specified: validate any provided fields by range
    validateProvidedFieldRanges(data, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validates EV-specific fields: battery_capacity_kwh, consumption_kwh_per_100km, charge_port_type.
 */
function validateEvFields(
  data: Partial<CreateVehicleProfileInput>,
  isUpdate: boolean,
  errors: string[]
): void {
  // battery_capacity_kwh
  if (!isUpdate || data.battery_capacity_kwh !== undefined) {
    if (data.battery_capacity_kwh === undefined || data.battery_capacity_kwh === null) {
      if (!isUpdate) {
        errors.push('Battery capacity is required for EV vehicles');
      }
    } else if (
      typeof data.battery_capacity_kwh !== 'number' ||
      isNaN(data.battery_capacity_kwh)
    ) {
      errors.push('Battery capacity must be a number');
    } else if (
      data.battery_capacity_kwh < BATTERY_CAPACITY_MIN ||
      data.battery_capacity_kwh > BATTERY_CAPACITY_MAX
    ) {
      errors.push(
        `Battery capacity must be between ${BATTERY_CAPACITY_MIN} and ${BATTERY_CAPACITY_MAX} kWh`
      );
    }
  }

  // consumption_kwh_per_100km
  if (!isUpdate || data.consumption_kwh_per_100km !== undefined) {
    if (data.consumption_kwh_per_100km === undefined || data.consumption_kwh_per_100km === null) {
      if (!isUpdate) {
        errors.push('Energy consumption is required for EV vehicles');
      }
    } else if (
      typeof data.consumption_kwh_per_100km !== 'number' ||
      isNaN(data.consumption_kwh_per_100km)
    ) {
      errors.push('Energy consumption must be a number');
    } else if (
      data.consumption_kwh_per_100km < CONSUMPTION_KWH_MIN ||
      data.consumption_kwh_per_100km > CONSUMPTION_KWH_MAX
    ) {
      errors.push(
        `Energy consumption must be between ${CONSUMPTION_KWH_MIN} and ${CONSUMPTION_KWH_MAX} kWh/100km`
      );
    }
  }

  // charge_port_type
  if (!isUpdate || data.charge_port_type !== undefined) {
    if (!data.charge_port_type) {
      if (!isUpdate) {
        errors.push('Charge port type is required for EV vehicles');
      }
    } else if (!VALID_CHARGE_PORT_TYPES.includes(data.charge_port_type as any)) {
      errors.push(
        `Charge port type must be one of: ${VALID_CHARGE_PORT_TYPES.join(', ')}`
      );
    }
  }
}

/**
 * Validates ICE-specific fields: fuel_type, tank_capacity_liters, consumption_per_100km.
 */
function validateIceFields(
  data: Partial<CreateVehicleProfileInput>,
  isUpdate: boolean,
  errors: string[]
): void {
  // fuel_type
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

  // tank_capacity_liters
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

  // consumption_per_100km
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
}

/**
 * Validates range constraints on any provided fields when vehicle_type is not specified (update mode).
 * This ensures that even without knowing the vehicle type, provided numeric fields are range-checked.
 */
function validateProvidedFieldRanges(
  data: Partial<CreateVehicleProfileInput>,
  errors: string[]
): void {
  // Validate fuel_type if provided
  if (data.fuel_type !== undefined && data.fuel_type) {
    if (!VALID_FUEL_TYPES.includes(data.fuel_type as any)) {
      errors.push(
        `Fuel type must be one of: ${VALID_FUEL_TYPES.join(', ')}`
      );
    }
  }

  // Validate tank_capacity_liters if provided
  if (data.tank_capacity_liters !== undefined && data.tank_capacity_liters !== null) {
    if (typeof data.tank_capacity_liters !== 'number' || isNaN(data.tank_capacity_liters)) {
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

  // Validate consumption_per_100km if provided
  if (data.consumption_per_100km !== undefined && data.consumption_per_100km !== null) {
    if (typeof data.consumption_per_100km !== 'number' || isNaN(data.consumption_per_100km)) {
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

  // Validate battery_capacity_kwh if provided
  if (data.battery_capacity_kwh !== undefined && data.battery_capacity_kwh !== null) {
    if (typeof data.battery_capacity_kwh !== 'number' || isNaN(data.battery_capacity_kwh)) {
      errors.push('Battery capacity must be a number');
    } else if (
      data.battery_capacity_kwh < BATTERY_CAPACITY_MIN ||
      data.battery_capacity_kwh > BATTERY_CAPACITY_MAX
    ) {
      errors.push(
        `Battery capacity must be between ${BATTERY_CAPACITY_MIN} and ${BATTERY_CAPACITY_MAX} kWh`
      );
    }
  }

  // Validate consumption_kwh_per_100km if provided
  if (data.consumption_kwh_per_100km !== undefined && data.consumption_kwh_per_100km !== null) {
    if (typeof data.consumption_kwh_per_100km !== 'number' || isNaN(data.consumption_kwh_per_100km)) {
      errors.push('Energy consumption must be a number');
    } else if (
      data.consumption_kwh_per_100km < CONSUMPTION_KWH_MIN ||
      data.consumption_kwh_per_100km > CONSUMPTION_KWH_MAX
    ) {
      errors.push(
        `Energy consumption must be between ${CONSUMPTION_KWH_MIN} and ${CONSUMPTION_KWH_MAX} kWh/100km`
      );
    }
  }

  // Validate charge_port_type if provided
  if (data.charge_port_type !== undefined && data.charge_port_type) {
    if (!VALID_CHARGE_PORT_TYPES.includes(data.charge_port_type as any)) {
      errors.push(
        `Charge port type must be one of: ${VALID_CHARGE_PORT_TYPES.join(', ')}`
      );
    }
  }
}

/**
 * Creates a new vehicle profile for a user.
 * Validates input and enforces the max 10 profiles per user limit.
 * Handles both EV and ICE vehicle types with appropriate fields.
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

  const isEv = data.vehicle_type === 'ev';

  // Insert the profile with parameterized queries
  const result = await query(
    `INSERT INTO vehicle_profiles (
      user_id, name, vehicle_type, fuel_type, tank_capacity_liters, consumption_per_100km,
      battery_capacity_kwh, consumption_kwh_per_100km, charge_port_type
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      userId,
      data.name.trim(),
      data.vehicle_type,
      isEv ? (data.fuel_type || 'electric') : data.fuel_type,
      isEv ? (data.tank_capacity_liters ?? null) : data.tank_capacity_liters,
      isEv ? (data.consumption_per_100km ?? null) : data.consumption_per_100km,
      isEv ? data.battery_capacity_kwh : null,
      isEv ? data.consumption_kwh_per_100km : null,
      isEv ? data.charge_port_type : null,
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
 * Validates input fields that are provided, applying conditional EV/ICE logic.
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
  if (data.battery_capacity_kwh !== undefined) {
    fields.push(`battery_capacity_kwh = $${paramIndex++}`);
    values.push(data.battery_capacity_kwh);
  }
  if (data.consumption_kwh_per_100km !== undefined) {
    fields.push(`consumption_kwh_per_100km = $${paramIndex++}`);
    values.push(data.consumption_kwh_per_100km);
  }
  if (data.charge_port_type !== undefined) {
    fields.push(`charge_port_type = $${paramIndex++}`);
    values.push(data.charge_port_type);
  }

  // When switching to EV, clear ICE fields; when switching away from EV, clear EV fields
  if (data.vehicle_type === 'ev') {
    if (data.fuel_type === undefined) {
      fields.push(`fuel_type = $${paramIndex++}`);
      values.push('electric');
    }
    if (data.tank_capacity_liters === undefined) {
      fields.push(`tank_capacity_liters = $${paramIndex++}`);
      values.push(null);
    }
    if (data.consumption_per_100km === undefined) {
      fields.push(`consumption_per_100km = $${paramIndex++}`);
      values.push(null);
    }
  } else if (data.vehicle_type !== undefined) {
    // Switching to ICE type — clear EV fields
    if (data.battery_capacity_kwh === undefined) {
      fields.push(`battery_capacity_kwh = $${paramIndex++}`);
      values.push(null);
    }
    if (data.consumption_kwh_per_100km === undefined) {
      fields.push(`consumption_kwh_per_100km = $${paramIndex++}`);
      values.push(null);
    }
    if (data.charge_port_type === undefined) {
      fields.push(`charge_port_type = $${paramIndex++}`);
      values.push(null);
    }
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

/**
 * Sets a vehicle as the default for a user.
 * Uses a transaction to ensure atomicity: unsets is_default on all other
 * vehicles for the user, then sets is_default on the target vehicle.
 */
export async function setDefaultVehicle(
  userId: string,
  vehicleId: string
): Promise<VehicleProfile> {
  return transaction(async (client) => {
    // Unset is_default on all vehicles for this user
    await client.query(
      'UPDATE vehicle_profiles SET is_default = false, updated_at = NOW() WHERE user_id = $1 AND is_default = true',
      [userId]
    );

    // Set is_default on the target vehicle
    const result = await client.query(
      'UPDATE vehicle_profiles SET is_default = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [vehicleId, userId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Vehicle profile not found');
      (error as any).statusCode = 404;
      throw error;
    }

    return result.rows[0] as VehicleProfile;
  });
}

/**
 * Gets the default vehicle for a user.
 * Returns the vehicle with is_default = true, or falls back to the most
 * recently created vehicle if no explicit default is set.
 */
export async function getDefaultVehicle(userId: string): Promise<VehicleProfile | null> {
  // First, look for an explicit default
  const defaultResult = await query(
    'SELECT * FROM vehicle_profiles WHERE user_id = $1 AND is_default = true LIMIT 1',
    [userId]
  );

  if (defaultResult.rows.length > 0) {
    return defaultResult.rows[0] as VehicleProfile;
  }

  // Fall back to most recently created vehicle
  const fallbackResult = await query(
    'SELECT * FROM vehicle_profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  return fallbackResult.rows.length > 0 ? (fallbackResult.rows[0] as VehicleProfile) : null;
}
