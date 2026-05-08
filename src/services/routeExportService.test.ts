import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mergeRefuelStopsIntoWaypoints,
  splitWaypoints,
  exportRoute,
  getAcceptedRefuelStops,
  RefuelStopWithStation,
} from './routeExportService';
import { Waypoint } from '../models/route';

// Mock dependencies
vi.mock('../utils/database', () => ({
  query: vi.fn(),
}));

vi.mock('./routeService', () => ({
  getRoute: vi.fn(),
}));

vi.mock('../exporters/index', () => ({
  getExporter: vi.fn(),
  isFormatSupported: vi.fn(),
  SUPPORTED_FORMATS: ['gpx', 'itn', 'asc', 'ov2', 'bcr', 'trk', 'mps', 'fit'],
}));

import { query } from '../utils/database';
import { getRoute } from './routeService';
import { getExporter, isFormatSupported } from '../exporters/index';

const mockQuery = vi.mocked(query);
const mockGetRoute = vi.mocked(getRoute);
const mockGetExporter = vi.mocked(getExporter);
const mockIsFormatSupported = vi.mocked(isFormatSupported);

function makeWaypoint(overrides: Partial<Waypoint> = {}): Waypoint {
  return {
    id: 'wp-1',
    route_id: 'route-1',
    position: 0,
    label: 'Test Waypoint',
    latitude: 48.2082,
    longitude: 16.3738,
    place_id: null,
    formatted_address: null,
    waypoint_type: 'stop',
    ...overrides,
  };
}

function makeRefuelStop(overrides: Partial<RefuelStopWithStation> = {}): RefuelStopWithStation {
  return {
    id: 'rs-1',
    route_id: 'route-1',
    fuel_station_id: 'fs-1',
    position_in_route: 0,
    fuel_price_eur: 1.45,
    status: 'accepted',
    station_name: 'Shell Station',
    station_latitude: 48.21,
    station_longitude: 16.38,
    ...overrides,
  };
}

describe('routeExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mergeRefuelStopsIntoWaypoints', () => {
    it('returns waypoints unchanged when no refuel stops', () => {
      const waypoints = [
        makeWaypoint({ id: 'wp-1', position: 0, waypoint_type: 'origin' }),
        makeWaypoint({ id: 'wp-2', position: 1, waypoint_type: 'destination' }),
      ];

      const result = mergeRefuelStopsIntoWaypoints(waypoints, []);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('wp-1');
      expect(result[1].id).toBe('wp-2');
    });

    it('inserts refuel stop after the waypoint at its position_in_route', () => {
      const waypoints = [
        makeWaypoint({ id: 'wp-1', position: 0, waypoint_type: 'origin' }),
        makeWaypoint({ id: 'wp-2', position: 1, waypoint_type: 'stop' }),
        makeWaypoint({ id: 'wp-3', position: 2, waypoint_type: 'destination' }),
      ];

      const refuelStops = [
        makeRefuelStop({ id: 'rs-1', position_in_route: 0, station_name: 'Shell' }),
      ];

      const result = mergeRefuelStopsIntoWaypoints(waypoints, refuelStops);
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('wp-1');
      expect(result[1].id).toBe('rs-1');
      expect(result[1].label).toBe('Shell');
      expect(result[2].id).toBe('wp-2');
      expect(result[3].id).toBe('wp-3');
    });

    it('inserts multiple refuel stops at different positions', () => {
      const waypoints = [
        makeWaypoint({ id: 'wp-1', position: 0, waypoint_type: 'origin' }),
        makeWaypoint({ id: 'wp-2', position: 1, waypoint_type: 'stop' }),
        makeWaypoint({ id: 'wp-3', position: 2, waypoint_type: 'destination' }),
      ];

      const refuelStops = [
        makeRefuelStop({ id: 'rs-1', position_in_route: 0, station_name: 'Shell' }),
        makeRefuelStop({ id: 'rs-2', position_in_route: 1, station_name: 'BP' }),
      ];

      const result = mergeRefuelStopsIntoWaypoints(waypoints, refuelStops);
      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('wp-1');
      expect(result[1].id).toBe('rs-1');
      expect(result[2].id).toBe('wp-2');
      expect(result[3].id).toBe('rs-2');
      expect(result[4].id).toBe('wp-3');
    });

    it('inserts multiple refuel stops at the same position', () => {
      const waypoints = [
        makeWaypoint({ id: 'wp-1', position: 0, waypoint_type: 'origin' }),
        makeWaypoint({ id: 'wp-2', position: 1, waypoint_type: 'destination' }),
      ];

      const refuelStops = [
        makeRefuelStop({ id: 'rs-1', position_in_route: 0, station_name: 'Shell' }),
        makeRefuelStop({ id: 'rs-2', position_in_route: 0, station_name: 'BP' }),
      ];

      const result = mergeRefuelStopsIntoWaypoints(waypoints, refuelStops);
      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('wp-1');
      expect(result[1].id).toBe('rs-1');
      expect(result[2].id).toBe('rs-2');
      expect(result[3].id).toBe('wp-2');
    });

    it('refuel stop waypoints have correct coordinates from station', () => {
      const waypoints = [
        makeWaypoint({ id: 'wp-1', position: 0 }),
      ];

      const refuelStops = [
        makeRefuelStop({
          id: 'rs-1',
          position_in_route: 0,
          station_latitude: 50.123,
          station_longitude: 14.456,
        }),
      ];

      const result = mergeRefuelStopsIntoWaypoints(waypoints, refuelStops);
      expect(result[1].latitude).toBe(50.123);
      expect(result[1].longitude).toBe(14.456);
      expect(result[1].waypoint_type).toBe('stop');
    });
  });

  describe('splitWaypoints', () => {
    it('returns single chunk when waypoints fit within limit', () => {
      const waypoints = Array.from({ length: 5 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i })
      );

      const result = splitWaypoints(waypoints, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(5);
    });

    it('returns single chunk when waypoints equal the limit', () => {
      const waypoints = Array.from({ length: 10 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i })
      );

      const result = splitWaypoints(waypoints, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(10);
    });

    it('splits waypoints into multiple chunks with overlap', () => {
      const waypoints = Array.from({ length: 10 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i })
      );

      const result = splitWaypoints(waypoints, 6);
      expect(result).toHaveLength(2);
      // First chunk: wp-0 through wp-5 (6 waypoints)
      expect(result[0]).toHaveLength(6);
      // Second chunk: wp-5 through wp-9 (5 waypoints, starts with overlap)
      expect(result[1]).toHaveLength(5);
      // Overlap: last of first chunk = first of second chunk
      expect(result[0][5].id).toBe(result[1][0].id);
    });

    it('handles three-way split correctly', () => {
      const waypoints = Array.from({ length: 15 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i })
      );

      const result = splitWaypoints(waypoints, 6);
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveLength(6);
      expect(result[1]).toHaveLength(6);
      expect(result[2]).toHaveLength(5);
      // Overlaps
      expect(result[0][5].id).toBe(result[1][0].id);
      expect(result[1][5].id).toBe(result[2][0].id);
    });

    it('all original waypoints are covered in split chunks', () => {
      const waypoints = Array.from({ length: 20 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i })
      );

      const chunks = splitWaypoints(waypoints, 5);

      // Collect all unique waypoint IDs from chunks
      const allIds = new Set<string>();
      for (const chunk of chunks) {
        for (const wp of chunk) {
          allIds.add(wp.id);
        }
      }

      // All original waypoints should be present
      for (const wp of waypoints) {
        expect(allIds.has(wp.id)).toBe(true);
      }
    });

    it('throws error when maxWaypoints is 1 or less', () => {
      const waypoints = [makeWaypoint()];
      expect(() => splitWaypoints(waypoints, 1)).toThrow('maxWaypoints must be greater than 1');
      expect(() => splitWaypoints(waypoints, 0)).toThrow('maxWaypoints must be greater than 1');
    });
  });

  describe('getAcceptedRefuelStops', () => {
    it('queries database for accepted refuel stops joined with fuel stations', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'rs-1',
            route_id: 'route-1',
            fuel_station_id: 'fs-1',
            position_in_route: 1,
            fuel_price_eur: 1.45,
            status: 'accepted',
            station_name: 'Shell',
            station_latitude: 48.21,
            station_longitude: 16.38,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const result = await getAcceptedRefuelStops('route-1');
      expect(result).toHaveLength(1);
      expect(result[0].station_name).toBe('Shell');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('refuel_stops'),
        ['route-1']
      );
    });
  });

  describe('exportRoute', () => {
    const mockRoute = {
      route: {
        id: 'route-1',
        user_id: 'user-1',
        name: 'Test Route',
        total_distance_km: 500,
        total_duration_seconds: 18000,
        polyline_encoded: null,
        status: 'calculated' as const,
        created_at: new Date(),
        updated_at: new Date(),
      },
      waypoints: [
        makeWaypoint({ id: 'wp-1', position: 0, waypoint_type: 'origin' }),
        makeWaypoint({ id: 'wp-2', position: 1, waypoint_type: 'stop' }),
        makeWaypoint({ id: 'wp-3', position: 2, waypoint_type: 'destination' }),
      ],
      segments: [],
    };

    it('exports route without splitting when within limit', async () => {
      mockIsFormatSupported.mockReturnValue(true);
      mockGetRoute.mockResolvedValue(mockRoute);
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as any);
      mockGetExporter.mockReturnValue({
        format: 'gpx',
        maxWaypoints: null,
        export: vi.fn().mockReturnValue(Buffer.from('<gpx></gpx>')),
        validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      });

      const result = await exportRoute('route-1', 'gpx');
      expect(result.files).toHaveLength(1);
      expect(result.split).toBe(false);
      expect(result.splitCount).toBe(1);
      expect(result.format).toBe('gpx');
    });

    it('splits files when waypoints exceed format limit', async () => {
      const manyWaypoints = Array.from({ length: 50 }, (_, i) =>
        makeWaypoint({ id: `wp-${i}`, position: i, waypoint_type: i === 0 ? 'origin' : i === 49 ? 'destination' : 'stop' })
      );

      mockIsFormatSupported.mockReturnValue(true);
      mockGetRoute.mockResolvedValue({ ...mockRoute, waypoints: manyWaypoints });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as any);

      const mockExportFn = vi.fn().mockReturnValue(Buffer.from('data'));
      mockGetExporter.mockReturnValue({
        format: 'itn',
        maxWaypoints: 48,
        export: mockExportFn,
        validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      });

      const result = await exportRoute('route-1', 'itn');
      expect(result.split).toBe(true);
      expect(result.splitCount).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(mockExportFn).toHaveBeenCalledTimes(2);
    });

    it('includes accepted refuel stops in export', async () => {
      mockIsFormatSupported.mockReturnValue(true);
      mockGetRoute.mockResolvedValue(mockRoute);
      mockQuery.mockResolvedValue({
        rows: [
          makeRefuelStop({ id: 'rs-1', position_in_route: 0, station_name: 'Shell' }),
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const mockExportFn = vi.fn().mockReturnValue(Buffer.from('data'));
      mockGetExporter.mockReturnValue({
        format: 'gpx',
        maxWaypoints: null,
        export: mockExportFn,
        validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      });

      await exportRoute('route-1', 'gpx');

      // The export function should be called with 4 waypoints (3 original + 1 refuel stop)
      const exportCall = mockExportFn.mock.calls[0];
      expect(exportCall[1]).toHaveLength(4);
    });

    it('throws 400 for unsupported format', async () => {
      mockIsFormatSupported.mockReturnValue(false);

      await expect(exportRoute('route-1', 'xyz' as any)).rejects.toMatchObject({
        message: expect.stringContaining('Unsupported export format'),
        statusCode: 400,
      });
    });

    it('throws 404 when route not found', async () => {
      mockIsFormatSupported.mockReturnValue(true);
      mockGetRoute.mockResolvedValue(null);

      await expect(exportRoute('nonexistent', 'gpx')).rejects.toMatchObject({
        message: 'Route not found',
        statusCode: 404,
      });
    });
  });
});
