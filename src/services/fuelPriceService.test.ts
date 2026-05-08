import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fuelPriceService from './fuelPriceService';

// Mock database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

// Mock redis
vi.mock('../utils/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(true),
  CACHE_KEYS: {
    fuelPrice: (country: string, fuelType: string) => `fuel:price:${country}:${fuelType}`,
  },
  CACHE_TTL: {
    FUEL_PRICE: 21600,
  },
}));

import { query } from '../utils/database';
import { cacheGet, cacheSet } from '../utils/redis';

const mockQuery = vi.mocked(query);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);

describe('FuelPriceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPrice', () => {
    it('should return cached price when available', async () => {
      const cachedPrice: fuelPriceService.FuelPrice = {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.65,
        source: 'cieloweb',
        fetched_at: new Date('2024-01-01T10:00:00Z'),
        expires_at: new Date('2024-01-01T16:00:00Z'),
      };

      mockCacheGet.mockResolvedValue(cachedPrice);

      const result = await fuelPriceService.getPrice('DE', 'diesel');

      expect(result).toEqual(cachedPrice);
      expect(mockCacheGet).toHaveBeenCalledWith('fuel:price:DE:diesel');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should fall back to database when cache misses', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: [
          {
            country_code: 'FR',
            fuel_type: 'petrol_95',
            price_per_liter_eur: '1.82',
            source: 'globalpetrolprices',
            fetched_at: '2024-01-01T10:00:00Z',
            expires_at: '2024-01-01T16:00:00Z',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await fuelPriceService.getPrice('FR', 'petrol_95');

      expect(result).not.toBeNull();
      expect(result!.country_code).toBe('FR');
      expect(result!.fuel_type).toBe('petrol_95');
      expect(result!.price_per_liter_eur).toBe(1.82);
      expect(result!.source).toBe('globalpetrolprices');
      // Should re-cache the DB result
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return null when no price exists in cache or DB', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await fuelPriceService.getPrice('XX', 'diesel');

      expect(result).toBeNull();
    });
  });

  describe('cacheFuelPrice', () => {
    it('should cache price with correct key and TTL', async () => {
      const price: fuelPriceService.FuelPrice = {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.65,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };

      await fuelPriceService.cacheFuelPrice('DE', 'diesel', price);

      expect(mockCacheSet).toHaveBeenCalledWith(
        'fuel:price:DE:diesel',
        price,
        21600
      );
    });
  });

  describe('persistFuelPrice', () => {
    it('should upsert fuel price into database', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);

      const price: fuelPriceService.FuelPrice = {
        country_code: 'IT',
        fuel_type: 'lpg',
        price_per_liter_eur: 0.75,
        source: 'google_maps',
        fetched_at: new Date('2024-01-01T12:00:00Z'),
        expires_at: new Date('2024-01-01T18:00:00Z'),
      };

      await fuelPriceService.persistFuelPrice('IT', 'lpg', price);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fuel_prices'),
        ['IT', 'lpg', 0.75, 'google_maps', price.fetched_at, price.expires_at]
      );
    });
  });

  describe('scrapeFuelPrices', () => {
    it('should attempt all sources in fallback order and log alert on total failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // All scrapers fail
      const failingScrapers: fuelPriceService.ScraperSource[] = [
        { name: 'cieloweb', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
        { name: 'globalpetrolprices', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
        { name: 'google_maps', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
      ];

      await fuelPriceService.scrapeFuelPrices(failingScrapers);

      // Should log alerts for all country/fuelType combinations
      expect(consoleSpy).toHaveBeenCalled();
      const alertCalls = consoleSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('ALERT')
      );
      expect(alertCalls.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should cache and persist price when first source succeeds', async () => {
      const mockPrice: fuelPriceService.FuelPrice = {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.65,
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };

      const scrapers: fuelPriceService.ScraperSource[] = [
        { name: 'cieloweb', scrape: vi.fn().mockResolvedValue(mockPrice) },
        { name: 'globalpetrolprices', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
        { name: 'google_maps', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
      ];

      mockQuery.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);

      await fuelPriceService.scrapeFuelPrices(scrapers);

      // Should have cached and persisted prices
      expect(mockCacheSet).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalled();
      // Second and third scrapers should not have been called
      expect(scrapers[1].scrape).not.toHaveBeenCalled();
      expect(scrapers[2].scrape).not.toHaveBeenCalled();
    });

    it('should try second source when first fails', async () => {
      const mockPrice: fuelPriceService.FuelPrice = {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.70,
        source: 'globalpetrolprices',
        fetched_at: new Date(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };

      const scrapers: fuelPriceService.ScraperSource[] = [
        { name: 'cieloweb', scrape: vi.fn().mockRejectedValue(new Error('unavailable')) },
        { name: 'globalpetrolprices', scrape: vi.fn().mockResolvedValue(mockPrice) },
        { name: 'google_maps', scrape: vi.fn().mockRejectedValue(new Error('fail')) },
      ];

      mockQuery.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await fuelPriceService.scrapeFuelPrices(scrapers);

      // Second scraper should have been called
      expect(scrapers[1].scrape).toHaveBeenCalled();
      // Prices should be cached with source 'globalpetrolprices'
      const cachedCalls = mockCacheSet.mock.calls;
      const gppCached = cachedCalls.some(
        (call) => (call[1] as any).source === 'globalpetrolprices'
      );
      expect(gppCached).toBe(true);
      // Third scraper should not have been called
      expect(scrapers[2].scrape).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should try third source when first two fail', async () => {
      const mockPrice: fuelPriceService.FuelPrice = {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: 1.68,
        source: 'google_maps',
        fetched_at: new Date(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };

      const scrapers: fuelPriceService.ScraperSource[] = [
        { name: 'cieloweb', scrape: vi.fn().mockRejectedValue(new Error('unavailable')) },
        { name: 'globalpetrolprices', scrape: vi.fn().mockRejectedValue(new Error('unavailable')) },
        { name: 'google_maps', scrape: vi.fn().mockResolvedValue(mockPrice) },
      ];

      mockQuery.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await fuelPriceService.scrapeFuelPrices(scrapers);

      expect(scrapers[2].scrape).toHaveBeenCalled();
      const cachedCalls = mockCacheSet.mock.calls;
      const gmCached = cachedCalls.some(
        (call) => (call[1] as any).source === 'google_maps'
      );
      expect(gmCached).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('FUEL_TYPES', () => {
    it('should contain all expected fuel types', () => {
      expect(fuelPriceService.FUEL_TYPES).toEqual(['diesel', 'petrol_95', 'petrol_98', 'lpg']);
    });
  });

  describe('EUROPEAN_COUNTRY_CODES', () => {
    it('should contain expected European countries', () => {
      expect(fuelPriceService.EUROPEAN_COUNTRY_CODES).toContain('DE');
      expect(fuelPriceService.EUROPEAN_COUNTRY_CODES).toContain('FR');
      expect(fuelPriceService.EUROPEAN_COUNTRY_CODES).toContain('AT');
      expect(fuelPriceService.EUROPEAN_COUNTRY_CODES).toContain('CH');
    });
  });
});
