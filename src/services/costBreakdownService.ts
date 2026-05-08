/**
 * Cost Breakdown Service
 * Composes fuel cost and vignette cost into a single response.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.5, 4.7, 5.1, 5.4, 7.2
 */

import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice, FuelPrice } from './fuelPriceService';
import {
  getRouteVignetteRequirements,
  getPrices,
} from './vignetteService';
import { RouteSegment } from '../models/route';
import { VehicleProfile } from '../models/vehicleProfile';
import { VignetteDuration, DURATION_ORDER } from '../models/vignette';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostBreakdownData {
  totalCostEur: number;
  isPartialEstimate: boolean;
  fuel: {
    totalFuelCostEur: number;
    breakdown: FuelCountryBreakdown[];
  };
  vignettes: {
    totalVignetteCostEur: number;
    breakdown: VignetteCountryBreakdown[];
  };
  vehicleProfile: {
    id: string;
    name: string;
    fuelType: string;
    consumptionPer100km: number;
  };
}

export interface FuelCountryBreakdown {
  countryCode: string;
  countryName: string;
  distanceKm: number;
  fuelPricePerLiter: number;
  fuelCostEur: number;
}

export interface VignetteCountryBreakdown {
  countryCode: string;
  countryName: string;
  required: boolean;
  motorcycleExempt: boolean;
  selectedDuration: string;
  availableDurations: string[];
  priceEur: number;
  priceUnavailable: boolean;
}

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

// ─── Main Service Function ────────────────────────────────────────────────────

/**
 * Get composite cost breakdown for a route.
 * Calls existing services for fuel and vignette data, then composes
 * a unified response matching the CostBreakdownData interface.
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

  // 4. Calculate vignette breakdown
  const vignetteResult = await calculateVignetteBreakdown(
    routeId,
    vehicle,
    durationOverrides
  );

  // 5. Determine if this is a partial estimate
  const isPartialEstimate = fuelResult.hasUnavailablePrices || vignetteResult.hasUnavailablePrices;

  // 6. Calculate total cost
  const totalCostEur = Math.round(
    (fuelResult.totalFuelCostEur + vignetteResult.totalVignetteCostEur) * 100
  ) / 100;

  return {
    totalCostEur,
    isPartialEstimate,
    fuel: {
      totalFuelCostEur: fuelResult.totalFuelCostEur,
      breakdown: fuelResult.breakdown,
    },
    vignettes: {
      totalVignetteCostEur: vignetteResult.totalVignetteCostEur,
      breakdown: vignetteResult.breakdown,
    },
    vehicleProfile: {
      id: vehicle.id,
      name: vehicle.name,
      fuelType: vehicle.fuel_type,
      consumptionPer100km: vehicle.consumption_per_100km,
    },
  };
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
  totalVignetteCostEur: number;
  breakdown: VignetteCountryBreakdown[];
  hasUnavailablePrices: boolean;
}

/**
 * Calculates vignette cost breakdown for a route.
 * Uses the shortest available duration as default, or the override if provided.
 * Marks countries with unavailable prices.
 * Includes availableDurations per country for the frontend duration selector.
 */
async function calculateVignetteBreakdown(
  routeId: string,
  vehicle: VehicleProfile,
  durationOverrides?: Record<string, string>
): Promise<VignetteBreakdownResult> {
  // Get vignette requirements for this route with vehicle type for exemption logic
  const requirements = await getRouteVignetteRequirements(routeId, vehicle.vehicle_type);

  let totalVignetteCost = 0;
  let hasUnavailablePrices = false;
  const breakdown: VignetteCountryBreakdown[] = [];

  for (const req of requirements) {
    const isExempt = !req.required;

    if (isExempt) {
      // Motorcycle exempt — cost is 0 (Requirement 4.5)
      breakdown.push({
        countryCode: req.countryCode,
        countryName: req.countryName,
        required: false,
        motorcycleExempt: req.motorcycleExempt,
        selectedDuration: req.availableDurations.length > 0
          ? getShortestDuration(req.availableDurations)
          : '',
        availableDurations: req.availableDurations,
        priceEur: 0,
        priceUnavailable: false,
      });
      continue;
    }

    // Get prices for this country and vehicle type
    const prices = req.prices.length > 0
      ? req.prices
      : await getPrices(req.countryCode, vehicle.vehicle_type);

    // Determine selected duration: use override if provided, otherwise shortest available
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
      // Price unavailable (Requirement 4.7)
      hasUnavailablePrices = true;
      breakdown.push({
        countryCode: req.countryCode,
        countryName: req.countryName,
        required: true,
        motorcycleExempt: req.motorcycleExempt,
        selectedDuration,
        availableDurations: req.availableDurations,
        priceEur: 0,
        priceUnavailable: true,
      });
      continue;
    }

    const costEur = priceEntry.price_eur;
    totalVignetteCost += costEur;

    breakdown.push({
      countryCode: req.countryCode,
      countryName: req.countryName,
      required: true,
      motorcycleExempt: req.motorcycleExempt,
      selectedDuration,
      availableDurations: req.availableDurations,
      priceEur: costEur,
      priceUnavailable: false,
    });
  }

  return {
    totalVignetteCostEur: Math.round(totalVignetteCost * 100) / 100,
    breakdown,
    hasUnavailablePrices,
  };
}
