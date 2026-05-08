/**
 * Route, Waypoint, and RouteSegment model type definitions
 * matching the PostgreSQL schema from the design document.
 */

export interface Route {
  id: string;
  user_id: string;
  name: string | null;
  total_distance_km: number | null;
  total_duration_seconds: number | null;
  polyline_encoded: string | null;
  status: 'draft' | 'calculated' | 'finalized';
  created_at: Date;
  updated_at: Date;
}

export type WaypointType = 'origin' | 'stop' | 'destination';

export interface Waypoint {
  id: string;
  route_id: string;
  position: number;
  label: string | null;
  latitude: number;
  longitude: number;
  place_id: string | null;
  formatted_address: string | null;
  waypoint_type: WaypointType;
}

export interface RouteSegment {
  id: string;
  route_id: string;
  segment_index: number;
  start_waypoint_id: string | null;
  end_waypoint_id: string | null;
  distance_km: number;
  duration_seconds: number;
  country_code: string;
  polyline_encoded: string | null;
}

export interface CreateRouteInput {
  userId: string;
  name?: string;
  waypoints: CreateWaypointInput[];
}

export interface CreateWaypointInput {
  position?: number;
  label?: string;
  latitude: number;
  longitude: number;
  place_id?: string;
  formatted_address?: string;
  waypoint_type: WaypointType;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  place_id: string;
  formatted_address: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteWithDetails {
  route: Route;
  waypoints: Waypoint[];
  segments: RouteSegment[];
}

export interface UpdateRouteInput {
  name?: string;
  total_distance_km?: number;
  total_duration_seconds?: number;
  polyline_encoded?: string;
  status?: 'draft' | 'calculated' | 'finalized';
}
