/**
 * VehicleProfile model type definitions matching the PostgreSQL vehicle_profiles table schema.
 */

export type VehicleType = 'motorcycle' | 'car' | 'camper' | 'ev';
export type FuelType = 'diesel' | 'petrol_95' | 'petrol_98' | 'lpg' | 'electric';
export type ChargePortType = 'Type1' | 'Type2' | 'CCS' | 'CHAdeMO' | 'Tesla';

export const VALID_VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'car', 'camper', 'ev'];
export const VALID_FUEL_TYPES: FuelType[] = ['diesel', 'petrol_95', 'petrol_98', 'lpg', 'electric'];
export const VALID_CHARGE_PORT_TYPES: ChargePortType[] = ['Type1', 'Type2', 'CCS', 'CHAdeMO', 'Tesla'];

export const TANK_CAPACITY_MIN = 5;
export const TANK_CAPACITY_MAX = 200;
export const CONSUMPTION_MIN = 1;
export const CONSUMPTION_MAX = 50;
export const BATTERY_CAPACITY_MIN = 10;
export const BATTERY_CAPACITY_MAX = 200;
export const CONSUMPTION_KWH_MIN = 5;
export const CONSUMPTION_KWH_MAX = 50;
export const MAX_PROFILES_PER_USER = 10;

export interface VehicleProfile {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType | null;
  tank_capacity_liters: number | null;
  consumption_per_100km: number | null;
  battery_capacity_kwh: number | null;
  consumption_kwh_per_100km: number | null;
  charge_port_type: ChargePortType | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new vehicle profile.
 */
export interface CreateVehicleProfileInput {
  name: string;
  vehicle_type: string;
  fuel_type?: string;
  tank_capacity_liters?: number;
  consumption_per_100km?: number;
  battery_capacity_kwh?: number;
  consumption_kwh_per_100km?: number;
  charge_port_type?: string;
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
  battery_capacity_kwh?: number;
  consumption_kwh_per_100km?: number;
  charge_port_type?: string;
}

/**
 * API response representation of a vehicle profile.
 */
export interface VehicleProfileResponse {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType | null;
  tank_capacity_liters: number | null;
  consumption_per_100km: number | null;
  battery_capacity_kwh: number | null;
  consumption_kwh_per_100km: number | null;
  charge_port_type: ChargePortType | null;
  is_default: boolean;
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
    battery_capacity_kwh: profile.battery_capacity_kwh,
    consumption_kwh_per_100km: profile.consumption_kwh_per_100km,
    charge_port_type: profile.charge_port_type,
    is_default: profile.is_default,
    created_at: profile.created_at instanceof Date ? profile.created_at.toISOString() : String(profile.created_at),
    updated_at: profile.updated_at instanceof Date ? profile.updated_at.toISOString() : String(profile.updated_at),
  };
}
