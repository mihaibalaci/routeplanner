/**
 * RefuelStop and RefuelSuggestion model type definitions
 * matching the PostgreSQL refuel_stops table and the Refuel Advisor service interface.
 */

export type RefuelStopStatus = 'suggested' | 'accepted' | 'rejected';

/**
 * Database representation of a refuel stop.
 */
export interface RefuelStop {
  id: string;
  route_id: string;
  fuel_station_id: string;
  position_in_route: number;
  fuel_price_eur: number | null;
  status: RefuelStopStatus;
  created_at: Date;
}

/**
 * Fuel station record from the fuel_stations table.
 */
export interface FuelStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country_code: string;
  place_id: string | null;
  fuel_types_available: string[];
  distance_from_route_km?: number;
  fuel_price_eur?: number;
}

/**
 * A refuel suggestion returned by the Refuel Advisor service.
 */
export interface RefuelSuggestion {
  station: FuelStation;
  alternatives: FuelStation[];
  distanceFromStart: number;
  reason: 'range_warning' | 'price_opportunity';
  expandedSearch: boolean;
  searchRadiusKm: number;
}

/**
 * Input for creating a refuel stop record.
 */
export interface CreateRefuelStopInput {
  route_id: string;
  fuel_station_id: string;
  position_in_route: number;
  fuel_price_eur?: number;
  status?: RefuelStopStatus;
}
