import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateWaypointInput } from '../models/route';

// In-memory store for testing
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
vi.mock('../utils/database', () => ({
  query: vi.fn((...args: any[]) => mockQueryFn(args[0], args[1])),
  transaction: vi.fn(async (callback: any) => {
    const fakeClient = { query: (...args: any[]) => mockQueryFn(args[0], args[1]) };
    return callback(fakeClient);
  }),
  getClient: vi.fn(),
}));

describe('routeService', () => {
  let routeService: typeof import('./routeService');

  beforeEach(async () => {
    resetStore();
    // Re-import to get fresh module with mocks applied
    routeService = await import('./routeService');
  });

  describe('createRoute', () => {
    it('should create a route with waypoints', async () => {
      const wps: CreateWaypointInput[] = [
        { position: 0, latitude: 48.8566, longitude: 2.3522, waypoint_type: 'origin', label: 'Paris' },
        { position: 1, latitude: 50.8503, longitude: 4.3517, waypoint_type: 'destination', label: 'Brussels' },
      ];

      const result = await routeService.createRoute('user-1', 'Paris to Brussels', wps);

      expect(result.route).toBeDefined();
      expect(result.route.user_id).toBe('user-1');
      expect(result.route.name).toBe('Paris to Brussels');
      expect(result.route.status).toBe('draft');
      expect(result.waypoints).toHaveLength(2);
      expect(result.waypoints[0].waypoint_type).toBe('origin');
      expect(result.waypoints[1].waypoint_type).toBe('destination');
      expect(result.segments).toHaveLength(0);
    });

    it('should reject more than 12 waypoints', async () => {
      const wps: CreateWaypointInput[] = Array.from({ length: 13 }, (_, i) => ({
        position: i,
        latitude: 48 + i * 0.1,
        longitude: 2 + i * 0.1,
        waypoint_type: 'stop' as const,
      }));

      await expect(
        routeService.createRoute('user-1', 'Too many stops', wps)
      ).rejects.toThrow(/at most 12 waypoints/);
    });

    it('should allow exactly 12 waypoints (origin + 10 stops + destination)', async () => {
      const wps: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin' },
        ...Array.from({ length: 10 }, (_, i) => ({
          position: i + 1,
          latitude: 48 + (i + 1) * 0.1,
          longitude: 2 + (i + 1) * 0.1,
          waypoint_type: 'stop' as const,
        })),
        { position: 11, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination' },
      ];

      const result = await routeService.createRoute('user-1', '12 waypoints', wps);
      expect(result.waypoints).toHaveLength(12);
    });
  });

  describe('getRoute', () => {
    it('should return null for non-existent route', async () => {
      const result = await routeService.getRoute('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return route with waypoints and segments', async () => {
      const wps: CreateWaypointInput[] = [
        { position: 0, latitude: 48.8566, longitude: 2.3522, waypoint_type: 'origin' },
        { position: 1, latitude: 50.8503, longitude: 4.3517, waypoint_type: 'destination' },
      ];

      const created = await routeService.createRoute('user-1', 'Test Route', wps);
      const result = await routeService.getRoute(created.route.id);

      expect(result).not.toBeNull();
      expect(result!.route.id).toBe(created.route.id);
      expect(result!.waypoints).toHaveLength(2);
    });
  });

  describe('deleteRoute', () => {
    it('should delete an existing route', async () => {
      const wps: CreateWaypointInput[] = [
        { position: 0, latitude: 48.8566, longitude: 2.3522, waypoint_type: 'origin' },
      ];
      const created = await routeService.createRoute('user-1', 'To Delete', wps);

      const deleted = await routeService.deleteRoute(created.route.id);
      expect(deleted).toBe(true);

      const result = await routeService.getRoute(created.route.id);
      expect(result).toBeNull();
    });

    it('should return false for non-existent route', async () => {
      const deleted = await routeService.deleteRoute('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('addWaypoint', () => {
    it('should insert a waypoint at the specified position', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin', label: 'A' },
        { position: 1, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination', label: 'C' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      const newWp: CreateWaypointInput = {
        position: 1,
        latitude: 49.0,
        longitude: 3.0,
        waypoint_type: 'stop',
        label: 'B',
      };

      const result = await routeService.addWaypoint(created.route.id, newWp, 1);

      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('A');
      expect(result[0].position).toBe(0);
      expect(result[1].label).toBe('B');
      expect(result[1].position).toBe(1);
      expect(result[2].label).toBe('C');
      expect(result[2].position).toBe(2);
    });

    it('should reject adding beyond max waypoints', async () => {
      const initial: CreateWaypointInput[] = Array.from({ length: 12 }, (_, i) => ({
        position: i,
        latitude: 48 + i * 0.1,
        longitude: 2 + i * 0.1,
        waypoint_type: (i === 0 ? 'origin' : i === 11 ? 'destination' : 'stop') as any,
      }));
      const created = await routeService.createRoute('user-1', 'Full Route', initial);

      const newWp: CreateWaypointInput = {
        position: 6,
        latitude: 49.5,
        longitude: 3.5,
        waypoint_type: 'stop',
      };

      await expect(
        routeService.addWaypoint(created.route.id, newWp, 6)
      ).rejects.toThrow(/at most 12 waypoints/);
    });
  });

  describe('removeWaypoint', () => {
    it('should remove a waypoint and reindex positions', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin', label: 'A' },
        { position: 1, latitude: 49.0, longitude: 3.0, waypoint_type: 'stop', label: 'B' },
        { position: 2, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination', label: 'C' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      // Remove the middle waypoint (B)
      const middleWp = created.waypoints[1];
      const result = await routeService.removeWaypoint(created.route.id, middleWp.id);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('A');
      expect(result[0].position).toBe(0);
      expect(result[1].label).toBe('C');
      expect(result[1].position).toBe(1);
    });

    it('should throw 404 for non-existent waypoint', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      await expect(
        routeService.removeWaypoint(created.route.id, 'non-existent-wp')
      ).rejects.toThrow('Waypoint not found');
    });
  });

  describe('reorderWaypoints', () => {
    it('should reorder waypoints according to new order', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin', label: 'A' },
        { position: 1, latitude: 49.0, longitude: 3.0, waypoint_type: 'stop', label: 'B' },
        { position: 2, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination', label: 'C' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      // Reverse order: C, B, A
      const newOrder = [
        created.waypoints[2].id,
        created.waypoints[1].id,
        created.waypoints[0].id,
      ];

      const result = await routeService.reorderWaypoints(created.route.id, newOrder);

      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('C');
      expect(result[0].position).toBe(0);
      expect(result[1].label).toBe('B');
      expect(result[1].position).toBe(1);
      expect(result[2].label).toBe('A');
      expect(result[2].position).toBe(2);
    });

    it('should reject if newOrder has wrong number of IDs', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin' },
        { position: 1, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      await expect(
        routeService.reorderWaypoints(created.route.id, [created.waypoints[0].id])
      ).rejects.toThrow(/must contain exactly all waypoint IDs/);
    });

    it('should reject if newOrder contains unknown waypoint ID', async () => {
      const initial: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin' },
        { position: 1, latitude: 50.0, longitude: 4.0, waypoint_type: 'destination' },
      ];
      const created = await routeService.createRoute('user-1', 'Route', initial);

      await expect(
        routeService.reorderWaypoints(created.route.id, [
          created.waypoints[0].id,
          'unknown-id',
        ])
      ).rejects.toThrow(/does not belong to route/);
    });
  });

  describe('getRoutesByUser', () => {
    it('should return routes sorted by created_at descending', async () => {
      const wp: CreateWaypointInput[] = [
        { position: 0, latitude: 48.0, longitude: 2.0, waypoint_type: 'origin' },
      ];

      await routeService.createRoute('user-1', 'Route 1', wp);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await routeService.createRoute('user-1', 'Route 2', wp);
      await routeService.createRoute('user-2', 'Other User Route', wp);

      const result = await routeService.getRoutesByUser('user-1');
      expect(result).toHaveLength(2);
      // Newest first
      expect(result[0].name).toBe('Route 2');
      expect(result[1].name).toBe('Route 1');
    });

    it('should return empty array for user with no routes', async () => {
      const result = await routeService.getRoutesByUser('no-routes-user');
      expect(result).toHaveLength(0);
    });
  });
});
