/**
 * Vignette model type definitions matching the PostgreSQL vignette_countries
 * and vignette_prices table schemas.
 */

import { VehicleType } from './vehicleProfile';

// ─── Duration Types ───────────────────────────────────────────────────────────

export type VignetteDuration =
  | '1-day'
  | '10-day'
  | '1-week'
  | '1-month'
  | '2-month'
  | '3-month'
  | '6-month'
  | '1-year';

export const VALID_VIGNETTE_DURATIONS: VignetteDuration[] = [
  '1-day',
  '10-day',
  '1-week',
  '1-month',
  '2-month',
  '3-month',
  '6-month',
  '1-year',
];

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

// ─── Database Models ──────────────────────────────────────────────────────────

export interface VignetteCountry {
  id: string;
  country_code: string;
  country_name: string;
  motorcycle_exempt: boolean;
  available_durations: VignetteDuration[];
  active: boolean;
  updated_at: Date;
}

export interface VignettePrice {
  id: string;
  vignette_country_id: string;
  vehicle_type: VehicleType;
  duration: VignetteDuration;
  price_eur: number;
  source: 'i-vignette' | 'vintrica';
  fetched_at: Date;
  expires_at: Date;
}

// ─── Service Response Types ───────────────────────────────────────────────────

export interface RouteVignetteRequirement {
  countryCode: string;
  countryName: string;
  required: boolean;
  motorcycleExempt: boolean;
  availableDurations: VignetteDuration[];
  prices: VignettePrice[];
}

export interface VignetteCostBreakdown {
  countryCode: string;
  countryName: string;
  selectedDuration: VignetteDuration;
  costEur: number;
}

export interface VignetteCostEstimate {
  totalVignetteCostEur: number;
  countryBreakdown: VignetteCostBreakdown[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Countries that require a vignette (ISO 3166-1 alpha-2). */
export const VIGNETTE_COUNTRY_CODES = new Set([
  'AT', 'BG', 'CZ', 'HU', 'MD', 'RO', 'SK', 'SI', 'CH',
]);

/** Countries where motorcycles are exempt from vignette requirements. */
export const MOTORCYCLE_EXEMPT_COUNTRIES = new Set(['RO', 'BG']);
