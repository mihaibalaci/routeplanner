import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { CreateWaypointInput } from '../../models/route';

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

/** Generate a route name */
const routeNameArb = fc.string({ minLength: 1, maxLength: 50 });

// ─── Property 26: Route History Ordering ──────────────────────────────────────
// **Validates: Requirements 11.3**
// Routes returned sorted by creation date descending (newest first).

describe('Property 26: Route History Ordering', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('routes returned by getRoutesByUser are sorted by creation date descending', async () => {
    /**
     * **Validates: Requirements 11.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.array(routeNameArb, { minLength: 2, maxLength: 5 }),
        async (numRoutes, names) => {
          resetStore();

          const userId = 'user-history-test';
          const actualCount = Math.min(numRoutes, names.length);
          const routeNames = names.slice(0, actualCount);

          // Create multiple routes with distinct timestamps
          for (let i = 0; i < routeNames.length; i++) {
            // Manually set different created_at timestamps to ensure ordering
            const wps: CreateWaypointInput[] = [
              { position: 0, latitude: 48.0 + i * 0.1, longitude: 2.0 + i * 0.1, waypoint_type: 'origin' },
              { position: 1, latitude: 50.0 + i * 0.1, longitude: 4.0 + i * 0.1, waypoint_type: 'destination' },
            ];

            const created = await routeService.createRoute(userId, routeNames[i], wps);
            // Assign distinct timestamps: earlier routes get earlier dates
            created.route.created_at = new Date(Date.now() + i * 1000);
          }

          // Retrieve route history
          const history = await routeService.getRoutesByUser(userId);

          // Should have all created routes
          expect(history).toHaveLength(routeNames.length);

          // Verify sorted by created_at descending (newest first)
          for (let i = 0; i < history.length - 1; i++) {
            const current = new Date(history[i].created_at).getTime();
            const next = new Date(history[i + 1].created_at).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 27: Route Deletion Permanence ───────────────────────────────────
// **Validates: Requirements 11.5**
// Deleted route returns not-found, absent from history.

describe('Property 27: Route Deletion Permanence', () => {
  let routeService: typeof import('../../services/routeService');

  beforeEach(async () => {
    resetStore();
    routeService = await import('../../services/routeService');
  });

  it('deleted route returns null from getRoute and is absent from getRoutesByUser', async () => {
    /**
     * **Validates: Requirements 11.5**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        routeNameArb,
        async (numExtraRoutes, deletedRouteName) => {
          resetStore();

          const userId = 'user-delete-test';

          // Create the route that will be deleted
          const wps: CreateWaypointInput[] = [
            { position: 0, latitude: 48.8566, longitude: 2.3522, waypoint_type: 'origin' },
            { position: 1, latitude: 50.8503, longitude: 4.3517, waypoint_type: 'destination' },
          ];
          const toDelete = await routeService.createRoute(userId, deletedRouteName, wps);
          const deletedRouteId = toDelete.route.id;

          // Create additional routes that should remain
          for (let i = 0; i < numExtraRoutes; i++) {
            const extraWps: CreateWaypointInput[] = [
              { position: 0, latitude: 49.0 + i * 0.1, longitude: 3.0 + i * 0.1, waypoint_type: 'origin' },
              { position: 1, latitude: 51.0 + i * 0.1, longitude: 5.0 + i * 0.1, waypoint_type: 'destination' },
            ];
            await routeService.createRoute(userId, `Extra Route ${i}`, extraWps);
          }

          // Delete the target route
          const deleteResult = await routeService.deleteRoute(deletedRouteId);
          expect(deleteResult).toBe(true);

          // getRoute should return null for the deleted route
          const getResult = await routeService.getRoute(deletedRouteId);
          expect(getResult).toBeNull();

          // getRoutesByUser should not include the deleted route
          const history = await routeService.getRoutesByUser(userId);
          const historyIds = history.map((r) => r.id);
          expect(historyIds).not.toContain(deletedRouteId);

          // Other routes should still be present
          expect(history).toHaveLength(numExtraRoutes);
        }
      ),
      { numRuns: 10 }
    );
  });
});
