import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn(),
}));

// Mock the redis module
vi.mock('../../utils/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(true),
  cacheDelete: vi.fn(),
  CACHE_KEYS: {
    fuelPrice: (country: string, fuelType: string) =>
      `fuel:price:${country}:${fuelType}`,
  },
  CACHE_TTL: {
    FUEL_PRICE: 6 * 60 * 60,
  },
}));

import type { FuelPrice, ScraperSource, FuelType } from '../../services/fuelPriceService';
import { cacheSet } from '../../utils/redis';
import { query } from '../../utils/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFuelPrice(source: string): FuelPrice {
  return {
    country_code: 'DE',
    fuel_type: 'diesel',
    price_per_liter_eur: 1.55,
    source,
    fetched_at: new Date(),
    expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
  };
}

// ─── Property 10: Fuel Price Fallback Chain ───────────────────────────────────
// Sources attempted in order, first success used.
// **Validates: Requirements 6.2, 6.3**

describe('Property 10: Fuel Price Fallback Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('sources are attempted in order and the first successful source is used', async () => {
    /**
     * **Validates: Requirements 6.2, 6.3**
     */
    const { scrapeFuelPrices } = await import('../../services/fuelPriceService');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }),
        async (successIndex) => {
          vi.clearAllMocks();
          (query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowCount: 0 });

          const sourceNames = ['source_alpha', 'source_beta', 'source_gamma'];
          const callOrder: string[] = [];

          // Build mock scrapers: scrapers before successIndex throw, the one at successIndex succeeds
          const scrapers: ScraperSource[] = sourceNames.map((name, idx) => ({
            name,
            scrape: vi.fn(async (_country: string, _fuelType: FuelType) => {
              callOrder.push(name);
              if (idx < successIndex) {
                throw new Error(`${name} unavailable`);
              }
              if (idx === successIndex) {
                return makeFuelPrice(name);
              }
              // Scrapers after the successful one should not be called
              return makeFuelPrice(name);
            }),
          }));

          await scrapeFuelPrices(scrapers);

          // Verify: for each country/fuelType combo, the scrapers before successIndex
          // were called, and the successful one was called.
          // We check the first country/fuelType combo to verify the pattern.
          const firstComboCallOrder = callOrder.slice(0, successIndex + 1);
          const expectedOrder = sourceNames.slice(0, successIndex + 1);
          expect(firstComboCallOrder).toEqual(expectedOrder);

          // Verify that cacheFuelPrice was called with the source name of the successful scraper
          const cacheSetMock = cacheSet as ReturnType<typeof vi.fn>;
          if (cacheSetMock.mock.calls.length > 0) {
            // The cached price should have the source of the first successful scraper
            const firstCachedPrice = cacheSetMock.mock.calls[0][1] as FuelPrice;
            expect(firstCachedPrice.source).toBe(sourceNames[successIndex]);
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});

// ─── Property 11: Fuel Price Retention on Total Failure ───────────────────────
// Existing prices unchanged when all sources fail.
// **Validates: Requirements 6.7**

describe('Property 11: Fuel Price Retention on Total Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('when all scrapers fail, no new prices are cached or persisted', async () => {
    /**
     * **Validates: Requirements 6.7**
     */
    const { scrapeFuelPrices } = await import('../../services/fuelPriceService');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numScrapers) => {
          vi.clearAllMocks();
          (query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowCount: 0 });

          // Create scrapers that ALL throw errors
          const scrapers: ScraperSource[] = Array.from({ length: numScrapers }, (_, i) => ({
            name: `failing_source_${i}`,
            scrape: vi.fn(async () => {
              throw new Error(`Source ${i} is down`);
            }),
          }));

          await scrapeFuelPrices(scrapers);

          // Verify: cacheFuelPrice was never called (cacheSet not called)
          const cacheSetMock = cacheSet as ReturnType<typeof vi.fn>;
          expect(cacheSetMock).not.toHaveBeenCalled();

          // Verify: persistFuelPrice was never called (query for INSERT not called)
          const queryMock = query as ReturnType<typeof vi.fn>;
          const insertCalls = queryMock.mock.calls.filter(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO fuel_prices')
          );
          expect(insertCalls).toHaveLength(0);
        }
      ),
      { numRuns: 5 }
    );
  });
});
