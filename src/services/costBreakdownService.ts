/**
 * Cost Breakdown Service
 * Composes fuel cost, vignette cost, and toll cost into a single response.
 * Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.3, 6.1
 */

import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice, FuelPrice } from './fuelPriceService';
import {
  getRouteVignetteRequirements,
  getPrices,
} from './vignetteService';
import { getTollsForRoute } from './tollService';
import { RouteSegment, LatLng } from '../models/route';
import { VehicleProfile } from '../models/vehicleProfile';
import { VignetteDuration, DURATION_ORDER } from '../models/vignette';
import {
  VignetteEntry,
  BridgeTollEntry,
  HighwayTollEntry,
  RoadCosts,
  TollServiceResult,
  CostBreakdownData,
  FuelCountryBreakdown,
} from '../models/roadCosts';

// Re-export types for backward compatibility
export type { FuelCountryBreakdown, CostBreakdownData };

// ─── Country Name Mapping ─────────────────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CZ: 'Czech Republic',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
  CH: 'Switzerland',
  GB: 'United Kingdom',
  MD: 'Moldova',
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

// ─── Helper: Shortest Duration ────────────────────────────────────────────────

function getShortestDuration(durations: VignetteDuration[]): VignetteDuration {
  const sorted = [...durations].sort(
    (a, b) => DURATION_ORDER[a] - DURATION_ORDER[b]
  );
  return sorted[0];
}

// ─── Helper: Calculate Road Costs Total ───────────────────────────────────────

/**
 * Calculates totalRoadCostsEur as the sum of all vignette costs + bridge tolls
 * + highway tolls, rounded to 2 decimal places.
 * Requirements: 2.5
 */
export function calculateTotalRoadCosts(
  vignettes: VignetteEntry[],
  bridgeTolls: BridgeTollEntry[],
  highwayTolls: HighwayTollEntry[]
): number {
  const vignetteCosts = vignettes.reduce((sum, v) => sum + v.cost, 0);
  const bridgeCosts = bridgeTolls.reduce((sum, b) => sum + b.cost, 0);
  const highwayCosts = highwayTolls.reduce((sum, h) => sum + h.cost, 0);
  return Math.round((vignetteCosts + bridgeCosts + highwayCosts) * 100) / 100;
}

// ─── Main Service Function ────────────────────────────────────────────────────

/**
 * Get composite cost breakdown for a route.
 * Calls existing services for fuel, vignette, and toll data, then composes
 * a unified response matching the CostBreakdownData interface.
 * Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 6.1
 */
export async function getCostBreakdown(
  routeId: string,
  vehicleId: string,
  durationOverrides?: Record<string, string>
): Promise<CostBreakdownData> {
  // 1. Fetch route data
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

  // 2. Fetch vehicle profile
  const vehicle = await getProfile(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle profile not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // 3. Calculate fuel breakdown
  const fuelResult = await calculateFuelBreakdown(routeData.segments, vehicle);

  // 4. Fetch toll data from Google Routes API (Requirement 1.1)
  const origin = extractOrigin(routeData.waypoints);
  const destination = extractDestination(routeData.waypoints);
  const waypoints = extractIntermediateWaypoints(routeData.waypoints);

  let tollResult: TollServiceResult | null = null;
  if (origin && destination) {
    tollResult = await getTollsForRoute(origin, destination, waypoints);
  }

  // 5. Calculate vignette breakdown (restructured into VignetteEntry format)
  const vignetteResult = await calculateVignetteBreakdown(
    routeId,
    vehicle,
    durationOverrides
  );

  // 6. Compose roadCosts object (Requirement 2.1)
  const bridgeTolls: BridgeTollEntry[] = tollResult?.bridgeTolls ?? [];
  const highwayTolls: HighwayTollEntry[] = tollResult?.highwayTolls ?? [];
  const totalRoadCostsEur = calculateTotalRoadCosts(
    vignetteResult.vignettes,
    bridgeTolls,
    highwayTolls
  );

  const roadCosts: RoadCosts = {
    vignettes: vignetteResult.vignettes,
    bridgeTolls,
    highwayTolls,
    totalRoadCostsEur,
  };

  // 7. Determine if this is a partial estimate
  // isPartialEstimate is true when toll API fails (Requirement 1.3) or prices are unavailable
  const isPartialEstimate =
    fuelResult.hasUnavailablePrices ||
    vignetteResult.hasUnavailablePrices ||
    (tollResult === null && origin !== null && destination !== null);

  // 8. Calculate total cost: fuel + road costs (Requirement 6.1)
  const totalCostEur =
    Math.round((fuelResult.totalFuelCostEur + totalRoadCostsEur) * 100) / 100;

  return {
    totalCostEur,
    isPartialEstimate,
    fuel: {
      totalFuelCostEur: fuelResult.totalFuelCostEur,
      breakdown: fuelResult.breakdown,
    },
    roadCosts,
    vehicleProfile: {
      id: vehicle.id,
      name: vehicle.name,
      fuelType: vehicle.fuel_type,
      consumptionPer100km: vehicle.consumption_per_100km,
    },
  };
}

// ─── Waypoint Extraction Helpers ──────────────────────────────────────────────

interface WaypointLike {
  latitude: number;
  longitude: number;
  waypoint_type: string;
  position: number;
}

function extractOrigin(waypoints: WaypointLike[]): LatLng | null {
  const origin = waypoints.find((wp) => wp.waypoint_type === 'origin');
  if (!origin) return null;
  return { latitude: origin.latitude, longitude: origin.longitude };
}

function extractDestination(waypoints: WaypointLike[]): LatLng | null {
  const destination = waypoints.find((wp) => wp.waypoint_type === 'destination');
  if (!destination) return null;
  return { latitude: destination.latitude, longitude: destination.longitude };
}

function extractIntermediateWaypoints(waypoints: WaypointLike[]): LatLng[] {
  return waypoints
    .filter((wp) => wp.waypoint_type === 'stop')
    .sort((a, b) => a.position - b.position)
    .map((wp) => ({ latitude: wp.latitude, longitude: wp.longitude }));
}

// ─── Fuel Breakdown Calculation ───────────────────────────────────────────────

interface FuelBreakdownResult {
  totalFuelCostEur: number;
  breakdown: FuelCountryBreakdown[];
  hasUnavailablePrices: boolean;
}

/**
 * Calculates fuel cost breakdown per country from route segments.
 * Filters out sub-1km segments.
 * Preserves traversal order (first-occurrence order of countries).
 * Sets hasUnavailablePrices when any country's fuel price is missing.
 */
async function calculateFuelBreakdown(
  segments: RouteSegment[],
  vehicle: VehicleProfile
): Promise<FuelBreakdownResult> {
  // Collect unique country codes in traversal order
  const countryOrder: string[] = [];
  const countrySet = new Set<string>();

  for (const segment of segments) {
    if (!countrySet.has(segment.country_code)) {
      countrySet.add(segment.country_code);
      countryOrder.push(segment.country_code);
    }
  }

  // Fetch fuel prices for all countries
  const fuelPrices = new Map<string, FuelPrice | null>();
  for (const countryCode of countryOrder) {
    const price = await getPrice(countryCode, vehicle.fuel_type);
    fuelPrices.set(countryCode, price);
  }

  // Aggregate distances per country, filtering sub-1km segments
  const countryDistances = new Map<string, number>();
  for (const segment of segments) {
    // Filter out sub-1km segments (Requirement 3.4)
    if (segment.distance_km < 1) {
      continue;
    }

    const existing = countryDistances.get(segment.country_code) || 0;
    countryDistances.set(segment.country_code, existing + segment.distance_km);
  }

  // Build breakdown in traversal order
  let totalFuelCost = 0;
  let hasUnavailablePrices = false;
  const breakdown: FuelCountryBreakdown[] = [];

  for (const countryCode of countryOrder) {
    const distanceKm = countryDistances.get(countryCode);

    // Skip countries that only had sub-1km segments
    if (!distanceKm || distanceKm === 0) {
      // Check if this country had no qualifying segments but had a price issue
      const price = fuelPrices.get(countryCode);
      if (!price) {
        hasUnavailablePrices = true;
      }
      continue;
    }

    const price = fuelPrices.get(countryCode);

    if (!price) {
      // Price unavailable — mark as partial estimate (Requirement 7.2)
      hasUnavailablePrices = true;
      breakdown.push({
        countryCode,
        countryName: getCountryName(countryCode),
        distanceKm: Math.round(distanceKm * 100) / 100,
        fuelPricePerLiter: 0,
        fuelCostEur: 0,
      });
      continue;
    }

    // Calculate fuel cost: (distance / 100) × consumption × price_per_liter
    const fuelCostEur = Math.round(
      (distanceKm / 100) * vehicle.consumption_per_100km * price.price_per_liter_eur * 100
    ) / 100;

    totalFuelCost += fuelCostEur;

    breakdown.push({
      countryCode,
      countryName: getCountryName(countryCode),
      distanceKm: Math.round(distanceKm * 100) / 100,
      fuelPricePerLiter: price.price_per_liter_eur,
      fuelCostEur,
    });
  }

  return {
    totalFuelCostEur: Math.round(totalFuelCost * 100) / 100,
    breakdown,
    hasUnavailablePrices,
  };
}

// ─── Vignette Breakdown Calculation ───────────────────────────────────────────

interface VignetteBreakdownResult {
  vignettes: VignetteEntry[];
  hasUnavailablePrices: boolean;
}

/**
 * Calculates vignette cost breakdown for a route.
 * Returns VignetteEntry[] format with countryCode, countryName, duration, cost,
 * and availableDurations.
 * Uses the shortest available duration as default, or the override if provided.
 * Requirements: 2.2, 4.3
 */
async function calculateVignetteBreakdown(
  routeId: string,
  vehicle: VehicleProfile,
  durationOverrides?: Record<string, string>
): Promise<VignetteBreakdownResult> {
  // Get vignette requirements for this route with vehicle type for exemption logic
  const requirements = await getRouteVignetteRequirements(routeId, vehicle.vehicle_type);

  let hasUnavailablePrices = false;
  const vignettes: VignetteEntry[] = [];

  for (const req of requirements) {
    const isExempt = !req.required;

    if (isExempt) {
      // Motorcycle exempt — cost is 0
      vignettes.push({
        countryCode: req.countryCode,
        countryName: req.countryName,
        duration: req.availableDurations.length > 0
          ? getShortestDuration(req.availableDurations)
          : '',
        cost: 0,
        availableDurations: req.availableDurations,
      });
      continue;
    }

    // Get prices for this country and vehicle type
    const prices = req.prices.length > 0
      ? req.prices
      : await getPrices(req.countryCode, vehicle.vehicle_type);

    // Determine selected duration: use override if provided, otherwise shortest available
    // Requirement 4.3: use specified duration to look up corresponding vignette price
    const selectedDuration: VignetteDuration = (
      durationOverrides?.[req.countryCode] as VignetteDuration
    ) || (
      prices.length > 0
        ? getShortestDuration(prices.map((p) => p.duration))
        : getShortestDuration(req.availableDurations)
    );

    // Find the price for the selected duration
    const priceEntry = prices.find((p) => p.duration === selectedDuration);

    if (prices.length === 0 || !priceEntry) {
      // Price unavailable
      hasUnavailablePrices = true;
      vignettes.push({
        countryCode: req.countryCode,
        countryName: req.countryName,
        duration: selectedDuration,
        cost: 0,
        availableDurations: req.availableDurations,
      });
      continue;
    }

    vignettes.push({
      countryCode: req.countryCode,
      countryName: req.countryName,
      duration: selectedDuration,
      cost: priceEntry.price_eur,
      availableDurations: req.availableDurations,
    });
  }

  return {
    vignettes,
    hasUnavailablePrices,
  };
}
