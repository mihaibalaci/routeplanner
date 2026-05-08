/**
 * Road Costs Interfaces
 * TypeScript interfaces for the road costs feature including Google Routes API
 * toll data, parsed toll entries, and the unified road costs response structure.
 * Requirements: 3.1, 3.2, 3.3
 */

/**
 * Fuel cost breakdown per country in the cost breakdown response.
 */
export interface FuelCountryBreakdown {
  countryCode: string;
  countryName: string;
  distanceKm: number;
  fuelPricePerLiter: number;
  fuelCostEur: number;
}

/**
 * Google Routes API toll response structure (relevant subset).
 */
export interface GoogleRoutesTollInfo {
  tollInfo?: {
    estimatedPrice?: Array<{
      currencyCode: string;
      units: string;
      nanos?: number;
    }>;
  };
  // Per-leg toll info from the Routes API
  legs?: Array<{
    travelAdvisory?: {
      tollInfo?: {
        estimatedPrice?: Array<{
          currencyCode: string;
          units: string;
          nanos?: number;
        }>;
      };
    };
  }>;
  // Route-level toll info
  travelAdvisory?: {
    tollInfo?: {
      estimatedPrice?: Array<{
        currencyCode: string;
        units: string;
        nanos?: number;
      }>;
    };
  };
}

/**
 * Parsed toll entry from the Google Routes API response.
 */
export interface ParsedTollEntry {
  name: string;
  costEur: number;
  category: 'bridge' | 'highway';
}

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

/**
 * Result from the toll service after fetching and parsing Google Routes API data.
 * Returns null if the API call fails or times out.
 */
export interface TollServiceResult {
  bridgeTolls: BridgeTollEntry[];
  highwayTolls: HighwayTollEntry[];
}

/**
 * Updated cost breakdown response including road costs.
 * The `roadCosts` field replaces the previous top-level `vignettes` field.
 */
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
    fuelType: string | null;
    consumptionPer100km: number | null;
  };
}
