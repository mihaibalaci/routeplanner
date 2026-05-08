import { query } from '../utils/database';
import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice, FuelPrice } from './fuelPriceService';
import { calculateVignetteCost } from './vignetteService';
import { RouteSegment } from '../models/route';
import { VehicleProfile } from '../models/vehicleProfile';
import { VignetteDuration, VignetteCostBreakdown } from '../models/vignette';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CountryCostBreakdown {
  country_code: string;
  distance_km: number;
  fuel_liters: number;
  cost_eur: number;
  price_per_liter: number;
}

export interface TripCostEstimate {
  id?: string;
  route_id: string;
  vehicle_profile_id: string;
  total_cost_eur: number;
  total_fuel_liters: number;
  country_breakdown: CountryCostBreakdown[];
  prices_outdated: boolean;
  calculated_at: Date;
}

export interface TotalTripCostEstimate {
  fuel_cost_eur: number;
  vignette_cost_eur: number;
  total_cost_eur: number;
  fuel_breakdown: CountryCostBreakdown[];
  vignette_breakdown: VignetteCostBreakdown[];
  prices_outdated: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Prices older than 12 hours are considered outdated */
const PRICE_OUTDATED_THRESHOLD_MS = 12 * 60 * 60 * 1000;

// ─── Core Calculation ─────────────────────────────────────────────────────────

/**
 * Checks whether a fuel price is outdated (fetched more than 12 hours ago).
 */
export function isPriceOutdated(fuelPrice: FuelPrice): boolean {
  const fetchedAt = fuelPrice.fetched_at instanceof Date
    ? fuelPrice.fetched_at
    : new Date(fuelPrice.fetched_at);
  const ageMs = Date.now() - fetchedAt.getTime();
  return ageMs > PRICE_OUTDATED_THRESHOLD_MS;
}

/**
 * Calculates trip cost given route segments and a vehicle profile.
 * This is the pure calculation logic, separated for testability.
 */
export function computeTripCost(
  segments: RouteSegment[],
  vehicle: VehicleProfile,
  fuelPrices: Map<string, FuelPrice>
): {
  totalCostEur: number;
  totalFuelLiters: number;
  countryBreakdown: CountryCostBreakdown[];
  pricesOutdated: boolean;
} {
  let totalCost = 0;
  let totalFuelLiters = 0;
  const countryMap = new Map<string, CountryCostBreakdown>();
  let pricesOutdated = false;

  for (const segment of segments) {
    const fuelNeeded = (segment.distance_km / 100) * (vehicle.consumption_per_100km ?? 0);
    const priceKey = `${segment.country_code}:${vehicle.fuel_type}`;
    const fuelPrice = fuelPrices.get(priceKey);

    if (!fuelPrice) {
      // Skip segments without price data — shouldn't happen in practice
      continue;
    }

    const segmentCost = fuelNeeded * fuelPrice.price_per_liter_eur;
    totalCost += segmentCost;
    totalFuelLiters += fuelNeeded;

    // Check if this price is outdated
    if (!pricesOutdated && isPriceOutdated(fuelPrice)) {
      pricesOutdated = true;
    }

    // Aggregate by country
    const existing = countryMap.get(segment.country_code);
    if (existing) {
      existing.distance_km += segment.distance_km;
      existing.fuel_liters += fuelNeeded;
      existing.cost_eur += segmentCost;
    } else {
      countryMap.set(segment.country_code, {
        country_code: segment.country_code,
        distance_km: segment.distance_km,
        fuel_liters: fuelNeeded,
        cost_eur: segmentCost,
        price_per_liter: fuelPrice.price_per_liter_eur,
      });
    }
  }

  // Round country breakdown values to 2 decimal places
  const countryBreakdown = Array.from(countryMap.values()).map((entry) => ({
    ...entry,
    distance_km: Math.round(entry.distance_km * 100) / 100,
    fuel_liters: Math.round(entry.fuel_liters * 100) / 100,
    cost_eur: Math.round(entry.cost_eur * 100) / 100,
  }));

  return {
    totalCostEur: Math.round(totalCost * 100) / 100,
    totalFuelLiters: Math.round(totalFuelLiters * 100) / 100,
    countryBreakdown,
    pricesOutdated,
  };
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Calculates the trip cost for a route with a given vehicle profile.
 * Fetches route segments, vehicle profile, and fuel prices, then computes the cost.
 * Stores the result in the trip_costs table.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function calculateTripCost(
  routeId: string,
  vehicleId: string
): Promise<TripCostEstimate> {
  // Get route with segments
  const routeData = await getRoute(routeId);
  if (!routeData) {
    const error = new Error('Route not found');
    (error as any).statusCode = 404;
    throw error;
  }

  if (routeData.segments.length === 0) {
    const error = new Error('Route has no calculated segments. Please calculate the route first.');
    (error as any).statusCode = 400;
    throw error;
  }

  // Get vehicle profile
  const vehicle = await getProfile(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle profile not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Collect unique country codes from segments
  const countryCodes = new Set(routeData.segments.map((s) => s.country_code));

  // Fetch fuel prices for all needed country/fuel_type combinations
  const fuelPrices = new Map<string, FuelPrice>();
  for (const countryCode of countryCodes) {
    if (vehicle.fuel_type) {
      const price = await getPrice(countryCode, vehicle.fuel_type);
      if (price) {
        fuelPrices.set(`${countryCode}:${vehicle.fuel_type}`, price);
      }
    }
  }

  // Compute the cost
  const result = computeTripCost(routeData.segments, vehicle, fuelPrices);

  // Store in database
  const insertResult = await query(
    `INSERT INTO trip_costs (route_id, vehicle_profile_id, total_cost_eur, total_fuel_liters, country_breakdown, calculated_at, prices_outdated)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     RETURNING *`,
    [
      routeId,
      vehicleId,
      result.totalCostEur,
      result.totalFuelLiters,
      JSON.stringify(result.countryBreakdown),
      result.pricesOutdated,
    ]
  );

  const row = insertResult.rows[0];

  return {
    id: row.id,
    route_id: row.route_id,
    vehicle_profile_id: row.vehicle_profile_id,
    total_cost_eur: parseFloat(row.total_cost_eur),
    total_fuel_liters: parseFloat(row.total_fuel_liters),
    country_breakdown: typeof row.country_breakdown === 'string'
      ? JSON.parse(row.country_breakdown)
      : row.country_breakdown,
    prices_outdated: row.prices_outdated,
    calculated_at: new Date(row.calculated_at),
  };
}

/**
 * Retrieves the most recent stored trip cost for a route.
 */
export async function getTripCost(routeId: string): Promise<TripCostEstimate | null> {
  const result = await query(
    `SELECT * FROM trip_costs
     WHERE route_id = $1
     ORDER BY calculated_at DESC
     LIMIT 1`,
    [routeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    route_id: row.route_id,
    vehicle_profile_id: row.vehicle_profile_id,
    total_cost_eur: parseFloat(row.total_cost_eur),
    total_fuel_liters: parseFloat(row.total_fuel_liters),
    country_breakdown: typeof row.country_breakdown === 'string'
      ? JSON.parse(row.country_breakdown)
      : row.country_breakdown,
    prices_outdated: row.prices_outdated,
    calculated_at: new Date(row.calculated_at),
  };
}

/**
 * Calculates the total trip cost including fuel and vignette costs.
 * Calls calculateTripCost for fuel cost, then calculateVignetteCost for vignette cost.
 * Returns combined result with both breakdowns.
 *
 * Requirements: 16.2, 16.3, 16.5, 16.10
 */
export async function calculateTotalCost(
  routeId: string,
  vehicleId: string,
  durationPreferences: Record<string, VignetteDuration> = {}
): Promise<TotalTripCostEstimate> {
  // Calculate fuel cost
  const fuelEstimate = await calculateTripCost(routeId, vehicleId);

  // Get vehicle profile for vehicle type (needed for vignette calculation)
  const vehicle = await getProfile(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle profile not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Calculate vignette cost
  const vignetteEstimate = await calculateVignetteCost(
    routeId,
    vehicle.vehicle_type,
    durationPreferences
  );

  // Total trip cost = fuel cost + vignette cost, rounded to 2 decimal places
  const totalCostEur = Math.round(
    (fuelEstimate.total_cost_eur + vignetteEstimate.totalVignetteCostEur) * 100
  ) / 100;

  return {
    fuel_cost_eur: fuelEstimate.total_cost_eur,
    vignette_cost_eur: vignetteEstimate.totalVignetteCostEur,
    total_cost_eur: totalCostEur,
    fuel_breakdown: fuelEstimate.country_breakdown,
    vignette_breakdown: vignetteEstimate.countryBreakdown,
    prices_outdated: fuelEstimate.prices_outdated,
  };
}
