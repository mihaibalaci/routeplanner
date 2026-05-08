import { query } from '../utils/database';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '../utils/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FuelPrice {
  country_code: string;
  fuel_type: string;
  price_per_liter_eur: number;
  source: string;
  fetched_at: Date;
  expires_at: Date;
}

export type FuelType = 'diesel' | 'petrol_95' | 'petrol_98' | 'lpg';

export const FUEL_TYPES: FuelType[] = ['diesel', 'petrol_95', 'petrol_98', 'lpg'];

// European country codes covered by the platform
export const EUROPEAN_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'MD',
];

// ─── Scraper Functions (Stubs) ────────────────────────────────────────────────

/**
 * Primary source: CieloWeb fuel price scraper.
 * Stub implementation — to be filled with actual scraping logic.
 */
export async function scrapeCieloWeb(
  country: string,
  fuelType: FuelType
): Promise<FuelPrice | null> {
  // Stub: In production, this would scrape CieloWeb for fuel prices
  // Throws to simulate unavailability so fallback chain is exercised
  throw new Error(`CieloWeb scraping not implemented for ${country}/${fuelType}`);
}

/**
 * Secondary source: GlobalPetrolPrices scraper.
 * Stub implementation — to be filled with actual scraping logic.
 */
export async function scrapeGlobalPetrolPrices(
  country: string,
  fuelType: FuelType
): Promise<FuelPrice | null> {
  // Stub: In production, this would scrape GlobalPetrolPrices
  throw new Error(`GlobalPetrolPrices scraping not implemented for ${country}/${fuelType}`);
}

/**
 * Tertiary fallback: Google Maps fuel price data.
 * Stub implementation — to be filled with actual API call.
 */
export async function fetchGoogleMapsFuelPrice(
  country: string,
  fuelType: FuelType
): Promise<FuelPrice | null> {
  // Stub: In production, this would fetch from Google Maps
  throw new Error(`Google Maps fuel price not implemented for ${country}/${fuelType}`);
}

// ─── Cache & Persistence ──────────────────────────────────────────────────────

/**
 * Cache a fuel price in Redis with 6-hour TTL.
 */
export async function cacheFuelPrice(
  country: string,
  fuelType: string,
  price: FuelPrice
): Promise<void> {
  const key = CACHE_KEYS.fuelPrice(country, fuelType);
  await cacheSet(key, price, CACHE_TTL.FUEL_PRICE);
}

/**
 * Persist a fuel price to PostgreSQL.
 * Uses UPSERT to update existing records for the same country/fuel_type/source.
 */
export async function persistFuelPrice(
  country: string,
  fuelType: string,
  price: FuelPrice
): Promise<void> {
  await query(
    `INSERT INTO fuel_prices (country_code, fuel_type, price_per_liter_eur, source, fetched_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (country_code, fuel_type, source)
     DO UPDATE SET
       price_per_liter_eur = EXCLUDED.price_per_liter_eur,
       fetched_at = EXCLUDED.fetched_at,
       expires_at = EXCLUDED.expires_at`,
    [
      country,
      fuelType,
      price.price_per_liter_eur,
      price.source,
      price.fetched_at,
      price.expires_at,
    ]
  );
}

// ─── Price Retrieval ──────────────────────────────────────────────────────────

/**
 * Get fuel price from cache first, then fall back to database.
 */
export async function getPrice(
  country: string,
  fuelType: string
): Promise<FuelPrice | null> {
  // Try cache first
  const cacheKey = CACHE_KEYS.fuelPrice(country, fuelType);
  const cached = await cacheGet<FuelPrice>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fall back to database
  const result = await query(
    `SELECT country_code, fuel_type, price_per_liter_eur, source, fetched_at, expires_at
     FROM fuel_prices
     WHERE country_code = $1 AND fuel_type = $2
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [country, fuelType]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const fuelPrice: FuelPrice = {
    country_code: row.country_code,
    fuel_type: row.fuel_type,
    price_per_liter_eur: parseFloat(row.price_per_liter_eur),
    source: row.source,
    fetched_at: new Date(row.fetched_at),
    expires_at: new Date(row.expires_at),
  };

  // Re-cache the DB result
  await cacheFuelPrice(country, fuelType, fuelPrice);

  return fuelPrice;
}

// ─── Scraper Source Type ───────────────────────────────────────────────────────

export type ScraperFn = (country: string, fuelType: FuelType) => Promise<FuelPrice | null>;

export interface ScraperSource {
  name: string;
  scrape: ScraperFn;
}

/**
 * Default scraper sources in priority order.
 */
export const DEFAULT_SCRAPERS: ScraperSource[] = [
  { name: 'cieloweb', scrape: scrapeCieloWeb },
  { name: 'globalpetrolprices', scrape: scrapeGlobalPetrolPrices },
  { name: 'google_maps', scrape: fetchGoogleMapsFuelPrice },
];

// ─── Main Scraping Function ───────────────────────────────────────────────────

/**
 * Main scraping function with fallback chain:
 * CieloWeb → GlobalPetrolPrices → Google Maps
 *
 * On total failure for a country/fuelType: retains existing price, logs alert.
 *
 * @param scrapers - Optional override of scraper sources (for testing)
 */
export async function scrapeFuelPrices(
  scrapers: ScraperSource[] = DEFAULT_SCRAPERS
): Promise<void> {
  const countries = EUROPEAN_COUNTRY_CODES;

  for (const country of countries) {
    for (const fuelType of FUEL_TYPES) {
      let price: FuelPrice | null = null;

      for (const source of scrapers) {
        try {
          price = await source.scrape(country, fuelType);
          if (price) {
            price.source = source.name;
            break;
          }
        } catch (e) {
          console.warn(
            `[FuelPrice] ${source.name} failed for ${country}/${fuelType}:`,
            (e as Error).message
          );
        }
      }

      // Persist and cache if we got a price
      if (price) {
        await cacheFuelPrice(country, fuelType, price);
        await persistFuelPrice(country, fuelType, price);
      } else {
        // Retain existing price, log alert
        console.error(
          `[FuelPrice] ALERT: All fuel price sources failed for ${country}/${fuelType}. Retaining existing price.`
        );
      }
    }
  }
}
