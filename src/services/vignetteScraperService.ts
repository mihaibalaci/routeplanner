import { query } from '../utils/database';
import { cacheSet, CACHE_KEYS, CACHE_TTL } from '../utils/redis';
import {
  VIGNETTE_COUNTRY_CODES,
  MOTORCYCLE_EXEMPT_COUNTRIES,
} from '../models/vignette';
import { VehicleType } from '../models/vehicleProfile';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VignetteScraperFn = (
  countryCode: string,
  vehicleType: VehicleType
) => Promise<ScrapedVignettePrice[]>;

export interface ScrapedVignettePrice {
  duration: string;
  price_eur: number;
}

export interface VignetteScraperSource {
  name: 'i-vignette' | 'vintrica';
  scrape: VignetteScraperFn;
}

// ─── Vehicle Types to Scrape ──────────────────────────────────────────────────

const VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'car', 'camper'];

// ─── Scraper Stubs ────────────────────────────────────────────────────────────

/**
 * Primary source: i-vignette.com scraper.
 * Stub implementation — throws to simulate unavailability.
 */
export async function scrapeIVignette(
  countryCode: string,
  vehicleType: VehicleType
): Promise<ScrapedVignettePrice[]> {
  throw new Error(
    `i-vignette.com scraping not implemented for ${countryCode}/${vehicleType}`
  );
}

/**
 * Secondary source: vintrica.com scraper.
 * Stub implementation — throws to simulate unavailability.
 */
export async function scrapeVintrica(
  countryCode: string,
  vehicleType: VehicleType
): Promise<ScrapedVignettePrice[]> {
  throw new Error(
    `vintrica.com scraping not implemented for ${countryCode}/${vehicleType}`
  );
}

// ─── Default Scraper Sources ──────────────────────────────────────────────────

export const DEFAULT_VIGNETTE_SCRAPERS: VignetteScraperSource[] = [
  { name: 'i-vignette', scrape: scrapeIVignette },
  { name: 'vintrica', scrape: scrapeVintrica },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Persist scraped vignette prices to PostgreSQL.
 * Uses UPSERT on (vignette_country_id, vehicle_type, duration, source).
 * Sets expires_at = fetched_at + 24 hours.
 */
export async function persistVignettePrice(
  vignetteCountryId: string,
  vehicleType: VehicleType,
  duration: string,
  priceEur: number,
  source: 'i-vignette' | 'vintrica',
  fetchedAt: Date
): Promise<void> {
  const expiresAt = new Date(fetchedAt.getTime() + 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO vignette_prices (vignette_country_id, vehicle_type, duration, price_eur, source, fetched_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (vignette_country_id, vehicle_type, duration, source)
     DO UPDATE SET
       price_eur = EXCLUDED.price_eur,
       fetched_at = EXCLUDED.fetched_at,
       expires_at = EXCLUDED.expires_at`,
    [vignetteCountryId, vehicleType, duration, priceEur, source, fetchedAt, expiresAt]
  );
}

/**
 * Update Redis cache for a country/vehicleType with the latest prices from DB.
 */
export async function updateVignettePriceCache(
  countryCode: string,
  vehicleType: VehicleType
): Promise<void> {
  const result = await query(
    `SELECT vp.vehicle_type, vp.duration, vp.price_eur, vp.source, vp.fetched_at, vp.expires_at
     FROM vignette_prices vp
     JOIN vignette_countries vc ON vp.vignette_country_id = vc.id
     WHERE vc.country_code = $1 AND vp.vehicle_type = $2
     ORDER BY vp.fetched_at DESC`,
    [countryCode, vehicleType]
  );

  if (result.rows.length > 0) {
    const prices = result.rows.map((row) => ({
      duration: row.duration,
      priceEur: parseFloat(row.price_eur),
      source: row.source,
      fetchedAt: row.fetched_at,
    }));

    const cacheKey = CACHE_KEYS.vignettePrices(countryCode, vehicleType);
    await cacheSet(cacheKey, prices, CACHE_TTL.VIGNETTE_PRICES);
  }
}

// ─── Helper: Get Vignette Country ID ──────────────────────────────────────────

/**
 * Retrieve the vignette_country_id for a given country code.
 */
async function getVignetteCountryId(countryCode: string): Promise<string | null> {
  const result = await query(
    `SELECT id FROM vignette_countries WHERE country_code = $1 AND active = true`,
    [countryCode]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ─── Main Scraping Function ───────────────────────────────────────────────────

/**
 * Main vignette price scraping function with fallback chain:
 * i-vignette.com (primary) → vintrica.com (secondary)
 *
 * - Skips motorcycle scraping for exempt countries (RO, BG).
 * - On total failure for a country/vehicleType: retains existing prices, logs alert.
 * - On success: persists to DB (UPSERT) with expires_at = fetched_at + 24h, updates Redis cache.
 *
 * @param scrapers - Optional override of scraper sources (for testing)
 */
export async function scrapeVignettePrices(
  scrapers: VignetteScraperSource[] = DEFAULT_VIGNETTE_SCRAPERS
): Promise<void> {
  const countryCodes = [...VIGNETTE_COUNTRY_CODES];

  for (const countryCode of countryCodes) {
    const countryId = await getVignetteCountryId(countryCode);
    if (!countryId) {
      console.warn(
        `[VignetteScraper] Country ${countryCode} not found in database, skipping.`
      );
      continue;
    }

    for (const vehicleType of VEHICLE_TYPES) {
      // Skip motorcycle scraping for exempt countries (RO, BG)
      if (vehicleType === 'motorcycle' && MOTORCYCLE_EXEMPT_COUNTRIES.has(countryCode)) {
        continue;
      }

      let prices: ScrapedVignettePrice[] | null = null;
      let usedSource: 'i-vignette' | 'vintrica' | null = null;

      // Fallback chain: try each scraper in order
      for (const source of scrapers) {
        try {
          const result = await source.scrape(countryCode, vehicleType);
          if (result && result.length > 0) {
            prices = result;
            usedSource = source.name;
            break;
          }
        } catch (e) {
          console.warn(
            `[VignetteScraper] ${source.name} failed for ${countryCode}/${vehicleType}:`,
            (e as Error).message
          );
        }
      }

      if (prices && usedSource) {
        // Persist each price to DB and update cache
        const fetchedAt = new Date();
        for (const priceEntry of prices) {
          await persistVignettePrice(
            countryId,
            vehicleType,
            priceEntry.duration,
            priceEntry.price_eur,
            usedSource,
            fetchedAt
          );
        }
        await updateVignettePriceCache(countryCode, vehicleType);
      } else {
        // Total failure: retain existing cached prices, log alert
        console.error(
          `[VignetteScraper] ALERT: All vignette price sources failed for ${countryCode}/${vehicleType}. Retaining existing prices.`
        );
      }
    }
  }
}
