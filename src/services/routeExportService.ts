/**
 * Route Export Service
 * Handles exporting routes in various navigation formats, including
 * merging accepted refuel stops and splitting files when waypoint limits are exceeded.
 *
 * Requirements: 9.3, 9.4, 9.5
 */

import { query } from '../utils/database';
import { getRoute } from './routeService';
import { Waypoint } from '../models/route';
import {
  ExportFormat,
  IRouteFormatExporter,
  getExporter,
  isFormatSupported,
} from '../exporters/index';

export interface ExportResult {
  files: Buffer[];
  format: ExportFormat;
  split: boolean;
  splitCount: number;
}

export interface RefuelStopWithStation {
  id: string;
  route_id: string;
  fuel_station_id: string;
  position_in_route: number;
  fuel_price_eur: number | null;
  status: string;
  station_name: string;
  station_latitude: number;
  station_longitude: number;
}

/**
 * Get accepted refuel stops for a route, joined with fuel station data.
 */
export async function getAcceptedRefuelStops(routeId: string): Promise<RefuelStopWithStation[]> {
  const result = await query(
    `SELECT rs.id, rs.route_id, rs.fuel_station_id, rs.position_in_route,
            rs.fuel_price_eur, rs.status,
            fs.name AS station_name, fs.latitude AS station_latitude, fs.longitude AS station_longitude
     FROM refuel_stops rs
     JOIN fuel_stations fs ON rs.fuel_station_id = fs.id
     WHERE rs.route_id = $1 AND rs.status = 'accepted'
     ORDER BY rs.position_in_route ASC`,
    [routeId]
  );
  return result.rows as RefuelStopWithStation[];
}

/**
 * Merge refuel stops into the waypoint list at their position_in_route.
 * Refuel stops are inserted after the waypoint at their position_in_route index.
 * The resulting list maintains correct ordering.
 */
export function mergeRefuelStopsIntoWaypoints(
  waypoints: Waypoint[],
  refuelStops: RefuelStopWithStation[]
): Waypoint[] {
  if (refuelStops.length === 0) {
    return [...waypoints];
  }

  // Build a list of insertions grouped by position
  const insertions = new Map<number, RefuelStopWithStation[]>();
  for (const stop of refuelStops) {
    const pos = stop.position_in_route;
    if (!insertions.has(pos)) {
      insertions.set(pos, []);
    }
    insertions.get(pos)!.push(stop);
  }

  // Build merged waypoint list
  const merged: Waypoint[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    merged.push(waypoints[i]);

    // Insert refuel stops that come after this waypoint position
    const stopsAtPosition = insertions.get(i);
    if (stopsAtPosition) {
      for (const stop of stopsAtPosition) {
        merged.push({
          id: stop.id,
          route_id: stop.route_id,
          position: -1, // synthetic position
          label: stop.station_name,
          latitude: stop.station_latitude,
          longitude: stop.station_longitude,
          place_id: null,
          formatted_address: null,
          waypoint_type: 'stop',
        });
      }
    }
  }

  return merged;
}

/**
 * Split waypoints into chunks respecting the format's maxWaypoints limit.
 * Ensures overlap at boundaries: last waypoint of chunk N = first waypoint of chunk N+1.
 * This ensures continuity when loading split files sequentially.
 */
export function splitWaypoints(waypoints: Waypoint[], maxWaypoints: number): Waypoint[][] {
  if (maxWaypoints <= 1) {
    throw new Error('maxWaypoints must be greater than 1');
  }

  if (waypoints.length <= maxWaypoints) {
    return [waypoints];
  }

  const chunks: Waypoint[][] = [];
  let startIndex = 0;

  while (startIndex < waypoints.length) {
    const endIndex = Math.min(startIndex + maxWaypoints, waypoints.length);
    chunks.push(waypoints.slice(startIndex, endIndex));

    // Next chunk starts at the last waypoint of current chunk (overlap)
    startIndex = endIndex - 1;

    // If we've reached the end, stop
    if (endIndex >= waypoints.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Export a route in the specified format.
 * Includes all waypoints (origin, stops, destination) and accepted refuel stops.
 * Splits into multiple files if waypoints exceed the format's maxWaypoints.
 */
export async function exportRoute(routeId: string, format: ExportFormat): Promise<ExportResult> {
  // Validate format
  if (!isFormatSupported(format)) {
    const error = new Error(`Unsupported export format: ${format}`);
    (error as any).statusCode = 400;
    throw error;
  }

  // Get route with waypoints
  const routeData = await getRoute(routeId);
  if (!routeData) {
    const error = new Error('Route not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Get accepted refuel stops
  const refuelStops = await getAcceptedRefuelStops(routeId);

  // Merge refuel stops into waypoints
  const allWaypoints = mergeRefuelStopsIntoWaypoints(routeData.waypoints, refuelStops);

  // Get the exporter
  const exporter: IRouteFormatExporter = getExporter(format);

  // Check if splitting is needed
  const maxWaypoints = exporter.maxWaypoints;
  let waypointChunks: Waypoint[][];

  if (maxWaypoints !== null && allWaypoints.length > maxWaypoints) {
    waypointChunks = splitWaypoints(allWaypoints, maxWaypoints);
  } else {
    waypointChunks = [allWaypoints];
  }

  // Export each chunk
  const files: Buffer[] = waypointChunks.map((chunk) => {
    return exporter.export(routeData.route, chunk);
  });

  const split = files.length > 1;

  return {
    files,
    format,
    split,
    splitCount: files.length,
  };
}
