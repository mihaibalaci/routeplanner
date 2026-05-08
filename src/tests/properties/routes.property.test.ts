import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  autocomplete,
  setPlacesClient,
  EUROPEAN_COUNTRY_CODES,
  MIN_QUERY_LENGTH,
  IGooglePlacesClient,
  PlaceSuggestion,
} from '../../services/placesService';
import { GoogleMapsService } from '../../services/googleMapsService';
import { DirectionsRoute } from '@googlemaps/google-maps-services-js';

// ─── Property 5: Autocomplete Triggers Only After Minimum Characters ──────────
// **Validates: Requirements 3.1**
// Returns suggestions only for length >= 3.

describe('Property 5: Autocomplete Triggers Only After Minimum Characters', () => {
  let mockClient: IGooglePlacesClient;

  beforeEach(() => {
    mockClient = {
      autocomplete: vi.fn().mockResolvedValue([
        {
          placeId: 'place_1',
          description: 'Berlin, Germany',
          mainText: 'Berlin',
          secondaryText: 'Germany',
        },
      ]),
    };
    setPlacesClient(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty suggestions for queries shorter than MIN_QUERY_LENGTH', async () => {
    /**
     * **Validates: Requirements 3.1**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: MIN_QUERY_LENGTH - 1 }),
        async (shortQuery) => {
          const result = await autocomplete(shortQuery);
          expect(result.suggestions).toHaveLength(0);
          expect(mockClient.autocomplete).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('calls the API for queries with length >= MIN_QUERY_LENGTH', async () => {
    /**
     * **Validates: Requirements 3.1**
     */
    // Generate strings that have at least MIN_QUERY_LENGTH non-whitespace characters
    const validQueryArb = fc
      .stringOf(fc.char().filter((c) => c.trim().length > 0), {
        minLength: MIN_QUERY_LENGTH,
        maxLength: 20,
      })
      .filter((s) => s.trim().length >= MIN_QUERY_LENGTH);

    await fc.assert(
      fc.asyncProperty(validQueryArb, async (query) => {
        (mockClient.autocomplete as ReturnType<typeof vi.fn>).mockClear();
        const result = await autocomplete(query);
        expect(mockClient.autocomplete).toHaveBeenCalledTimes(1);
        expect(result.suggestions.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 6: Autocomplete Results Restricted to Europe ────────────────────
// **Validates: Requirements 3.3**
// All results have European country codes (restriction is enforced by passing
// EUROPEAN_COUNTRY_CODES to the client).

describe('Property 6: Autocomplete Results Restricted to Europe', () => {
  let mockClient: IGooglePlacesClient;
  let capturedCountries: string[] | null;

  beforeEach(() => {
    capturedCountries = null;
    mockClient = {
      autocomplete: vi.fn().mockImplementation(
        async (_query: string, countries: string[]): Promise<PlaceSuggestion[]> => {
          capturedCountries = countries;
          return [
            {
              placeId: 'place_1',
              description: 'Paris, France',
              mainText: 'Paris',
              secondaryText: 'France',
            },
          ];
        }
      ),
    };
    setPlacesClient(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes EUROPEAN_COUNTRY_CODES to the places client for any valid query', async () => {
    /**
     * **Validates: Requirements 3.3**
     */
    const validQueryArb = fc
      .stringOf(fc.char().filter((c) => c.trim().length > 0), {
        minLength: MIN_QUERY_LENGTH,
        maxLength: 30,
      })
      .filter((s) => s.trim().length >= MIN_QUERY_LENGTH);

    await fc.assert(
      fc.asyncProperty(validQueryArb, async (query) => {
        capturedCountries = null;
        await autocomplete(query);

        // The service must pass the European country codes to the client
        expect(capturedCountries).not.toBeNull();
        expect(capturedCountries).toEqual(EUROPEAN_COUNTRY_CODES);

        // Verify all codes are valid European country codes (lowercase, 2 chars)
        for (const code of capturedCountries!) {
          expect(code).toHaveLength(2);
          expect(code).toBe(code.toLowerCase());
          expect(EUROPEAN_COUNTRY_CODES).toContain(code);
        }
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 7: Route Segments Match Waypoint Count ──────────────────────────
// **Validates: Requirements 4.5**
// N waypoints produce N-1 segments with positive distance and duration.
// (A DirectionsRoute with N legs simulates N+1 waypoints → N segments)

describe('Property 7: Route Segments Match Waypoint Count', () => {
  it('N legs produce N segments each with positive distance_km and duration_seconds', () => {
    /**
     * **Validates: Requirements 4.5**
     */
    // Generate a number of legs (1 to 10), simulating 2 to 11 waypoints
    const legArb = fc.record({
      distance: fc.record({ value: fc.integer({ min: 100, max: 500000 }), text: fc.constant('') }),
      duration: fc.record({ value: fc.integer({ min: 60, max: 36000 }), text: fc.constant('') }),
      end_address: fc.constantFrom(
        'Berlin, Germany',
        'Vienna, Austria',
        'Prague, Czech Republic',
        'Budapest, Hungary',
        'Paris, France'
      ),
      start_address: fc.constant('Start Address'),
      steps: fc.constant([]),
      start_location: fc.constant({ lat: 48.8566, lng: 2.3522 }),
      end_location: fc.constant({ lat: 52.52, lng: 13.405 }),
      traffic_speed_entry: fc.constant([]),
      via_waypoint: fc.constant([]),
    });

    const routeArb = fc
      .array(legArb, { minLength: 1, maxLength: 10 })
      .map((legs) => ({
        legs,
        overview_polyline: { points: 'encodedPolyline' },
        summary: 'Test Route',
        warnings: [],
        waypoint_order: [],
        bounds: {
          northeast: { lat: 53, lng: 14 },
          southwest: { lat: 48, lng: 2 },
        },
        copyrights: '',
      }));

    fc.assert(
      fc.property(routeArb, (mockRoute) => {
        const service = new GoogleMapsService(undefined, 'fake-key');
        const result = service.parseRouteSegments(
          mockRoute as unknown as DirectionsRoute,
          'test-route-id'
        );

        const numLegs = mockRoute.legs.length;

        // N legs → N segments
        expect(result.segments).toHaveLength(numLegs);

        // Each segment has positive distance and duration
        for (const segment of result.segments) {
          expect(segment.distance_km).toBeGreaterThan(0);
          expect(segment.duration_seconds).toBeGreaterThan(0);
        }

        // Segment indices are sequential starting from 0
        for (let i = 0; i < result.segments.length; i++) {
          expect(result.segments[i].segment_index).toBe(i);
        }

        // Total distance and duration are positive
        expect(result.total_distance_km).toBeGreaterThan(0);
        expect(result.total_duration_seconds).toBeGreaterThan(0);

        // All segments reference the correct route_id
        for (const segment of result.segments) {
          expect(segment.route_id).toBe('test-route-id');
        }
      }),
      { numRuns: 10 }
    );
  });
});
