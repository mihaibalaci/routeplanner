import { query } from '../utils/database';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '../utils/redis';
import { VehicleType } from '../models/vehicleProfile';
import {
  VignetteCountry,
  VignettePrice,
  VignetteDuration,
  RouteVignetteRequirement,
  VignetteCostEstimate,
  VignetteCostBreakdown,
  DURATION_ORDER,
} from '../models/vignette';
import { getRoute } from './routeService';

// ─── Repository Functions ─────────────────────────────────────────────────────

/**
 * Fetch all active vignette countries from the database.
 */
async function fetchCountriesFromDB(): Promise<VignetteCountry[]> {
  const result = await query(
    'SELECT * FROM vignette_countries WHERE active = true ORDER BY country_code ASC'
  );
  return result.rows.map(mapCountryRow);
}

/**
 * Fetch vignette prices for a specific country and vehicle type from the database.
 */
async function fetchPricesFromDB(
  countryCode: string,
  vehicleType: VehicleType
): Promise<VignettePrice[]> {
  const result = await query(
    `SELECT vp.* FROM vignette_prices vp
     JOIN vignette_countries vc ON vp.vignette_country_id = vc.id
     WHERE vc.country_code = $1 AND vp.vehicle_type = $2
     ORDER BY vp.price_eur ASC`,
    [countryCode, vehicleType]
  );
  return result.rows.map(mapPriceRow);
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Returns all active vignette countries.
 * Cache-first: checks Redis (vignette:countries, 24h TTL), then falls back to DB.
 */
export async function getCountriesRequiringVignette(): Promise<VignetteCountry[]> {
  const cacheKey = CACHE_KEYS.vignetteCountries();

  // Try cache first
  const cached = await cacheGet<VignetteCountry[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fall back to DB
  const countries = await fetchCountriesFromDB();

  // Cache the result
  if (countries.length > 0) {
    await cacheSet(cacheKey, countries, CACHE_TTL.VIGNETTE_COUNTRIES);
  }

  return countries;
}

/**
 * Returns vignette prices for a given country and vehicle type.
 * Cache-first: checks Redis (vignette:prices:{country}:{vehicle_type}, 24h TTL), then DB.
 */
export async function getPrices(
  countryCode: string,
  vehicleType: VehicleType
): Promise<VignettePrice[]> {
  const cacheKey = CACHE_KEYS.vignettePrices(countryCode, vehicleType);

  // Try cache first
  const cached = await cacheGet<VignettePrice[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fall back to DB
  const prices = await fetchPricesFromDB(countryCode, vehicleType);

  // Cache the result
  if (prices.length > 0) {
    await cacheSet(cacheKey, prices, CACHE_TTL.VIGNETTE_PRICES);
  }

  return prices;
}

/**
 * Determines vignette requirements for a given route.
 * Extracts unique country codes from route segments, filters to vignette countries,
 * and applies motorcycle exemption logic.
 * Cache: vignette:route:{route_id} with 1h TTL.
 */
export async function getRouteVignetteRequirements(
  routeId: string,
  vehicleType?: VehicleType
): Promise<RouteVignetteRequirement[]> {
  const cacheKey = CACHE_KEYS.vignetteRoute(routeId);

  // Try cache first (only if no vehicleType override — cache stores the base requirements)
  if (!vehicleType) {
    const cached = await cacheGet<RouteVignetteRequirement[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Get route with segments
  const routeDetails = await getRoute(routeId);
  if (!routeDetails) {
    const error = new Error(`Route not found: ${routeId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  // Extract unique country codes from segments
  const countriesOnRoute = new Set(
    routeDetails.segments.map((s) => s.country_code)
  );

  // Get all vignette countries
  const vignetteCountries = await getCountriesRequiringVignette();

  // Filter to countries on this route that require vignettes
  const requirements: RouteVignetteRequirement[] = [];

  for (const vc of vignetteCountries) {
    if (!countriesOnRoute.has(vc.country_code)) {
      continue;
    }

    // Apply motorcycle exemption
    const isExempt =
      vehicleType === 'motorcycle' && vc.motorcycle_exempt;

    // Get prices for this country and vehicle type (if not exempt)
    let prices: VignettePrice[] = [];
    if (!isExempt && vehicleType) {
      prices = await getPrices(vc.country_code, vehicleType);
    }

    requirements.push({
      countryCode: vc.country_code,
      countryName: vc.country_name,
      required: !isExempt,
      motorcycleExempt: vc.motorcycle_exempt,
      availableDurations: vc.available_durations,
      prices,
    });
  }

  // Cache the result (without vehicle-specific prices for reusability)
  if (!vehicleType) {
    await cacheSet(cacheKey, requirements, CACHE_TTL.VIGNETTE_ROUTE);
  }

  return requirements;
}

/**
 * Calculates the total vignette cost for a route.
 * For each required country, looks up the price for the selected duration
 * (or defaults to the shortest available duration).
 * Returns total cost and per-country breakdown.
 */
export async function calculateVignetteCost(
  routeId: string,
  vehicleType: VehicleType,
  durationPreferences: Record<string, VignetteDuration> = {}
): Promise<VignetteCostEstimate> {
  // Get route vignette requirements with vehicle type for exemption logic
  const requirements = await getRouteVignetteRequirements(routeId, vehicleType);

  const countryBreakdown: VignetteCostBreakdown[] = [];
  let totalCost = 0;

  for (const req of requirements) {
    // Skip exempt countries
    if (!req.required) {
      continue;
    }

    // Get prices for this country
    const prices = req.prices.length > 0
      ? req.prices
      : await getPrices(req.countryCode, vehicleType);

    if (prices.length === 0) {
      // No prices available — skip (can't calculate cost)
      continue;
    }

    // Determine which duration to use
    const selectedDuration =
      durationPreferences[req.countryCode] ||
      getShortestAvailableDuration(prices);

    // Find the price for the selected duration
    const priceEntry = prices.find((p) => p.duration === selectedDuration);
    const costEur = priceEntry ? priceEntry.price_eur : 0;

    countryBreakdown.push({
      countryCode: req.countryCode,
      countryName: req.countryName,
      selectedDuration,
      costEur,
    });

    totalCost += costEur;
  }

  return {
    totalVignetteCostEur: Math.round(totalCost * 100) / 100,
    countryBreakdown,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Returns the shortest available duration from a list of prices.
 */
function getShortestAvailableDuration(prices: VignettePrice[]): VignetteDuration {
  const durations = prices.map((p) => p.duration);
  durations.sort((a, b) => DURATION_ORDER[a] - DURATION_ORDER[b]);
  return durations[0];
}

/**
 * Maps a database row to a VignetteCountry object.
 */
function mapCountryRow(row: any): VignetteCountry {
  return {
    id: row.id,
    country_code: row.country_code,
    country_name: row.country_name,
    motorcycle_exempt: row.motorcycle_exempt,
    available_durations: typeof row.available_durations === 'string'
      ? JSON.parse(row.available_durations)
      : row.available_durations,
    active: row.active,
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

/**
 * Maps a database row to a VignettePrice object.
 */
function mapPriceRow(row: any): VignettePrice {
  return {
    id: row.id,
    vignette_country_id: row.vignette_country_id,
    vehicle_type: row.vehicle_type,
    duration: row.duration,
    price_eur: typeof row.price_eur === 'string' ? parseFloat(row.price_eur) : row.price_eur,
    source: row.source,
    fetched_at: row.fetched_at instanceof Date ? row.fetched_at : new Date(row.fetched_at),
    expires_at: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
  };
}
