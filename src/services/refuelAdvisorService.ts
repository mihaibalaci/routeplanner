import { query, transaction } from '../utils/database';
import { getRoute } from './routeService';
import { getProfile } from './vehicleProfileService';
import { getPrice } from './fuelPriceService';
import { VehicleProfile } from '../models/vehicleProfile';
import { FuelStation, RefuelSuggestion, RefuelStop } from '../models/refuelStop';
import { PoolClient } from 'pg';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Refuel when 15% of tank capacity remains — i.e., at 85% of max range */
const REFUEL_THRESHOLD_FACTOR = 0.85;

/** Search radii in km, expanded progressively */
const SEARCH_RADII_KM = [2, 5, 10];

/** Maximum number of alternative stations to return per suggestion */
const MAX_ALTERNATIVES = 3;

// ─── Core Calculations ────────────────────────────────────────────────────────

/**
 * Calculates the maximum range in km for a vehicle on a full tank.
 * Formula: (tank_capacity_liters / consumption_per_100km) × 100
 *
 * Requirements: 8.1
 */
export function calculateMaxRange(vehicle: VehicleProfile): number {
  return ((vehicle.tank_capacity_liters ?? 0) / (vehicle.consumption_per_100km ?? 1)) * 100;
}

/**
 * Calculates the refuel threshold distance in km.
 * The vehicle should refuel before remaining range drops below 15% of tank capacity.
 * This means we refuel at 85% of max range consumed.
 *
 * Requirements: 8.2
 */
export function calculateRefuelThreshold(vehicle: VehicleProfile): number {
  const maxRange = calculateMaxRange(vehicle);
  return maxRange * REFUEL_THRESHOLD_FACTOR;
}

// ─── Station Search ───────────────────────────────────────────────────────────

/**
 * Finds fuel stations within a given radius of a geographic point.
 * Uses the Haversine formula approximation via PostgreSQL.
 *
 * Requirements: 8.3
 */
export async function findStationsNearPoint(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<FuelStation[]> {
  // Use the Haversine formula to find stations within the radius
  // Earth radius ≈ 6371 km
  const result = await query(
    `SELECT id, name, latitude, longitude, country_code, place_id, fuel_types_available,
       (6371 * acos(
         cos(radians($1)) * cos(radians(latitude)) *
         cos(radians(longitude) - radians($2)) +
         sin(radians($1)) * sin(radians(latitude))
       )) AS distance_from_route_km
     FROM fuel_stations
     WHERE (6371 * acos(
       cos(radians($1)) * cos(radians(latitude)) *
       cos(radians(longitude) - radians($2)) +
       sin(radians($1)) * sin(radians(latitude))
     )) <= $3
     ORDER BY distance_from_route_km ASC`,
    [lat, lng, radiusKm]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    country_code: row.country_code,
    place_id: row.place_id,
    fuel_types_available: row.fuel_types_available || [],
    distance_from_route_km: parseFloat(row.distance_from_route_km),
  }));
}

/**
 * Finds stations near a point with progressive radius expansion.
 * Searches 2km first, then 5km, then 10km if no stations found.
 *
 * Requirements: 8.3, 8.7
 */
export async function findStationsWithExpansion(
  lat: number,
  lng: number,
  fuelType: string
): Promise<{ stations: FuelStation[]; searchRadiusKm: number }> {
  for (const radius of SEARCH_RADII_KM) {
    const stations = await findStationsNearPoint(lat, lng, radius);

    // Filter stations that have the required fuel type
    const filtered = stations.filter(
      (s) =>
        s.fuel_types_available.length === 0 || // If no fuel types listed, assume available
        s.fuel_types_available.includes(fuelType)
    );

    if (filtered.length > 0) {
      return { stations: filtered, searchRadiusKm: radius };
    }
  }

  return { stations: [], searchRadiusKm: SEARCH_RADII_KM[SEARCH_RADII_KM.length - 1] };
}

// ─── Main Suggestion Algorithm ────────────────────────────────────────────────

/**
 * Suggests refuel stops along a route based on vehicle range and fuel prices.
 *
 * Algorithm:
 * 1. Calculate max range and refuel threshold (85% of max range)
 * 2. Walk through route segments, accumulating distance
 * 3. When accumulated distance >= threshold, find nearby fuel stations
 * 4. Search radius: 2km → 5km → 10km expansion
 * 5. Rank stations by fuel price (lowest first)
 * 6. Return suggestions with station info, distance, reason, and expandedSearch flag
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.7
 */
export async function suggestRefuelStops(
  routeId: string,
  vehicleId: string
): Promise<RefuelSuggestion[]> {
  // Get route with segments
  const routeData = await getRoute(routeId);
  if (!routeData) {
    const error = new Error('Route not found');
    (error as any).statusCode = 404;
    throw error;
  }

  if (routeData.segments.length === 0) {
    const error = new Error('Route has no calculated segments. Please calculate the route first.');
    (error as any).statusCode = 400;
    throw error;
  }

  // Get vehicle profile
  const vehicle = await getProfile(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle profile not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const maxRange = calculateMaxRange(vehicle);
  const refuelThreshold = maxRange * REFUEL_THRESHOLD_FACTOR;
  const suggestions: RefuelSuggestion[] = [];

  let distanceSinceLastFuel = 0;
  let totalDistanceFromStart = 0;

  for (const segment of routeData.segments) {
    distanceSinceLastFuel += segment.distance_km;
    totalDistanceFromStart += segment.distance_km;

    if (distanceSinceLastFuel >= refuelThreshold) {
      // Find the search point — use waypoint coordinates if available
      let searchLat: number;
      let searchLng: number;

      // Try to get coordinates from the segment's end waypoint
      const endWaypoint = routeData.waypoints.find(
        (wp) => wp.id === segment.end_waypoint_id
      );
      if (endWaypoint) {
        searchLat = endWaypoint.latitude;
        searchLng = endWaypoint.longitude;
      } else {
        // Fallback: use the start waypoint or first waypoint
        const startWaypoint = routeData.waypoints.find(
          (wp) => wp.id === segment.start_waypoint_id
        );
        if (startWaypoint) {
          searchLat = startWaypoint.latitude;
          searchLng = startWaypoint.longitude;
        } else {
          // Last resort: use first waypoint
          searchLat = routeData.waypoints[0]?.latitude ?? 0;
          searchLng = routeData.waypoints[0]?.longitude ?? 0;
        }
      }

      // Find stations with progressive radius expansion
      const { stations, searchRadiusKm } = await findStationsWithExpansion(
        searchLat,
        searchLng,
        vehicle.fuel_type ?? 'petrol_95'
      );

      if (stations.length > 0) {
        // Enrich stations with fuel prices
        const enrichedStations = await enrichStationsWithPrices(
          stations,
          vehicle.fuel_type ?? 'petrol_95'
        );

        // Rank by fuel price (lowest first)
        enrichedStations.sort((a, b) => {
          const priceA = a.fuel_price_eur ?? Infinity;
          const priceB = b.fuel_price_eur ?? Infinity;
          return priceA - priceB;
        });

        suggestions.push({
          station: enrichedStations[0],
          alternatives: enrichedStations.slice(1, MAX_ALTERNATIVES + 1),
          distanceFromStart: totalDistanceFromStart,
          reason: 'range_warning',
          expandedSearch: searchRadiusKm > 5,
          searchRadiusKm,
        });

        // Reset distance counter after suggesting a stop
        distanceSinceLastFuel = 0;
      }
    }
  }

  return suggestions;
}

/**
 * Enriches fuel stations with current fuel prices for the given fuel type.
 */
async function enrichStationsWithPrices(
  stations: FuelStation[],
  fuelType: string
): Promise<FuelStation[]> {
  const enriched: FuelStation[] = [];

  for (const station of stations) {
    const price = await getPrice(station.country_code, fuelType);
    enriched.push({
      ...station,
      fuel_price_eur: price?.price_per_liter_eur ?? undefined,
    });
  }

  return enriched;
}

// ─── Accept / Reject ──────────────────────────────────────────────────────────

/**
 * Accepts a suggested refuel stop: adds the station as a waypoint on the route
 * and records the refuel stop.
 *
 * Requirements: 8.5
 */
export async function acceptStop(
  routeId: string,
  stationId: string
): Promise<RefuelStop> {
  // Verify route exists
  const routeData = await getRoute(routeId);
  if (!routeData) {
    const error = new Error('Route not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Get station info
  const stationResult = await query(
    'SELECT * FROM fuel_stations WHERE id = $1',
    [stationId]
  );
  if (stationResult.rows.length === 0) {
    const error = new Error('Fuel station not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const station = stationResult.rows[0];

  // Determine position in route (insert before destination)
  const destinationWaypoint = routeData.waypoints.find(
    (wp) => wp.waypoint_type === 'destination'
  );
  const position = destinationWaypoint
    ? destinationWaypoint.position
    : routeData.waypoints.length;

  return transaction(async (client: PoolClient) => {
    // Add station as a waypoint on the route
    // Shift existing waypoints at position >= target position upward
    await client.query(
      `UPDATE waypoints SET position = position + 1
       WHERE route_id = $1 AND position >= $2`,
      [routeId, position]
    );

    // Insert the fuel station as a waypoint
    await client.query(
      `INSERT INTO waypoints (route_id, position, label, latitude, longitude, place_id, formatted_address, waypoint_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'stop')`,
      [
        routeId,
        position,
        `Refuel: ${station.name}`,
        station.latitude,
        station.longitude,
        station.place_id,
        station.name,
      ]
    );

    // Record the refuel stop
    const refuelResult = await client.query(
      `INSERT INTO refuel_stops (route_id, fuel_station_id, position_in_route, fuel_price_eur, status)
       VALUES ($1, $2, $3, $4, 'accepted')
       RETURNING *`,
      [routeId, stationId, position, station.fuel_price_eur ?? null]
    );

    // Mark route as needing recalculation
    await client.query(
      `UPDATE routes SET status = 'draft', updated_at = NOW() WHERE id = $1`,
      [routeId]
    );

    return refuelResult.rows[0] as RefuelStop;
  });
}

/**
 * Rejects a suggested refuel stop and returns the next-best alternative.
 *
 * Requirements: 8.6
 */
export async function rejectStop(
  routeId: string,
  stationId: string
): Promise<RefuelSuggestion | null> {
  // Verify route exists
  const routeData = await getRoute(routeId);
  if (!routeData) {
    const error = new Error('Route not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Record the rejection
  await query(
    `INSERT INTO refuel_stops (route_id, fuel_station_id, position_in_route, status)
     VALUES ($1, $2, 0, 'rejected')
     ON CONFLICT DO NOTHING`,
    [routeId, stationId]
  );

  // Get the rejected station's location to find alternatives
  const stationResult = await query(
    'SELECT * FROM fuel_stations WHERE id = $1',
    [stationId]
  );
  if (stationResult.rows.length === 0) {
    return null;
  }

  const rejectedStation = stationResult.rows[0];

  // Find alternative stations near the rejected one, excluding the rejected station
  const { stations, searchRadiusKm } = await findStationsWithExpansion(
    parseFloat(rejectedStation.latitude),
    parseFloat(rejectedStation.longitude),
    'diesel' // Default fuel type; in practice would come from vehicle profile
  );

  // Filter out the rejected station and any previously rejected stations
  const rejectedResult = await query(
    `SELECT fuel_station_id FROM refuel_stops
     WHERE route_id = $1 AND status = 'rejected'`,
    [routeId]
  );
  const rejectedIds = new Set(rejectedResult.rows.map((r: any) => r.fuel_station_id));

  const availableStations = stations.filter((s) => !rejectedIds.has(s.id));

  if (availableStations.length === 0) {
    return null;
  }

  // Sort by price
  availableStations.sort((a, b) => {
    const priceA = a.fuel_price_eur ?? Infinity;
    const priceB = b.fuel_price_eur ?? Infinity;
    return priceA - priceB;
  });

  return {
    station: availableStations[0],
    alternatives: availableStations.slice(1, MAX_ALTERNATIVES + 1),
    distanceFromStart: 0, // Would need route context to calculate
    reason: 'range_warning',
    expandedSearch: searchRadiusKm > 5,
    searchRadiusKm,
  };
}
