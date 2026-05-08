import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTollsForRoute,
  parseTollResponse,
  parsePrice,
  categorizeToll,
} from './tollService';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('tollService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('categorizeToll', () => {
    it('should categorize names containing "bridge" as bridge', () => {
      expect(categorizeToll('Øresund Bridge')).toBe('bridge');
      expect(categorizeToll('Golden Gate Bridge Toll')).toBe('bridge');
    });

    it('should categorize names containing "tunnel" as bridge', () => {
      expect(categorizeToll('Mont Blanc Tunnel')).toBe('bridge');
    });

    it('should categorize names containing "crossing" as bridge', () => {
      expect(categorizeToll('Dartford Crossing')).toBe('bridge');
    });

    it('should categorize other names as highway', () => {
      expect(categorizeToll('Toll segment 1 (EUR)')).toBe('highway');
      expect(categorizeToll('Autostrada A1')).toBe('highway');
      expect(categorizeToll('Route toll (EUR)')).toBe('highway');
    });

    it('should be case-insensitive', () => {
      expect(categorizeToll('BRIDGE TOLL')).toBe('bridge');
      expect(categorizeToll('Channel TUNNEL')).toBe('bridge');
    });
  });

  describe('parsePrice', () => {
    it('should parse units and nanos correctly', () => {
      expect(parsePrice('5', 500000000)).toBe(5.5);
    });

    it('should handle units only (no nanos)', () => {
      expect(parsePrice('12', undefined)).toBe(12);
    });

    it('should handle zero units with nanos', () => {
      expect(parsePrice('0', 300000000)).toBe(0.3);
    });

    it('should handle empty string units', () => {
      expect(parsePrice('', 500000000)).toBe(0.5);
    });

    it('should round to 2 decimal places', () => {
      expect(parsePrice('1', 333333333)).toBe(1.33);
    });
  });

  describe('parseTollResponse', () => {
    it('should return empty array for null/undefined input', () => {
      expect(parseTollResponse(null)).toEqual([]);
      expect(parseTollResponse(undefined)).toEqual([]);
    });

    it('should return empty array for non-object input', () => {
      expect(parseTollResponse('string')).toEqual([]);
      expect(parseTollResponse(123)).toEqual([]);
    });

    it('should return empty array when routes is empty', () => {
      expect(parseTollResponse({ routes: [] })).toEqual([]);
    });

    it('should parse per-leg toll entries', () => {
      const response = {
        routes: [
          {
            legs: [
              {
                travelAdvisory: {
                  tollInfo: {
                    estimatedPrice: [
                      { currencyCode: 'EUR', units: '5', nanos: 500000000 },
                    ],
                  },
                },
              },
              {
                travelAdvisory: {
                  tollInfo: {
                    estimatedPrice: [
                      { currencyCode: 'EUR', units: '3', nanos: 0 },
                    ],
                  },
                },
              },
            ],
          },
        ],
      };

      const result = parseTollResponse(response);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Toll segment 1 (EUR)',
        costEur: 5.5,
        category: 'highway',
      });
      expect(result[1]).toEqual({
        name: 'Toll segment 2 (EUR)',
        costEur: 3,
        category: 'highway',
      });
    });

    it('should fall back to route-level toll info when no per-leg tolls', () => {
      const response = {
        routes: [
          {
            legs: [],
            travelAdvisory: {
              tollInfo: {
                estimatedPrice: [
                  { currencyCode: 'EUR', units: '12', nanos: 300000000 },
                ],
              },
            },
          },
        ],
      };

      const result = parseTollResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Route toll (EUR)',
        costEur: 12.3,
        category: 'highway',
      });
    });

    it('should return empty array when no toll info exists', () => {
      const response = {
        routes: [
          {
            legs: [{ travelAdvisory: {} }],
            travelAdvisory: {},
          },
        ],
      };

      const result = parseTollResponse(response);
      expect(result).toEqual([]);
    });
  });

  describe('getTollsForRoute', () => {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 52.52, longitude: 13.405 };

    it('should return null when GOOGLE_MAPS_API_KEY is not set', async () => {
      vi.stubEnv('GOOGLE_MAPS_API_KEY', '');

      const result = await getTollsForRoute(origin, destination);
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should successfully retrieve and parse toll data', async () => {
      const apiResponse = {
        routes: [
          {
            legs: [
              {
                travelAdvisory: {
                  tollInfo: {
                    estimatedPrice: [
                      { currencyCode: 'EUR', units: '7', nanos: 200000000 },
                    ],
                  },
                },
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await getTollsForRoute(origin, destination);

      expect(result).not.toBeNull();
      expect(result!.highwayTolls).toHaveLength(1);
      expect(result!.highwayTolls[0]).toEqual({
        segment: 'Toll segment 1 (EUR)',
        cost: 7.2,
      });
      expect(result!.bridgeTolls).toHaveLength(0);
    });

    it('should return null on API error (non-ok response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getTollsForRoute(origin, destination);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getTollsForRoute(origin, destination);
      expect(result).toBeNull();
    });

    it('should return null on timeout (abort signal)', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      const result = await getTollsForRoute(origin, destination);
      expect(result).toBeNull();
    });

    it('should return empty arrays when API returns no toll data', async () => {
      const apiResponse = {
        routes: [
          {
            legs: [{ travelAdvisory: {} }],
            travelAdvisory: {},
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await getTollsForRoute(origin, destination);

      expect(result).not.toBeNull();
      expect(result!.bridgeTolls).toEqual([]);
      expect(result!.highwayTolls).toEqual([]);
    });

    it('should call the correct API endpoint with proper headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ routes: [] }),
      });

      await getTollsForRoute(origin, destination);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': 'test-api-key',
            'X-Goog-FieldMask':
              'routes.legs.travelAdvisory.tollInfo,routes.travelAdvisory.tollInfo',
          }),
        })
      );
    });

    it('should include waypoints as intermediates in the request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ routes: [] }),
      });

      const waypoints = [{ latitude: 50.0, longitude: 8.0 }];
      await getTollsForRoute(origin, destination, waypoints);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.intermediates).toEqual([
        { location: { latLng: { latitude: 50.0, longitude: 8.0 } } },
      ]);
      expect(body.extraComputations).toEqual(['TOLLS']);
      expect(body.travelMode).toBe('DRIVE');
    });

    it('should pass an AbortSignal for timeout handling', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ routes: [] }),
      });

      await getTollsForRoute(origin, destination);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
