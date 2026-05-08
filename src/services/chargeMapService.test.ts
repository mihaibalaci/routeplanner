import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchChargingStations, isApiAvailable } from './chargeMapService';

describe('chargeMapService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('CHARGEMAP_API_URL', 'https://api.chargemap.com/v1');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  const sampleBbox = { north: 48.9, south: 48.8, east: 2.4, west: 2.3 };

  describe('fetchChargingStations', () => {
    it('returns parsed stations on successful API response', async () => {
      const mockStations = [
        {
          id: 'station-1',
          name: 'Station Alpha',
          latitude: 48.85,
          longitude: 2.35,
          connectorTypes: ['Type2', 'CCS'],
          availability: 'available',
        },
        {
          id: 'station-2',
          name: 'Station Beta',
          latitude: 48.86,
          longitude: 2.36,
          connector_types: ['CHAdeMO'],
          availability: 'occupied',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStations),
      });

      const result = await fetchChargingStations(sampleBbox);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'station-1',
        name: 'Station Alpha',
        latitude: 48.85,
        longitude: 2.35,
        connectorTypes: ['Type2', 'CCS'],
        availability: 'available',
      });
      expect(result[1]).toEqual({
        id: 'station-2',
        name: 'Station Beta',
        latitude: 48.86,
        longitude: 2.36,
        connectorTypes: ['CHAdeMO'],
        availability: 'occupied',
      });
    });

    it('returns empty array when API returns non-OK status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      });

      const result = await fetchChargingStations(sampleBbox);

      expect(result).toEqual([]);
    });

    it('returns empty array when network error occurs', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchChargingStations(sampleBbox);

      expect(result).toEqual([]);
    });

    it('returns empty array when response is not valid JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      const result = await fetchChargingStations(sampleBbox);

      expect(result).toEqual([]);
    });

    it('returns empty array when response is not an array', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ stations: [] }),
      });

      const result = await fetchChargingStations(sampleBbox);

      expect(result).toEqual([]);
    });
  });

  describe('isApiAvailable', () => {
    it('returns true when API responds with OK status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      const result = await isApiAvailable();

      expect(result).toBe(true);
    });

    it('returns false when API responds with non-OK status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const result = await isApiAvailable();

      expect(result).toBe(false);
    });

    it('returns false when network error occurs', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await isApiAvailable();

      expect(result).toBe(false);
    });
  });
});
