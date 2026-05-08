/**
 * Cost Breakdown Panel — shared types and pure computation module.
 *
 * This module defines the TypeScript interfaces used by the CostBreakdownPanel
 * component and the backend composite endpoint, plus pure calculation functions
 * for fuel cost, vignette cost, and currency formatting.
 */

// ─── Vignette Duration (duplicated from backend for frontend independence) ────

export type VignetteDuration =
  | '1-day'
  | '10-day'
  | '1-week'
  | '1-month'
  | '2-month'
  | '3-month'
  | '6-month'
  | '1-year';

/**
 * Duration sort order — shortest to longest.
 * Used to determine the "shortest available duration" default.
 */
export const DURATION_ORDER: Record<VignetteDuration, number> = {
  '1-day': 1,
  '10-day': 2,
  '1-week': 3,
  '1-month': 4,
  '2-month': 5,
  '3-month': 6,
  '6-month': 7,
  '1-year': 8,
};

// ─── Fuel Type (duplicated from backend for frontend independence) ─────────────

export type FuelType = 'diesel' | 'petrol_95' | 'petrol_98' | 'lpg';

// ─── Panel State ──────────────────────────────────────────────────────────────

export type PanelState = 'empty' | 'loading' | 'loaded' | 'error';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RouteSegmentCost {
  countryCode: string;
  countryName: string;
  distanceKm: number;
  fuelCostEur: number;
}

export interface VignetteSelection {
  countryCode: string;
  countryName: string;
  duration: VignetteDuration;
  priceEur: number;
  exempt: boolean;
  unavailable: boolean;
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
  selectedDuration: VignetteDuration;
  availableDurations: VignetteDuration[];
  priceEur: number;
  priceUnavailable: boolean;
}

// ─── Road Costs Interfaces ────────────────────────────────────────────────────

/**
 * A bridge toll entry in the cost breakdown response.
 */
export interface BridgeTollEntry {
  name: string;
  cost: number;
}

/**
 * A highway toll entry in the cost breakdown response.
 */
export interface HighwayTollEntry {
  segment: string;
  cost: number;
}

/**
 * A vignette entry in the road costs response.
 */
export interface VignetteEntry {
  countryCode: string;
  countryName: string;
  duration: string;
  cost: number;
  availableDurations: string[];
}

/**
 * The road costs section of the cost breakdown response.
 */
export interface RoadCosts {
  vignettes: VignetteEntry[];
  bridgeTolls: BridgeTollEntry[];
  highwayTolls: HighwayTollEntry[];
  totalRoadCostsEur: number;
}

// ─── Cost Breakdown Data ──────────────────────────────────────────────────────

export interface CostBreakdownData {
  totalCostEur: number;
  isPartialEstimate: boolean;
  fuel: {
    totalFuelCostEur: number;
    breakdown: FuelCountryBreakdown[];
  };
  roadCosts: RoadCosts;
  vehicleProfile: {
    id: string;
    name: string;
    fuelType: FuelType;
    consumptionPer100km: number;
  };
}

// ─── Pure Computation Functions ───────────────────────────────────────────────

/**
 * Calculate fuel cost for a single segment.
 * Formula: (distance_km / 100) × consumption_per_100km × price_per_liter
 * Result is rounded to 2 decimal places.
 */
export function calculateSegmentFuelCost(
  distanceKm: number,
  consumptionPer100km: number,
  pricePerLiter: number
): number {
  const cost = (distanceKm / 100) * consumptionPer100km * pricePerLiter;
  return Math.round(cost * 100) / 100;
}

/**
 * Calculate total fuel cost from segments, filtering out sub-1km segments.
 * Returns breakdown in traversal order (first-occurrence order of countries).
 */
export function calculateTotalFuelCost(
  segments: Array<{ distanceKm: number; countryCode: string; countryName: string }>,
  consumptionPer100km: number,
  fuelPrices: Record<string, number>
): { total: number; breakdown: RouteSegmentCost[] } {
  const breakdown: RouteSegmentCost[] = [];
  const countryIndex = new Map<string, number>();

  for (const segment of segments) {
    // Filter out sub-1km segments
    if (segment.distanceKm < 1) {
      continue;
    }

    const pricePerLiter = fuelPrices[segment.countryCode] ?? 0;
    const segmentCost = calculateSegmentFuelCost(
      segment.distanceKm,
      consumptionPer100km,
      pricePerLiter
    );

    const existingIndex = countryIndex.get(segment.countryCode);
    if (existingIndex !== undefined) {
      // Aggregate into existing country entry (preserves first-occurrence order)
      breakdown[existingIndex].distanceKm += segment.distanceKm;
      breakdown[existingIndex].fuelCostEur = Math.round(
        (breakdown[existingIndex].fuelCostEur + segmentCost) * 100
      ) / 100;
    } else {
      // New country — add in traversal order
      countryIndex.set(segment.countryCode, breakdown.length);
      breakdown.push({
        countryCode: segment.countryCode,
        countryName: segment.countryName,
        distanceKm: segment.distanceKm,
        fuelCostEur: segmentCost,
      });
    }
  }

  const total = Math.round(
    breakdown.reduce((sum, entry) => sum + entry.fuelCostEur, 0) * 100
  ) / 100;

  return { total, breakdown };
}

/**
 * Select the shortest available vignette duration for a country.
 * Returns the duration with the lowest DURATION_ORDER value.
 */
export function selectDefaultDuration(
  availableDurations: VignetteDuration[]
): VignetteDuration {
  return availableDurations.reduce((shortest, current) =>
    DURATION_ORDER[current] < DURATION_ORDER[shortest] ? current : shortest
  );
}

/**
 * Calculate total vignette cost from selections.
 * Sums prices of non-exempt, non-unavailable entries, rounded to 2 decimal places.
 */
export function calculateTotalVignetteCost(
  selections: VignetteSelection[]
): number {
  const total = selections
    .filter((s) => !s.exempt && !s.unavailable)
    .reduce((sum, s) => sum + s.priceEur, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Format a number as EUR currency string: €X.XX
 */
export function formatEur(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/**
 * Calculate total trip cost from fuel and vignette components.
 * Returns isPartial: true when either component is null (unavailable).
 */
export function calculateTripTotal(
  fuelCost: number | null,
  vignetteCost: number | null
): { total: number; isPartial: boolean } {
  const isPartial = fuelCost === null || vignetteCost === null;
  const total = Math.round(
    ((fuelCost ?? 0) + (vignetteCost ?? 0)) * 100
  ) / 100;
  return { total, isPartial };
}

/**
 * Calculate road costs subtotal from vignettes, bridge tolls, and highway tolls.
 * Returns the sum of all individual costs rounded to 2 decimal places.
 */
export function calculateRoadCostsSubtotal(roadCosts: RoadCosts): number {
  const vignettesTotal = roadCosts.vignettes.reduce((sum, v) => sum + v.cost, 0);
  const bridgeTollsTotal = roadCosts.bridgeTolls.reduce((sum, b) => sum + b.cost, 0);
  const highwayTollsTotal = roadCosts.highwayTolls.reduce((sum, h) => sum + h.cost, 0);
  return Math.round((vignettesTotal + bridgeTollsTotal + highwayTollsTotal) * 100) / 100;
}
