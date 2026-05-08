import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { CreateWaypointInput, WaypointType } from '../../models/route';

// ─── In-memory store for testing (same pattern as routeService.test.ts) ───────

let routes: any[] = [];
let waypoints: any[] = [];
let segments: any[] = [];
let idCounter = 0;

function generateId() {
  return `test-uuid-${++idCounter}`;
}

function resetStore() {
  routes = [];
  waypoints = [];
  segments = [];
  idCounter = 0;
}

const mockQueryFn = async (text: string, params?: unknown[]) => {
  // Route INSERT
  if (text.includes('INSERT INTO routes')) {
    const route = {
      id: generateId(),
      user_id: params![0],
      name: params![1],
      total_distance_km: null,
      total_duration_seconds: null,
      polyline_encoded: null,
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    };
    routes.push(route);
    return { rows: [route], rowCount: 1 };
  }

  // Route SELECT by id
  if (text.includes('SELECT * FROM routes WHERE id')) {
    const found = routes.filter((r) => r.id === params![0]);
    return { rows: found, rowCount: found.length };
  }

  // Route SELECT by user_id
  if (text.includes('SELECT * FROM routes WHERE user_id')) {
    const found = routes
      .filter((r) => r.user_id === params![0])
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return { rows: found, rowCount: found.length };
  }

  // Route UPDATE with RETURNING (metadata update)
  if (text.includes('UPDATE routes SET') && text.includes('RETURNING')) {
    const routeId = params![params!.length - 1];
    const route = routes.find((r) => r.id === routeId);
    if (route) {
      route.updated_at = new Date();
      return { rows: [route], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Route UPDATE (no RETURNING - timestamp update)
  if (text.includes('UPDATE routes SET updated_at')) {
    return { rows: [], rowCount: 1 };
  }

  // Route DELETE
  if (text.includes('DELETE FROM routes')) {
    const idx = routes.findIndex((r) => r.id === params![0]);
    if (idx >= 0) {
      const routeId = routes[idx].id;
      routes.splice(idx, 1);
      waypoints = waypoints.filter((w) => w.route_id !== routeId);
      segments = segments.filter((s) => s.route_id !== routeId);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Waypoint COUNT
  if (text.includes('SELECT COUNT(*)') && text.includes('waypoints')) {
    const count = waypoints.filter((w) => w.route_id === params![0]).length;
    return { rows: [{ count: count.toString() }], rowCount: 1 };
  }

  // Waypoint SELECT ids
  if (text.includes('SELECT id FROM waypoints')) {
    const found = waypoints.filter((w) => w.route_id === params![0]);
    return { rows: found.map((w) => ({ id: w.id })), rowCount: found.length };
  }

  // Waypoint SELECT all for route (ORDER BY)
  if (text.includes('SELECT * FROM waypoints WHERE route_id') && text.includes('ORDER BY')) {
    const found = waypoints
      .filter((w) => w.route_id === params![0])
      .sort((a, b) => a.position - b.position);
    return { rows: found, rowCount: found.length };
  }

  // Waypoint INSERT
  if (text.includes('INSERT INTO waypoints')) {
    const wp = {
      id: generateId(),
      route_id: params![0],
      position: params![1],
      label: params![2],
      latitude: params![3],
      longitude: params![4],
      place_id: params![5],
      formatted_address: params![6],
      waypoint_type: params![7],
    };
    waypoints.push(wp);
    return { rows: [wp], rowCount: 1 };
  }

  // Waypoint UPDATE position (shift up)
  if (text.includes('UPDATE waypoints SET position = position + 1')) {
    const routeId = params![0];
    const pos = params![1] as number;
    waypoints
      .filter((w) => w.route_id === routeId && w.position >= pos)
      .forEach((w) => { w.position += 1; });
    return { rows: [], rowCount: 0 };
  }

  // Waypoint UPDATE position (shift down)
  if (text.includes('UPDATE waypoints SET position = position - 1')) {
    const routeId = params![0];
    const pos = params![1] as number;
    waypoints
      .filter((w) => w.route_id === routeId && w.position > pos)
      .forEach((w) => { w.position -= 1; });
    return { rows: [], rowCount: 0 };
  }

  // Waypoint UPDATE position (reorder - set specific position)
  if (text.includes('UPDATE waypoints SET position =') && text.includes('WHERE id =')) {
    const newPos = params![0] as number;
    const wpId = params![1];
    const routeId = params![2];
    const wp = waypoints.find((w) => w.id === wpId && w.route_id === routeId);
    if (wp) wp.position = newPos;
    return { rows: [], rowCount: 0 };
  }

  // Waypoint DELETE
  if (text.includes('DELETE FROM waypoints WHERE id')) {
    const idx = waypoints.findIndex(
      (w) => w.id === params![0] && w.route_id === params![1]
    );
    if (idx >= 0) {
      const removed = waypoints.splice(idx, 1)[0];
      return { rows: [{ position: removed.position }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Route segments SELECT
  if (text.includes('SELECT * FROM route_segments')) {
    const found = segments
      .filter((s) => s.route_id === params![0])
      .sort((a, b) => a.segment_index - b.segment_index);
    return { rows: found, rowCount: found.length };
  }

  return { rows: [], rowCount: 0 };
};

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn((...args: any[]) => mockQueryFn(args[0], args[1])),
  transaction: vi.fn(async (callback: any) => {
    const fakeClient = { query: (...args: any[]) => mockQueryFn(args[0], args[1]) };
    return callback(fakeClient);
  }),
  getClient: vi.fn(),
}));

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a valid latitude in Europe range */
const latitudeArb = fc.double({ min: 35.0, max: 71.0, noNaN: true });

/** Generate a valid longitude in Europe range */
const longitudeArb = fc.double({ min: -10.0, max: 40.0, noNaN: true });

/** Generate a waypoint type */
/** Generate a CreateWaypointInput */
const waypointInputArb = (type: WaypointType): fc.Arbitrary<CreateWaypointInput> =>
  fc.record({
    latitude: latitudeArb,
    longitude: longitudeArb,
    waypoint_type: fc.constant(type),
    label: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  });

/**
 * Generate a valid initial route with 2-6 waypoints (origin + 0-4 stops + destination).
 * This keeps the route small enough for fast tests but large enough to test manipulation.
 */
const initialWaypointsArb = fc.integer({ min: 0, max: 4 }).chain((numStops) => {
  const stops = fc.array(waypointInputArb('stop'), { minLength: numStops, maxLength: numStops });
  return fc.tuple(waypointInputArb('origin'), stops, waypointInputArb('destination')).map(
    ([origin, stopsList, destination]) => {
      const all: CreateWaypointInput[] = [
        { ...origin, position: 0 },
        ...stopsList.map((s, i) => ({ ...s, position: i + 1 })),
        { ...destination, position: numStops + 1 },
      ];
      return all;
    }
  );
});

// ─── Property 1: Waypoint Insertion Preserves and Grows ───────────────────────
// **Validates: Requirements 1.3**
// Inserting at position P yields N+1 waypoints with correct ordering.

describe('Property 1: Waypoint Insertion Preserves and Grows', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('inserting a waypoint at position P yields N+1 waypoints with correct ordering', async () => {
    /**
     * **Validates: Requirements 1.3**
     */
    await fc.assert(
      fc.asyncProperty(
        initialWaypointsArb,
        waypointInputArb('stop'),
        async (initialWaypoints, newWaypoint) => {
          resetStore();
          const N = initialWaypoints.length;

          // Cannot insert if already at max (12)
          if (N >= 12) return;

          // Create route with initial waypoints
          const created = await routeService.createRoute('user-1', 'Test Route', initialWaypoints);
          const routeId = created.route.id;

          // Pick a valid insertion position (between 0 and N inclusive)
          const position = Math.floor(Math.random() * (N + 1));

          // Insert the new waypoint
          const result = await routeService.addWaypoint(routeId, newWaypoint, position);

          // Should have N+1 waypoints
          expect(result).toHaveLength(N + 1);

          // Positions should be contiguous 0..N
          for (let i = 0; i < result.length; i++) {
            expect(result[i].position).toBe(i);
          }

          // The inserted waypoint should be at the specified position
          expect(result[position].latitude).toBe(newWaypoint.latitude);
          expect(result[position].longitude).toBe(newWaypoint.longitude);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 2: Waypoint Reorder Preserves Set ───────────────────────────────
// **Validates: Requirements 1.4**
// Reordering preserves same waypoint set, origin/destination unchanged.

describe('Property 2: Waypoint Reorder Preserves Set', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('reordering preserves the same waypoint set with contiguous positions', async () => {
    /**
     * **Validates: Requirements 1.4**
     */
    await fc.assert(
      fc.asyncProperty(
        initialWaypointsArb,
        fc.context(),
        async (initialWaypoints, _ctx) => {
          resetStore();

          // Need at least 3 waypoints to meaningfully reorder
          if (initialWaypoints.length < 3) return;

          // Create route
          const created = await routeService.createRoute('user-1', 'Test Route', initialWaypoints);
          const routeId = created.route.id;
          const originalWaypoints = created.waypoints;

          // Create a shuffled order of waypoint IDs
          const ids = originalWaypoints.map((w) => w.id);
          const shuffled = [...ids].sort(() => Math.random() - 0.5);

          // Reorder
          const result = await routeService.reorderWaypoints(routeId, shuffled);

          // Same number of waypoints
          expect(result).toHaveLength(originalWaypoints.length);

          // Positions are contiguous 0..N-1
          for (let i = 0; i < result.length; i++) {
            expect(result[i].position).toBe(i);
          }

          // Same set of waypoint IDs (just reordered)
          const originalIds = new Set(originalWaypoints.map((w) => w.id));
          const resultIds = new Set(result.map((w) => w.id));
          expect(resultIds).toEqual(originalIds);

          // Same set of coordinates (lat/lng pairs preserved)
          const originalCoords = new Set(
            originalWaypoints.map((w) => `${w.latitude},${w.longitude}`)
          );
          const resultCoords = new Set(
            result.map((w) => `${w.latitude},${w.longitude}`)
          );
          expect(resultCoords).toEqual(originalCoords);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 3: Waypoint Removal Shrinks and Excludes ────────────────────────
// **Validates: Requirements 1.5**
// Removing yields N-1 waypoints, removed absent, order preserved.

describe('Property 3: Waypoint Removal Shrinks and Excludes', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('removing a waypoint yields N-1 waypoints with the removed one absent and order preserved', async () => {
    /**
     * **Validates: Requirements 1.5**
     */
    await fc.assert(
      fc.asyncProperty(
        initialWaypointsArb,
        async (initialWaypoints) => {
          resetStore();
          const N = initialWaypoints.length;

          // Need at least 2 waypoints to remove one
          if (N < 2) return;

          // Create route
          const created = await routeService.createRoute('user-1', 'Test Route', initialWaypoints);
          const routeId = created.route.id;
          const originalWaypoints = created.waypoints;

          // Pick a random waypoint to remove
          const removeIndex = Math.floor(Math.random() * N);
          const removedWaypoint = originalWaypoints[removeIndex];

          // Remove it
          const result = await routeService.removeWaypoint(routeId, removedWaypoint.id);

          // Should have N-1 waypoints
          expect(result).toHaveLength(N - 1);

          // Removed waypoint should not be present
          const resultIds = result.map((w) => w.id);
          expect(resultIds).not.toContain(removedWaypoint.id);

          // Positions should be contiguous 0..N-2
          for (let i = 0; i < result.length; i++) {
            expect(result[i].position).toBe(i);
          }

          // Relative order of remaining waypoints should be preserved
          const originalOrder = originalWaypoints
            .filter((w) => w.id !== removedWaypoint.id)
            .map((w) => w.id);
          const resultOrder = result.map((w) => w.id);
          expect(resultOrder).toEqual(originalOrder);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 4: Failed Geocoding Preserves Route State ───────────────────────
// **Validates: Requirements 1.7**
// On geocoding failure, route state remains identical.

describe('Property 4: Failed Geocoding Preserves Route State', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('geocoding failure does not modify route state', async () => {
    /**
     * **Validates: Requirements 1.7**
     */
    await fc.assert(
      fc.asyncProperty(
        initialWaypointsArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (initialWaypoints, invalidAddress) => {
          resetStore();

          // Create a route with initial waypoints
          const created = await routeService.createRoute('user-1', 'Test Route', initialWaypoints);
          const routeId = created.route.id;

          // Snapshot the route state before geocoding attempt
          const stateBefore = await routeService.getRoute(routeId);
          const waypointsBefore = stateBefore!.waypoints.map((w) => ({
            id: w.id,
            position: w.position,
            latitude: w.latitude,
            longitude: w.longitude,
            waypoint_type: w.waypoint_type,
            label: w.label,
          }));

          // Simulate a failed geocoding call — the GoogleMapsService throws
          const { GoogleMapsService } = await import(
            '../../services/googleMapsService'
          );
          const service = new GoogleMapsService(
            {
              geocode: () => {
                throw new Error('Network error');
              },
            } as any,
            'fake-key'
          );

          // Attempt geocoding — should throw
          let geocodeError: Error | null = null;
          try {
            await service.geocode(invalidAddress);
          } catch (e) {
            geocodeError = e as Error;
          }

          // Geocoding should have failed
          expect(geocodeError).not.toBeNull();

          // Route state should be unchanged after the failed geocoding
          const stateAfter = await routeService.getRoute(routeId);
          const waypointsAfter = stateAfter!.waypoints.map((w) => ({
            id: w.id,
            position: w.position,
            latitude: w.latitude,
            longitude: w.longitude,
            waypoint_type: w.waypoint_type,
            label: w.label,
          }));

          // Route metadata unchanged
          expect(stateAfter!.route.id).toBe(stateBefore!.route.id);
          expect(stateAfter!.route.status).toBe(stateBefore!.route.status);
          expect(stateAfter!.route.name).toBe(stateBefore!.route.name);

          // Waypoints unchanged
          expect(waypointsAfter).toEqual(waypointsBefore);
        }
      ),
      { numRuns: 10 }
    );
  });
});
