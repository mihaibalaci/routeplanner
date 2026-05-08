import { query, transaction } from '../utils/database';
import {
  Route,
  Waypoint,
  RouteSegment,
  CreateWaypointInput,
  RouteWithDetails,
  UpdateRouteInput,
} from '../models/route';
import { PoolClient } from 'pg';

/** Maximum number of waypoints per route (origin + 10 stops + destination). */
const MAX_WAYPOINTS = 12;

/**
 * Creates a new route with initial waypoints.
 * Waypoints are inserted in the order provided, with positions assigned sequentially.
 */
export async function createRoute(
  userId: string,
  name: string,
  waypoints: CreateWaypointInput[]
): Promise<RouteWithDetails> {
  if (waypoints.length > MAX_WAYPOINTS) {
    const error = new Error(
      `A route can have at most ${MAX_WAYPOINTS} waypoints (origin + 10 intermediate stops + destination)`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  return transaction(async (client: PoolClient) => {
    // Create the route
    const routeResult = await client.query(
      `INSERT INTO routes (user_id, name, status)
       VALUES ($1, $2, 'draft')
       RETURNING *`,
      [userId, name]
    );
    const route = routeResult.rows[0] as Route;

    // Insert waypoints with sequential positions
    const insertedWaypoints: Waypoint[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const result = await client.query(
        `INSERT INTO waypoints (route_id, position, label, latitude, longitude, place_id, formatted_address, waypoint_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          route.id,
          wp.position ?? i,
          wp.label ?? null,
          wp.latitude,
          wp.longitude,
          wp.place_id ?? null,
          wp.formatted_address ?? null,
          wp.waypoint_type,
        ]
      );
      insertedWaypoints.push(result.rows[0] as Waypoint);
    }

    return {
      route,
      waypoints: insertedWaypoints,
      segments: [],
    };
  });
}

/**
 * Retrieves a route with its waypoints and segments.
 */
export async function getRoute(routeId: string): Promise<RouteWithDetails | null> {
  const routeResult = await query('SELECT * FROM routes WHERE id = $1', [routeId]);
  if (routeResult.rows.length === 0) {
    return null;
  }

  const route = routeResult.rows[0] as Route;

  const waypointsResult = await query(
    'SELECT * FROM waypoints WHERE route_id = $1 ORDER BY position ASC',
    [routeId]
  );
  const waypoints = waypointsResult.rows as Waypoint[];

  const segmentsResult = await query(
    'SELECT * FROM route_segments WHERE route_id = $1 ORDER BY segment_index ASC',
    [routeId]
  );
  const segments = segmentsResult.rows as RouteSegment[];

  return { route, waypoints, segments };
}

/**
 * Updates route metadata (name, distance, duration, polyline, status).
 */
export async function updateRoute(
  routeId: string,
  updates: UpdateRouteInput
): Promise<Route | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.total_distance_km !== undefined) {
    fields.push(`total_distance_km = $${paramIndex++}`);
    values.push(updates.total_distance_km);
  }
  if (updates.total_duration_seconds !== undefined) {
    fields.push(`total_duration_seconds = $${paramIndex++}`);
    values.push(updates.total_duration_seconds);
  }
  if (updates.polyline_encoded !== undefined) {
    fields.push(`polyline_encoded = $${paramIndex++}`);
    values.push(updates.polyline_encoded);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (fields.length === 0) {
    // Nothing to update, just return the current route
    const result = await query('SELECT * FROM routes WHERE id = $1', [routeId]);
    return result.rows.length > 0 ? (result.rows[0] as Route) : null;
  }

  fields.push(`updated_at = NOW()`);
  values.push(routeId);

  const result = await query(
    `UPDATE routes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows.length > 0 ? (result.rows[0] as Route) : null;
}

/**
 * Deletes a route and all associated waypoints/segments (via CASCADE).
 */
export async function deleteRoute(routeId: string): Promise<boolean> {
  const result = await query('DELETE FROM routes WHERE id = $1', [routeId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Adds a waypoint at a specific position, shifting existing waypoints at that
 * position and above by +1.
 * Enforces the maximum waypoint limit.
 */
export async function addWaypoint(
  routeId: string,
  waypoint: CreateWaypointInput,
  position: number
): Promise<Waypoint[]> {
  return transaction(async (client: PoolClient) => {
    // Check current waypoint count
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM waypoints WHERE route_id = $1',
      [routeId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);

    if (currentCount >= MAX_WAYPOINTS) {
      const error = new Error(
        `A route can have at most ${MAX_WAYPOINTS} waypoints (origin + 10 intermediate stops + destination)`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // Shift existing waypoints at position >= target position upward
    await client.query(
      `UPDATE waypoints SET position = position + 1
       WHERE route_id = $1 AND position >= $2`,
      [routeId, position]
    );

    // Insert the new waypoint at the specified position
    await client.query(
      `INSERT INTO waypoints (route_id, position, label, latitude, longitude, place_id, formatted_address, waypoint_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        routeId,
        position,
        waypoint.label ?? null,
        waypoint.latitude,
        waypoint.longitude,
        waypoint.place_id ?? null,
        waypoint.formatted_address ?? null,
        waypoint.waypoint_type,
      ]
    );

    // Update route's updated_at timestamp
    await client.query(
      `UPDATE routes SET updated_at = NOW() WHERE id = $1`,
      [routeId]
    );

    // Return all waypoints in order
    const result = await client.query(
      'SELECT * FROM waypoints WHERE route_id = $1 ORDER BY position ASC',
      [routeId]
    );
    return result.rows as Waypoint[];
  });
}

/**
 * Removes a waypoint by ID and reindexes remaining waypoints to maintain
 * contiguous positions starting from 0.
 */
export async function removeWaypoint(
  routeId: string,
  waypointId: string
): Promise<Waypoint[]> {
  return transaction(async (client: PoolClient) => {
    // Delete the waypoint
    const deleteResult = await client.query(
      'DELETE FROM waypoints WHERE id = $1 AND route_id = $2 RETURNING position',
      [waypointId, routeId]
    );

    if (deleteResult.rows.length === 0) {
      const error = new Error('Waypoint not found');
      (error as any).statusCode = 404;
      throw error;
    }

    const removedPosition = deleteResult.rows[0].position;

    // Shift waypoints above the removed position down by 1
    await client.query(
      `UPDATE waypoints SET position = position - 1
       WHERE route_id = $1 AND position > $2`,
      [routeId, removedPosition]
    );

    // Update route's updated_at timestamp
    await client.query(
      `UPDATE routes SET updated_at = NOW() WHERE id = $1`,
      [routeId]
    );

    // Return remaining waypoints in order
    const result = await client.query(
      'SELECT * FROM waypoints WHERE route_id = $1 ORDER BY position ASC',
      [routeId]
    );
    return result.rows as Waypoint[];
  });
}

/**
 * Reorders waypoints according to a new position array.
 * newOrder is an array of waypoint IDs in the desired order.
 * Positions are reassigned sequentially (0, 1, 2, ...).
 */
export async function reorderWaypoints(
  routeId: string,
  newOrder: string[]
): Promise<Waypoint[]> {
  return transaction(async (client: PoolClient) => {
    // Verify all waypoint IDs belong to this route
    const existingResult = await client.query(
      'SELECT id FROM waypoints WHERE route_id = $1',
      [routeId]
    );
    const existingIds = new Set(existingResult.rows.map((r: any) => r.id));

    if (newOrder.length !== existingIds.size) {
      const error = new Error(
        'newOrder must contain exactly all waypoint IDs for this route'
      );
      (error as any).statusCode = 400;
      throw error;
    }

    for (const id of newOrder) {
      if (!existingIds.has(id)) {
        const error = new Error(`Waypoint ${id} does not belong to route ${routeId}`);
        (error as any).statusCode = 400;
        throw error;
      }
    }

    // Use a temporary negative offset to avoid unique constraint violations
    // during reordering (route_id, position is unique)
    for (let i = 0; i < newOrder.length; i++) {
      await client.query(
        `UPDATE waypoints SET position = $1 WHERE id = $2 AND route_id = $3`,
        [-(i + 1), newOrder[i], routeId]
      );
    }

    // Now set the final positions (0-based)
    for (let i = 0; i < newOrder.length; i++) {
      await client.query(
        `UPDATE waypoints SET position = $1 WHERE id = $2 AND route_id = $3`,
        [i, newOrder[i], routeId]
      );
    }

    // Update route's updated_at timestamp
    await client.query(
      `UPDATE routes SET updated_at = NOW() WHERE id = $1`,
      [routeId]
    );

    // Return reordered waypoints
    const result = await client.query(
      'SELECT * FROM waypoints WHERE route_id = $1 ORDER BY position ASC',
      [routeId]
    );
    return result.rows as Waypoint[];
  });
}

/**
 * Lists all routes for a user, sorted by created_at descending (newest first).
 */
export async function getRoutesByUser(userId: string): Promise<Route[]> {
  const result = await query(
    'SELECT * FROM routes WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows as Route[];
}
