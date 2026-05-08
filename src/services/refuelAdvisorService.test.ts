import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateMaxRange,
  calculateRefuelThreshold,
  suggestRefuelStops,
  acceptStop,
  rejectStop,
} from './refuelAdvisorService';
import { VehicleProfile } from '../models/vehicleProfile';
import { RouteSegment, Waypoint } from '../models/route';

// Mock dependencies
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('./routeService', () => ({
  getRoute: vi.fn(),
}));

vi.mock('./vehicleProfileService', () => ({
  getProfile: vi.fn(),
}));

vi.mock('./fuelPriceService', () => ({
  getPrice: vi.fn(),
}));

import { query, transaction } from '../utils/database';
import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice } from './fuelPriceService';

const mockQuery = vi.mocked(query);
const mockTransaction = vi.mocked(transaction);
const mockGetRoute = vi.mocked(getRoute);
const mockGetProfile = vi.mocked(getProfile);
const mockGetPrice = vi.mocked(getPrice);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const mockVehicle: VehicleProfile = {
  id: 'vehicle-1',
  user_id: 'user-1',
  name: 'My Car',
  vehicle_type: 'car',
  fuel_type: 'diesel',
  tank_capacity_liters: 60,
  consumption_per_100km: 6,
  created_at: new Date(),
  updated_at: new Date(),
};

function makeSegment(
  index: number,
  distanceKm: number,
  startWaypointId?: string,
  endWaypointId?: string
): RouteSegment {
  return {
    id: `seg-${index}`,
    route_id: 'route-1',
    segment_index: index,
    start_waypoint_id: startWaypointId ?? null,
    end_waypoint_id: endWaypointId ?? null,
    distance_km: distanceKm,
    duration_seconds: distanceKm * 60,
    country_code: 'DE',
    polyline_encoded: null,
  };
}

function makeWaypoint(id: string, position: number, lat: number, lng: number, type: 'origin' | 'stop' | 'destination' = 'stop'): Waypoint {
  return {
    id,
    route_id: 'route-1',
    position,
    label: `Waypoint ${position}`,
    latitude: lat,
    longitude: lng,
    place_id: null,
    formatted_address: null,
    waypoint_type: type,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calculateMaxRange', () => {
  it('calculates max range correctly for standard car', () => {
    // 60L tank / 6 L/100km * 100 = 1000 km
    const range = calculateMaxRange(mockVehicle);
    expect(range).toBe(1000);
  });

  it('calculates max range for a motorcycle', () => {
    const motorcycle: VehicleProfile = {
      ...mockVehicle,
      vehicle_type: 'motorcycle',
      tank_capacity_liters: 20,
      consumption_per_100km: 4,
    };
    // 20L / 4 L/100km * 100 = 500 km
    expect(calculateMaxRange(motorcycle)).toBe(500);
  });

  it('calculates max range for a camper with high consumption', () => {
    const camper: VehicleProfile = {
      ...mockVehicle,
      vehicle_type: 'camper',
      tank_capacity_liters: 100,
      consumption_per_100km: 12,
    };
    // 100L / 12 L/100km * 100 = 833.33... km
    expect(calculateMaxRange(camper)).toBeCloseTo(833.33, 2);
  });

  it('handles minimum valid values', () => {
    const minimal: VehicleProfile = {
      ...mockVehicle,
      tank_capacity_liters: 5,
      consumption_per_100km: 50,
    };
    // 5L / 50 L/100km * 100 = 10 km
    expect(calculateMaxRange(minimal)).toBe(10);
  });

  it('handles maximum valid values', () => {
    const maximal: VehicleProfile = {
      ...mockVehicle,
      tank_capacity_liters: 200,
      consumption_per_100km: 1,
    };
    // 200L / 1 L/100km * 100 = 20000 km
    expect(calculateMaxRange(maximal)).toBe(20000);
  });
});

describe('calculateRefuelThreshold', () => {
  it('returns 85% of max range', () => {
    // Max range = 1000 km, threshold = 850 km
    const threshold = calculateRefuelThreshold(mockVehicle);
    expect(threshold).toBe(850);
  });

  it('ensures refuel happens before 15% remaining', () => {
    const maxRange = calculateMaxRange(mockVehicle);
    const threshold = calculateRefuelThreshold(mockVehicle);
    // Remaining range at threshold = maxRange - threshold = 150 km
    // 15% of max range = 150 km
    expect(maxRange - threshold).toBe(maxRange * 0.15);
  });
});

describe('suggestRefuelStops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 404 when route is not found', async () => {
    mockGetRoute.mockResolvedValueOnce(null);

    await expect(suggestRefuelStops('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Route not found',
    });
  });

  it('throws 400 when route has no segments', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [],
    });

    await expect(suggestRefuelStops('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 404 when vehicle profile is not found', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin')],
      segments: [makeSegment(0, 100)],
    });
    mockGetProfile.mockResolvedValueOnce(null);

    await expect(suggestRefuelStops('route-1', 'vehicle-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vehicle profile not found',
    });
  });

  it('returns no suggestions for a short route within range', async () => {
    // Max range = 1000km, threshold = 850km
    // Route is only 500km — no refuel needed
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 49.0, 12.0, 'destination'),
    ];
    const segments = [makeSegment(0, 500, 'wp-1', 'wp-2')];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');
    expect(suggestions).toHaveLength(0);
  });

  it('suggests a refuel stop when distance exceeds threshold', async () => {
    // Max range = 1000km, threshold = 850km
    // Route has segments totaling 900km — should trigger a suggestion
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 50.0, 13.0, 'destination'),
    ];
    const segments = [
      makeSegment(0, 500, 'wp-1', 'wp-2'),
      makeSegment(1, 400, 'wp-1', 'wp-2'),
    ];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    // Mock the station search — findStationsNearPoint uses query directly
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'station-1',
          name: 'Shell Station',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel', 'petrol_95'],
          distance_from_route_km: '1.2',
        },
        {
          id: 'station-2',
          name: 'Aral Station',
          latitude: '49.6',
          longitude: '12.6',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '1.8',
        },
      ],
      rowCount: 2,
    } as any);

    // Mock fuel price lookups for enrichment
    mockGetPrice.mockResolvedValue({
      country_code: 'DE',
      fuel_type: 'diesel',
      price_per_liter_eur: 1.45,
      source: 'cieloweb',
      fetched_at: new Date(),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].station).toBeDefined();
    expect(suggestions[0].reason).toBe('range_warning');
    expect(suggestions[0].distanceFromStart).toBe(900);
    expect(suggestions[0].expandedSearch).toBe(false);
    expect(suggestions[0].searchRadiusKm).toBe(2);
  });

  it('expands search radius when no stations found within 2km', async () => {
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 50.0, 13.0, 'destination'),
    ];
    const segments = [makeSegment(0, 900, 'wp-1', 'wp-2')];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    // First search (2km) — no results
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Second search (5km) — found stations
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'station-3',
          name: 'BP Station',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '4.2',
        },
      ],
      rowCount: 1,
    } as any);

    mockGetPrice.mockResolvedValue({
      country_code: 'DE',
      fuel_type: 'diesel',
      price_per_liter_eur: 1.55,
      source: 'cieloweb',
      fetched_at: new Date(),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].searchRadiusKm).toBe(5);
    expect(suggestions[0].expandedSearch).toBe(false); // 5km is not > 5
  });

  it('marks expandedSearch true when search radius exceeds 5km', async () => {
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 50.0, 13.0, 'destination'),
    ];
    const segments = [makeSegment(0, 900, 'wp-1', 'wp-2')];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    // First search (2km) — no results
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Second search (5km) — no results
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Third search (10km) — found stations
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'station-4',
          name: 'Total Station',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '8.5',
        },
      ],
      rowCount: 1,
    } as any);

    mockGetPrice.mockResolvedValue({
      country_code: 'DE',
      fuel_type: 'diesel',
      price_per_liter_eur: 1.60,
      source: 'cieloweb',
      fetched_at: new Date(),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].searchRadiusKm).toBe(10);
    expect(suggestions[0].expandedSearch).toBe(true);
  });

  it('ranks stations by fuel price (lowest first)', async () => {
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 50.0, 13.0, 'destination'),
    ];
    const segments = [makeSegment(0, 900, 'wp-1', 'wp-2')];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    // Stations found within 2km
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'station-expensive',
          name: 'Expensive Station',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '0.5',
        },
        {
          id: 'station-cheap',
          name: 'Cheap Station',
          latitude: '49.6',
          longitude: '12.6',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '1.5',
        },
        {
          id: 'station-mid',
          name: 'Mid Station',
          latitude: '49.7',
          longitude: '12.7',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '1.0',
        },
      ],
      rowCount: 3,
    } as any);

    // Return different prices for each station's country
    let callCount = 0;
    mockGetPrice.mockImplementation(async () => {
      callCount++;
      const prices = [1.80, 1.30, 1.55]; // expensive, cheap, mid
      return {
        country_code: 'DE',
        fuel_type: 'diesel',
        price_per_liter_eur: prices[(callCount - 1) % 3],
        source: 'cieloweb',
        fetched_at: new Date(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };
    });

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');

    expect(suggestions).toHaveLength(1);
    // Cheapest station should be first
    expect(suggestions[0].station.fuel_price_eur).toBe(1.30);
    // Alternatives should be sorted by price
    expect(suggestions[0].alternatives.length).toBeGreaterThan(0);
    expect(suggestions[0].alternatives[0].fuel_price_eur).toBe(1.55);
  });

  it('suggests multiple stops for very long routes', async () => {
    // Max range = 1000km, threshold = 850km
    // Route is 2000km — should suggest 2 stops
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 52.0, 15.0, 'destination'),
    ];
    const segments = [
      makeSegment(0, 500, 'wp-1', 'wp-2'),
      makeSegment(1, 400, 'wp-1', 'wp-2'), // cumulative: 900 → trigger
      makeSegment(2, 500, 'wp-1', 'wp-2'),
      makeSegment(3, 400, 'wp-1', 'wp-2'), // cumulative since last: 900 → trigger
      makeSegment(4, 200, 'wp-1', 'wp-2'),
    ];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments,
    });
    mockGetProfile.mockResolvedValueOnce(mockVehicle);

    // Mock station searches for both trigger points
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'station-a',
          name: 'Station A',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '1.0',
        },
      ],
      rowCount: 1,
    } as any);

    mockGetPrice.mockResolvedValue({
      country_code: 'DE',
      fuel_type: 'diesel',
      price_per_liter_eur: 1.50,
      source: 'cieloweb',
      fetched_at: new Date(),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    const suggestions = await suggestRefuelStops('route-1', 'vehicle-1');

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].distanceFromStart).toBe(900);
    expect(suggestions[1].distanceFromStart).toBe(1800);
  });
});

describe('acceptStop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 404 when route is not found', async () => {
    mockGetRoute.mockResolvedValueOnce(null);

    await expect(acceptStop('route-1', 'station-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Route not found',
    });
  });

  it('throws 404 when station is not found', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin')],
      segments: [],
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(acceptStop('route-1', 'station-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Fuel station not found',
    });
  });

  it('adds station as waypoint and records refuel stop', async () => {
    const waypoints = [
      makeWaypoint('wp-1', 0, 48.0, 11.0, 'origin'),
      makeWaypoint('wp-2', 1, 50.0, 13.0, 'destination'),
    ];

    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints,
      segments: [makeSegment(0, 500)],
    });

    // Station lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'station-1',
        name: 'Shell Station',
        latitude: 49.5,
        longitude: 12.5,
        country_code: 'DE',
        place_id: 'place-123',
        fuel_types_available: ['diesel'],
        fuel_price_eur: 1.45,
      }],
      rowCount: 1,
    } as any);

    const mockRefuelStop = {
      id: 'refuel-1',
      route_id: 'route-1',
      fuel_station_id: 'station-1',
      position_in_route: 1,
      fuel_price_eur: 1.45,
      status: 'accepted',
      created_at: new Date(),
    };

    mockTransaction.mockImplementationOnce(async (callback) => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // shift waypoints
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // insert waypoint
          .mockResolvedValueOnce({ rows: [mockRefuelStop], rowCount: 1 }) // insert refuel stop
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }), // update route status
      };
      return callback(mockClient as any);
    });

    const result = await acceptStop('route-1', 'station-1');

    expect(result).toEqual(mockRefuelStop);
    expect(mockTransaction).toHaveBeenCalled();
  });
});

describe('rejectStop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 404 when route is not found', async () => {
    mockGetRoute.mockResolvedValueOnce(null);

    await expect(rejectStop('route-1', 'station-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Route not found',
    });
  });

  it('returns null when rejected station is not found', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [],
    });

    // Record rejection
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Station lookup — not found
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await rejectStop('route-1', 'station-1');
    expect(result).toBeNull();
  });

  it('returns next-best alternative after rejection', async () => {
    mockGetRoute.mockResolvedValueOnce({
      route: { id: 'route-1', user_id: 'user-1' } as any,
      waypoints: [],
      segments: [],
    });

    // Record rejection
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Get rejected station location
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'station-1',
        name: 'Rejected Station',
        latitude: '49.5',
        longitude: '12.5',
        country_code: 'DE',
        place_id: null,
        fuel_types_available: ['diesel'],
      }],
      rowCount: 1,
    } as any);

    // Find alternatives (2km search)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'station-1',
          name: 'Rejected Station',
          latitude: '49.5',
          longitude: '12.5',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '0.5',
        },
        {
          id: 'station-2',
          name: 'Alternative Station',
          latitude: '49.6',
          longitude: '12.6',
          country_code: 'DE',
          place_id: null,
          fuel_types_available: ['diesel'],
          distance_from_route_km: '1.5',
        },
      ],
      rowCount: 2,
    } as any);

    // Get rejected station IDs
    mockQuery.mockResolvedValueOnce({
      rows: [{ fuel_station_id: 'station-1' }],
      rowCount: 1,
    } as any);

    const result = await rejectStop('route-1', 'station-1');

    expect(result).not.toBeNull();
    expect(result!.station.id).toBe('station-2');
    expect(result!.station.name).toBe('Alternative Station');
  });
});
