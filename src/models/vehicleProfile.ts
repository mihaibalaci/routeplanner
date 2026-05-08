/**
 * VehicleProfile model type definitions matching the PostgreSQL vehicle_profiles table schema.
 */

export type VehicleType = 'motorcycle' | 'car' | 'camper';
export type FuelType = 'diesel' | 'petrol_95' | 'petrol_98' | 'lpg';

export const VALID_VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'car', 'camper'];
export const VALID_FUEL_TYPES: FuelType[] = ['diesel', 'petrol_95', 'petrol_98', 'lpg'];

export const TANK_CAPACITY_MIN = 5;
export const TANK_CAPACITY_MAX = 200;
export const CONSUMPTION_MIN = 1;
export const CONSUMPTION_MAX = 50;
export const MAX_PROFILES_PER_USER = 10;

export interface VehicleProfile {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new vehicle profile.
 */
export interface CreateVehicleProfileInput {
  name: string;
  vehicle_type: string;
  fuel_type: string;
  tank_capacity_liters: number;
  consumption_per_100km: number;
}

/**
 * Input for updating an existing vehicle profile.
 */
export interface UpdateVehicleProfileInput {
  name?: string;
  vehicle_type?: string;
  fuel_type?: string;
  tank_capacity_liters?: number;
  consumption_per_100km?: number;
}

/**
 * API response representation of a vehicle profile.
 */
export interface VehicleProfileResponse {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  created_at: string;
  updated_at: string;
}

/**
 * Maps a database VehicleProfile row to an API response.
 */
export function toVehicleProfileResponse(profile: VehicleProfile): VehicleProfileResponse {
  return {
    id: profile.id,
    user_id: profile.user_id,
    name: profile.name,
    vehicle_type: profile.vehicle_type,
    fuel_type: profile.fuel_type,
    tank_capacity_liters: profile.tank_capacity_liters,
    consumption_per_100km: profile.consumption_per_100km,
    created_at: profile.created_at instanceof Date ? profile.created_at.toISOString() : String(profile.created_at),
    updated_at: profile.updated_at instanceof Date ? profile.updated_at.toISOString() : String(profile.updated_at),
  };
}
