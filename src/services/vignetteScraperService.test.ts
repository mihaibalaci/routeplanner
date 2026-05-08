import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scrapeVignettePrices,
  scrapeIVignette,
  scrapeVintrica,
  VignetteScraperSource,
  ScrapedVignettePrice,
} from './vignetteScraperService';
import { VehicleType } from '../models/vehicleProfile';

// Mock database and redis
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

vi.mock('../utils/redis', () => ({
  cacheSet: vi.fn().mockResolvedValue(true),
  cacheGet: vi.fn().mockResolvedValue(null),
  CACHE_KEYS: {
    vignettePrices: (country: string, vehicleType: string) =>
      `vignette:prices:${country}:${vehicleType}`,
  },
  CACHE_TTL: {
    VIGNETTE_PRICES: 86400,
  },
}));

import { query } from '../utils/database';
import { cacheSet } from '../utils/redis';

const mockQuery = vi.mocked(query);
const mockCacheSet = vi.mocked(cacheSet);

describe('VignetteScraperService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scrapeIVignette', () => {
    it('should throw (stub not implemented)', async () => {
      await expect(scrapeIVignette('AT', 'car')).rejects.toThrow(
        'i-vignette.com scraping not implemented'
      );
    });
  });

  describe('scrapeVintrica', () => {
    it('should throw (stub not implemented)', async () => {
      await expect(scrapeVintrica('AT', 'car')).rejects.toThrow(
        'vintrica.com scraping not implemented'
      );
    });
  });

  describe('scrapeVignettePrices', () => {
    const mockPrices: ScrapedVignettePrice[] = [
      { duration: '10-day', price_eur: 9.9 },
      { duration: '1-month', price_eur: 16.2 },
    ];

    function createMockScrapers(options: {
      primaryFails?: boolean;
      secondaryFails?: boolean;
      primaryReturns?: ScrapedVignettePrice[] | null;
      secondaryReturns?: ScrapedVignettePrice[] | null;
    }): VignetteScraperSource[] {
      const primary: VignetteScraperSource = {
        name: 'i-vignette',
        scrape: options.primaryFails
          ? vi.fn().mockRejectedValue(new Error('primary failed'))
          : vi.fn().mockResolvedValue(options.primaryReturns ?? mockPrices),
      };
      const secondary: VignetteScraperSource = {
        name: 'vintrica',
        scrape: options.secondaryFails
          ? vi.fn().mockRejectedValue(new Error('secondary failed'))
          : vi.fn().mockResolvedValue(options.secondaryReturns ?? mockPrices),
      };
      return [primary, secondary];
    }

    it('should use primary source when available', async () => {
      const scrapers = createMockScrapers({});

      // Mock getVignetteCountryId — return a country ID for each query
      mockQuery.mockImplementation(async (text: string, _params?: unknown[]) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        if (text.includes('INSERT INTO vignette_prices')) {
          return { rows: [], rowCount: 1 } as any;
        }
        if (text.includes('SELECT vp.vehicle_type')) {
          return { rows: [], rowCount: 0 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Primary should have been called
      expect(scrapers[0].scrape).toHaveBeenCalled();
      // Secondary should NOT have been called (primary succeeded)
      expect(scrapers[1].scrape).not.toHaveBeenCalled();
    });

    it('should fall back to secondary when primary fails', async () => {
      const scrapers = createMockScrapers({ primaryFails: true });

      mockQuery.mockImplementation(async (text: string) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        if (text.includes('INSERT INTO vignette_prices')) {
          return { rows: [], rowCount: 1 } as any;
        }
        if (text.includes('SELECT vp.vehicle_type')) {
          return { rows: [], rowCount: 0 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Both should have been called
      expect(scrapers[0].scrape).toHaveBeenCalled();
      expect(scrapers[1].scrape).toHaveBeenCalled();
    });

    it('should retain existing prices and log alert on total failure', async () => {
      const scrapers = createMockScrapers({
        primaryFails: true,
        secondaryFails: true,
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockQuery.mockImplementation(async (text: string) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Should log alert for each country/vehicleType combo that failed
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ALERT')
      );

      // Should NOT have attempted to insert prices
      const insertCalls = mockQuery.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO vignette_prices')
      );
      expect(insertCalls).toHaveLength(0);

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should skip motorcycle scraping for exempt countries (RO, BG)', async () => {
      // Create scrapers that track calls
      const scrapeFn = vi.fn().mockResolvedValue(mockPrices);
      const scrapers: VignetteScraperSource[] = [
        { name: 'i-vignette', scrape: scrapeFn },
        { name: 'vintrica', scrape: vi.fn().mockResolvedValue(mockPrices) },
      ];

      mockQuery.mockImplementation(async (text: string, _params?: unknown[]) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        if (text.includes('INSERT INTO vignette_prices')) {
          return { rows: [], rowCount: 1 } as any;
        }
        if (text.includes('SELECT vp.vehicle_type')) {
          return { rows: [], rowCount: 0 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Check that motorcycle was never scraped for RO or BG
      const motorcycleCalls = scrapeFn.mock.calls.filter(
        (call: [string, VehicleType]) =>
          call[1] === 'motorcycle' && (call[0] === 'RO' || call[0] === 'BG')
      );
      expect(motorcycleCalls).toHaveLength(0);

      // But motorcycle should be scraped for other countries (e.g., AT)
      const atMotorcycleCalls = scrapeFn.mock.calls.filter(
        (call: [string, VehicleType]) =>
          call[1] === 'motorcycle' && call[0] === 'AT'
      );
      expect(atMotorcycleCalls.length).toBeGreaterThan(0);
    });

    it('should persist prices to DB with correct expires_at (fetched_at + 24h)', async () => {
      const scrapers = createMockScrapers({});

      const insertParams: unknown[][] = [];
      mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        if (text.includes('INSERT INTO vignette_prices')) {
          if (params) insertParams.push(params);
          return { rows: [], rowCount: 1 } as any;
        }
        if (text.includes('SELECT vp.vehicle_type')) {
          return { rows: [], rowCount: 0 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Verify at least one insert was made
      expect(insertParams.length).toBeGreaterThan(0);

      // Check that expires_at is 24h after fetched_at
      for (const params of insertParams) {
        const fetchedAt = params[5] as Date;
        const expiresAt = params[6] as Date;
        const diffMs = expiresAt.getTime() - fetchedAt.getTime();
        expect(diffMs).toBe(24 * 60 * 60 * 1000);
      }
    });

    it('should update Redis cache after successful scrape', async () => {
      const scrapers = createMockScrapers({});

      mockQuery.mockImplementation(async (text: string) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [{ id: 'country-uuid-1' }], rowCount: 1 } as any;
        }
        if (text.includes('INSERT INTO vignette_prices')) {
          return { rows: [], rowCount: 1 } as any;
        }
        if (text.includes('SELECT vp.vehicle_type')) {
          return {
            rows: [
              { vehicle_type: 'car', duration: '10-day', price_eur: '9.90', source: 'i-vignette', fetched_at: new Date(), expires_at: new Date() },
            ],
            rowCount: 1,
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Redis cache should have been updated
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should skip country if not found in database', async () => {
      const scrapers = createMockScrapers({});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockQuery.mockImplementation(async (text: string) => {
        if (text.includes('SELECT id FROM vignette_countries')) {
          return { rows: [], rowCount: 0 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      await scrapeVignettePrices(scrapers);

      // Scrapers should not have been called since no country IDs were found
      expect(scrapers[0].scrape).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found in database')
      );

      warnSpy.mockRestore();
    });
  });
});
