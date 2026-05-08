/**
 * Unit tests for GoogleMapsService.
 * Uses mocked Google Maps API responses.
 *
 * Validates: Requirements 1.1, 1.2, 1.7, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Status } from '@googlemaps/google-maps-services-js';
import {
  GoogleMapsService,
  GoogleMapsServiceError,
} from './googleMapsService';

// Mock the Google Maps client
function createMockClient() {
  return {
    geocode: vi.fn(),
    directions: vi.fn(),
    reverseGeocode: vi.fn(),
  };
}

describe('GoogleMapsService', () => {
  let service: GoogleMapsService;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    service = new GoogleMapsService(mockClient as never, 'test-api-key');
  });

  describe('geocode', () => {
    it('should return geocoding result for a valid address', async () => {
      mockClient.geocode.mockResolvedValue({
        data: {
          status: Status.OK,
          results: [
            {
              geometry: { location: { lat: 48.8566, lng: 2.3522 } },
              place_id: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
              formatted_address: 'Paris, France',
            },
          ],
        },
      });

      const result = await service.geocode('Paris, France');

      expect(result).toEqual({
        latitude: 48.8566,
        longitude: 2.3522,
        place_id: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
        formatted_address: 'Paris, France',
      });
    });

    it('should throw error for empty address', async () => {
      await expect(service.geocode('')).rejects.toThrow(
        GoogleMapsServiceError
      );
      await expect(service.geocode('  ')).rejects.toThrow(
        'Address cannot be empty'
      );
    });

    it('should throw error when geocoding returns no results (Requirement 1.7)', async () => {
      mockClient.geocode.mockResolvedValue({
        data: {
          status: Status.ZERO_RESULTS,
          results: [],
        },
      });

      await expect(service.geocode('xyznonexistent123')).rejects.toThrow(
        GoogleMapsServiceError
      );
      await expect(service.geocode('xyznonexistent123')).rejects.toThrow(
        'Could not find location'
      );
    });

    it('should throw error when API call fails', async () => {
      mockClient.geocode.mockRejectedValue(new Error('Network error'));

      await expect(service.geocode('Paris')).rejects.toThrow(
        GoogleMapsServiceError
      );
      await expect(service.geocode('Paris')).rejects.toThrow(
        'Geocoding failed'
      );
    });

    it('should retain descriptive error code on failure', async () => {
      mockClient.geocode.mockResolvedValue({
        data: {
          status: Status.ZERO_RESULTS,
          results: [],
        },
      });

      try {
        await service.geocode('nowhere');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GoogleMapsServiceError);
        expect((error as GoogleMapsServiceError).code).toBe(
          'GEOCODING_FAILED'
        );
      }
    });
  });

  describe('getDirections', () => {
    const origin = { latitude: 48.8566, longitude: 2.3522 };
    const destination = { latitude: 52.52, longitude: 13.405 };

    it('should return routes for valid origin and destination (Requirement 4.1, 4.2)', async () => {
      mockClient.directions.mockResolvedValue({
        data: {
          status: Status.OK,
          routes: [
            {
              legs: [
                {
                  distance: { value: 1050000 },
                  duration: { value: 36000 },
                  end_address: 'Berlin, Germany',
                  steps: [{ polyline: { points: 'abc123' } }],
                },
              ],
              overview_polyline: { points: 'overview123' },
            },
          ],
        },
      });

      const routes = await service.getDirections({ origin, destination });

      expect(routes).toHaveLength(1);
      expect(routes[0].legs[0].distance?.value).toBe(1050000);
    });

    it('should use driving mode (Requirement 4.2)', async () => {
      mockClient.directions.mockResolvedValue({
        data: {
          status: Status.OK,
          routes: [
            {
              legs: [
                {
                  distance: { value: 500000 },
                  duration: { value: 18000 },
                  end_address: 'Munich, Germany',
                  steps: [],
                },
              ],
              overview_polyline: { points: '' },
            },
          ],
        },
      });

      await service.getDirections({ origin, destination });

      expect(mockClient.directions).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            mode: 'driving',
          }),
        })
      );
    });

    it('should support waypoints (intermediate stops)', async () => {
      const waypoints = [{ latitude: 50.0755, longitude: 14.4378 }];

      mockClient.directions.mockResolvedValue({
        data: {
          status: Status.OK,
          routes: [
            {
              legs: [
                {
                  distance: { value: 350000 },
                  duration: { value: 12000 },
                  end_address: 'Prague, Czech Republic',
                  steps: [],
                },
                {
                  distance: { value: 350000 },
                  duration: { value: 12000 },
                  end_address: 'Berlin, Germany',
                  steps: [],
                },
              ],
              overview_polyline: { points: '' },
            },
          ],
        },
      });

      const routes = await service.getDirections({
        origin,
        destination,
        waypoints,
      });

      expect(routes[0].legs).toHaveLength(2);
      expect(mockClient.directions).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            waypoints: [
              { lat: 50.0755, lng: 14.4378 },
            ],
          }),
        })
      );
    });

    it('should support alternatives parameter (Requirement 4.3)', async () => {
      mockClient.directions.mockResolvedValue({
        data: {
          status: Status.OK,
          routes: [
            {
              legs: [
                {
                  distance: { value: 1050000 },
                  duration: { value: 36000 },
                  end_address: 'Berlin, Germany',
                  steps: [],
                },
              ],
              overview_polyline: { points: '' },
            },
            {
              legs: [
                {
                  distance: { value: 1100000 },
                  duration: { value: 34000 },
                  end_address: 'Berlin, Germany',
                  steps: [],
                },
              ],
              overview_polyline: { points: '' },
            },
          ],
        },
      });

      const routes = await service.getDirections({
        origin,
        destination,
        alternatives: true,
      });

      expect(routes).toHaveLength(2);
      expect(mockClient.directions).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            alternatives: true,
          }),
        })
      );
    });

    it('should throw error when no route is found (Requirement 4.4)', async () => {
      mockClient.directions.mockResolvedValue({
        data: {
          status: Status.ZERO_RESULTS,
          routes: [],
        },
      });

      await expect(
        service.getDirections({ origin, destination })
      ).rejects.toThrow('Could not calculate route');
    });

    it('should throw error when API returns error status (Requirement 4.4)', async () => {
      mockClient.directions.mockRejectedValue(
        new Error('Request failed')
      );

      await expect(
        service.getDirections({ origin, destination })
      ).rejects.toThrow(GoogleMapsServiceError);
    });
  });

  describe('selectFastestRoute', () => {
    it('should return the fastest route by duration (Requirement 4.3)', () => {
      const routes = [
        {
          legs: [{ duration: { value: 36000 }, distance: { value: 1050000 } }],
          overview_polyline: { points: 'slow' },
        },
        {
          legs: [{ duration: { value: 34000 }, distance: { value: 1100000 } }],
          overview_polyline: { points: 'fast' },
        },
        {
          legs: [{ duration: { value: 38000 }, distance: { value: 950000 } }],
          overview_polyline: { points: 'slowest' },
        },
      ] as never;

      const fastest = service.selectFastestRoute(routes);
      expect(fastest.overview_polyline?.points).toBe('fast');
    });

    it('should return the only route when there is one', () => {
      const routes = [
        {
          legs: [{ duration: { value: 36000 }, distance: { value: 1050000 } }],
          overview_polyline: { points: 'only' },
        },
      ] as never;

      const fastest = service.selectFastestRoute(routes);
      expect(fastest.overview_polyline?.points).toBe('only');
    });

    it('should throw error when no routes available', () => {
      expect(() => service.selectFastestRoute([])).toThrow(
        'No routes available'
      );
    });

    it('should handle multi-leg routes (sum of leg durations)', () => {
      const routes = [
        {
          legs: [
            { duration: { value: 20000 }, distance: { value: 500000 } },
            { duration: { value: 20000 }, distance: { value: 500000 } },
          ],
          overview_polyline: { points: 'multi-slow' },
        },
        {
          legs: [
            { duration: { value: 15000 }, distance: { value: 600000 } },
            { duration: { value: 15000 }, distance: { value: 600000 } },
          ],
          overview_polyline: { points: 'multi-fast' },
        },
      ] as never;

      const fastest = service.selectFastestRoute(routes);
      expect(fastest.overview_polyline?.points).toBe('multi-fast');
    });
  });

  describe('parseRouteSegments', () => {
    it('should parse legs into RouteSegment objects with distance_km and duration_seconds (Requirement 4.5)', () => {
      const route = {
        legs: [
          {
            distance: { value: 350000 },
            duration: { value: 12600 },
            end_address: 'Prague, Czech Republic',
            steps: [{ polyline: { points: 'step1' } }],
          },
          {
            distance: { value: 280000 },
            duration: { value: 10800 },
            end_address: 'Berlin, Germany',
            steps: [{ polyline: { points: 'step2' } }],
          },
        ],
        overview_polyline: { points: 'overview_poly' },
      } as never;

      const result = service.parseRouteSegments(route, 'route-123');

      expect(result.segments).toHaveLength(2);

      // First segment: Paris -> Prague
      expect(result.segments[0].distance_km).toBe(350);
      expect(result.segments[0].duration_seconds).toBe(12600);
      expect(result.segments[0].country_code).toBe('CZ');
      expect(result.segments[0].segment_index).toBe(0);
      expect(result.segments[0].route_id).toBe('route-123');

      // Second segment: Prague -> Berlin
      expect(result.segments[1].distance_km).toBe(280);
      expect(result.segments[1].duration_seconds).toBe(10800);
      expect(result.segments[1].country_code).toBe('DE');
      expect(result.segments[1].segment_index).toBe(1);

      // Totals
      expect(result.total_distance_km).toBe(630);
      expect(result.total_duration_seconds).toBe(23400);
      expect(result.polyline_encoded).toBe('overview_poly');
    });

    it('should handle single-leg routes', () => {
      const route = {
        legs: [
          {
            distance: { value: 1050000 },
            duration: { value: 36000 },
            end_address: 'Berlin, Germany',
            steps: [{ polyline: { points: 'direct' } }],
          },
        ],
        overview_polyline: { points: 'direct_overview' },
      } as never;

      const result = service.parseRouteSegments(route, 'route-456');

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].distance_km).toBe(1050);
      expect(result.segments[0].duration_seconds).toBe(36000);
      expect(result.segments[0].country_code).toBe('DE');
      expect(result.total_distance_km).toBe(1050);
      expect(result.total_duration_seconds).toBe(36000);
    });

    it('should round distance_km to 2 decimal places', () => {
      const route = {
        legs: [
          {
            distance: { value: 123456 },
            duration: { value: 5000 },
            end_address: 'Vienna, Austria',
            steps: [],
          },
        ],
        overview_polyline: { points: '' },
      } as never;

      const result = service.parseRouteSegments(route, 'route-789');

      expect(result.segments[0].distance_km).toBe(123.46);
      expect(result.total_distance_km).toBe(123.46);
    });

    it('should fallback to XX for unknown country', () => {
      const route = {
        legs: [
          {
            distance: { value: 100000 },
            duration: { value: 3600 },
            end_address: 'Some Place, Unknown Country',
            steps: [],
          },
        ],
        overview_polyline: { points: '' },
      } as never;

      const result = service.parseRouteSegments(route, 'route-unknown');

      expect(result.segments[0].country_code).toBe('XX');
    });

    it('should handle empty end_address gracefully', () => {
      const route = {
        legs: [
          {
            distance: { value: 100000 },
            duration: { value: 3600 },
            end_address: '',
            steps: [],
          },
        ],
        overview_polyline: { points: '' },
      } as never;

      const result = service.parseRouteSegments(route, 'route-empty');

      expect(result.segments[0].country_code).toBe('XX');
    });
  });

  describe('extractCountryCode', () => {
    it('should extract country code from formatted address', () => {
      expect(service.extractCountryCode('Paris, France')).toBe('FR');
      expect(service.extractCountryCode('Berlin, Germany')).toBe('DE');
      expect(service.extractCountryCode('Vienna, Austria')).toBe('AT');
      expect(service.extractCountryCode('Prague, Czech Republic')).toBe('CZ');
      expect(service.extractCountryCode('Prague, Czechia')).toBe('CZ');
      expect(service.extractCountryCode('Bratislava, Slovakia')).toBe('SK');
      expect(service.extractCountryCode('Ljubljana, Slovenia')).toBe('SI');
      expect(service.extractCountryCode('Zurich, Switzerland')).toBe('CH');
      expect(service.extractCountryCode('Budapest, Hungary')).toBe('HU');
      expect(service.extractCountryCode('Bucharest, Romania')).toBe('RO');
      expect(service.extractCountryCode('Sofia, Bulgaria')).toBe('BG');
    });

    it('should return XX for unknown countries', () => {
      expect(service.extractCountryCode('Tokyo, Japan')).toBe('XX');
      expect(service.extractCountryCode('')).toBe('XX');
    });

    it('should handle multi-part addresses', () => {
      expect(
        service.extractCountryCode(
          '10 Rue de Rivoli, 75001 Paris, France'
        )
      ).toBe('FR');
      expect(
        service.extractCountryCode(
          'Alexanderplatz 1, 10178 Berlin, Germany'
        )
      ).toBe('DE');
    });
  });

  describe('reverseGeocodeCountry', () => {
    it('should return country code from reverse geocoding', async () => {
      mockClient.reverseGeocode.mockResolvedValue({
        data: {
          status: Status.OK,
          results: [
            {
              address_components: [
                { long_name: 'France', short_name: 'FR', types: ['country'] },
              ],
            },
          ],
        },
      });

      const code = await service.reverseGeocodeCountry({
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(code).toBe('FR');
    });

    it('should return XX when reverse geocoding fails', async () => {
      mockClient.reverseGeocode.mockResolvedValue({
        data: {
          status: Status.ZERO_RESULTS,
          results: [],
        },
      });

      const code = await service.reverseGeocodeCountry({
        latitude: 0,
        longitude: 0,
      });

      expect(code).toBe('XX');
    });

    it('should return XX on network error', async () => {
      mockClient.reverseGeocode.mockRejectedValue(
        new Error('Network error')
      );

      const code = await service.reverseGeocodeCountry({
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(code).toBe('XX');
    });
  });
});
