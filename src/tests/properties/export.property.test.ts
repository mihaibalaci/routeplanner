import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Waypoint, Route } from '../../models/route';
import { GpxExporter } from '../../exporters/GpxExporter';
import { splitWaypoints } from '../../services/routeExportService';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a valid latitude in European range */
const latitudeArb = fc.double({ min: 35, max: 71, noNaN: true, noDefaultInfinity: true });

/** Generate a valid longitude in European range */
const longitudeArb = fc.double({ min: -10, max: 40, noNaN: true, noDefaultInfinity: true });

/** Generate a single waypoint with valid coordinates */
const waypointArb = (index: number, routeId: string): fc.Arbitrary<Waypoint> =>
  fc.record({
    id: fc.constant(`wp-${index}`),
    route_id: fc.constant(routeId),
    position: fc.constant(index),
    label: fc.constant(`Waypoint ${index}`),
    latitude: latitudeArb,
    longitude: longitudeArb,
    place_id: fc.constant(null),
    formatted_address: fc.constant(null),
    waypoint_type: fc.constant(index === 0 ? 'origin' : 'stop' as const),
  });

/** Generate a list of 2-8 waypoints for Property 18 */
const waypointListArb = (minLen: number, maxLen: number): fc.Arbitrary<Waypoint[]> =>
  fc.integer({ min: minLen, max: maxLen }).chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, i) => waypointArb(i, 'route-1'))
    ).map((wps) => {
      // Set first as origin, last as destination
      const waypoints = wps as Waypoint[];
      waypoints[0] = { ...waypoints[0], waypoint_type: 'origin' };
      waypoints[waypoints.length - 1] = {
        ...waypoints[waypoints.length - 1],
        waypoint_type: 'destination',
      };
      return waypoints;
    })
  );

/** Generate a larger list of waypoints for splitting tests */
const largeWaypointListArb = (minLen: number, maxLen: number): fc.Arbitrary<Waypoint[]> =>
  fc.integer({ min: minLen, max: maxLen }).chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, i) => waypointArb(i, 'route-1'))
    ).map((wps) => {
      const waypoints = wps as Waypoint[];
      waypoints[0] = { ...waypoints[0], waypoint_type: 'origin' };
      waypoints[waypoints.length - 1] = {
        ...waypoints[waypoints.length - 1],
        waypoint_type: 'destination',
      };
      return waypoints;
    })
  );

/** A minimal route object for export */
const testRoute: Route = {
  id: 'route-1',
  user_id: 'user-1',
  name: 'Test Route',
  total_distance_km: 500,
  total_duration_seconds: 18000,
  polyline_encoded: null,
  status: 'finalized',
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Helper: Parse GPX XML to extract waypoint coordinates ────────────────────

interface ParsedCoord {
  lat: number;
  lon: number;
}

function parseGpxWaypoints(gpxBuffer: Buffer): ParsedCoord[] {
  const xml = gpxBuffer.toString('utf-8');
  const coords: ParsedCoord[] = [];

  // Match <wpt lat="..." lon="..."> elements
  const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)">/g;
  let match: RegExpExecArray | null;
  while ((match = wptRegex.exec(xml)) !== null) {
    coords.push({
      lat: parseFloat(match[1]),
      lon: parseFloat(match[2]),
    });
  }

  return coords;
}

// ─── Property 18: Export Round-Trip Waypoint Preservation ─────────────────────
// **Validates: Requirements 9.3, 9.6, 9.7**
// Export then parse produces equivalent waypoints within GPS precision tolerance.

describe('Property 18: Export Round-Trip Waypoint Preservation', () => {
  it('GPX export then parse produces equivalent waypoints within GPS precision tolerance (0.0001 degrees)', () => {
    /**
     * **Validates: Requirements 9.3, 9.6, 9.7**
     */
    const exporter = new GpxExporter();
    const GPS_TOLERANCE = 0.0001; // ~11 meters

    fc.assert(
      fc.property(waypointListArb(2, 8), (waypoints) => {
        // Export to GPX
        const gpxBuffer = exporter.export(testRoute, waypoints);

        // Parse the GPX back
        const parsedCoords = parseGpxWaypoints(gpxBuffer);

        // Same number of waypoints
        expect(parsedCoords.length).toBe(waypoints.length);

        // Each waypoint's coordinates match within GPS precision tolerance
        for (let i = 0; i < waypoints.length; i++) {
          const original = waypoints[i];
          const parsed = parsedCoords[i];

          expect(Math.abs(original.latitude - parsed.lat)).toBeLessThanOrEqual(GPS_TOLERANCE);
          expect(Math.abs(original.longitude - parsed.lon)).toBeLessThanOrEqual(GPS_TOLERANCE);
        }
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 19: Export File Splitting on Format Limit ───────────────────────
// **Validates: Requirements 9.4, 9.5**
// Split files' combined waypoints equal original route waypoints.

describe('Property 19: Export File Splitting on Format Limit', () => {
  it('split chunks combined unique waypoints equal original, each chunk respects maxWaypoints, consecutive chunks overlap by 1', () => {
    /**
     * **Validates: Requirements 9.4, 9.5**
     */
    const ITN_MAX_WAYPOINTS = 48;

    fc.assert(
      fc.property(
        // Generate waypoints exceeding ITN limit (50-70 waypoints)
        largeWaypointListArb(50, 70),
        (waypoints) => {
          const chunks = splitWaypoints(waypoints, ITN_MAX_WAYPOINTS);

          // Must produce more than 1 chunk since count > maxWaypoints
          expect(chunks.length).toBeGreaterThan(1);

          // Each chunk has at most maxWaypoints entries
          for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(ITN_MAX_WAYPOINTS);
            expect(chunk.length).toBeGreaterThan(0);
          }

          // Consecutive chunks overlap by exactly 1 waypoint
          // (last of chunk N = first of chunk N+1)
          for (let i = 0; i < chunks.length - 1; i++) {
            const lastOfCurrent = chunks[i][chunks[i].length - 1];
            const firstOfNext = chunks[i + 1][0];
            expect(lastOfCurrent).toBe(firstOfNext);
          }

          // Combined set of unique waypoints from all chunks equals original
          const combinedSet = new Set<Waypoint>();
          for (const chunk of chunks) {
            for (const wp of chunk) {
              combinedSet.add(wp);
            }
          }
          expect(combinedSet.size).toBe(waypoints.length);

          // Verify all original waypoints are present
          for (const wp of waypoints) {
            expect(combinedSet.has(wp)).toBe(true);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('waypoints within maxWaypoints limit produce a single chunk with all waypoints', () => {
    /**
     * **Validates: Requirements 9.5**
     */
    fc.assert(
      fc.property(
        // Generate waypoints within ITN limit (2-48)
        waypointListArb(2, 8),
        (waypoints) => {
          const chunks = splitWaypoints(waypoints, 48);

          // Should not split
          expect(chunks.length).toBe(1);
          expect(chunks[0].length).toBe(waypoints.length);

          // All waypoints preserved
          for (let i = 0; i < waypoints.length; i++) {
            expect(chunks[0][i]).toBe(waypoints[i]);
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});
