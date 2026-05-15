/**
 * Google Maps integration service.
 * Wraps the Google Maps Directions, Places, and Geocoding APIs.
 * Uses GOOGLE_MAPS_API_KEY env var for authentication.
 *
 * Requirements: 1.1, 1.2, 1.7, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {
  Client,
  TravelMode,
  DirectionsResponse,
  DirectionsRoute,
  GeocodeResponse,
  ReverseGeocodeResponse,
  Status,
  AddressType,
  LatLng as GMapsLatLng,
} from '@googlemaps/google-maps-services-js';
import { GeocodingResult, LatLng, RouteSegment } from '../models/route';

export interface DirectionsRequest {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  alternatives?: boolean;
}

export interface ParsedRoute {
  segments: RouteSegment[];
  total_distance_km: number;
  total_duration_seconds: number;
  polyline_encoded: string;
}

export class GoogleMapsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'GoogleMapsServiceError';
  }
}

export class GoogleMapsService {
  private client: Client;
  private apiKey: string;

  constructor(client?: Client, apiKey?: string) {
    this.client = client || new Client({});
    this.apiKey = apiKey || process.env.GOOGLE_MAPS_API_KEY || '';
  }

  /**
   * Geocode an address string into coordinates.
   * Returns lat/lng, place_id, and formatted_address.
   * Throws GoogleMapsServiceError on failure (Requirement 1.7).
   */
  async geocode(address: string): Promise<GeocodingResult> {
    if (!address || address.trim().length === 0) {
      throw new GoogleMapsServiceError(
        'Address cannot be empty',
        'INVALID_INPUT'
      );
    }

    try {
      const response: GeocodeResponse = await this.client.geocode({
        params: {
          address: address.trim(),
          key: this.apiKey,
        },
      });

      if (
        response.data.status !== Status.OK ||
        !response.data.results ||
        response.data.results.length === 0
      ) {
        throw new GoogleMapsServiceError(
          `Could not find location for: "${address}"`,
          'GEOCODING_FAILED'
        );
      }

      const result = response.data.results[0];
      return {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        place_id: result.place_id,
        formatted_address: result.formatted_address,
      };
    } catch (error) {
      if (error instanceof GoogleMapsServiceError) {
        throw error;
      }
      throw new GoogleMapsServiceError(
        `Geocoding failed for "${address}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GEOCODING_ERROR'
      );
    }
  }

  /**
   * Request driving directions between origin and destination with optional waypoints.
   * Uses driving mode (Requirement 4.2).
   * Supports alternatives parameter (Requirement 4.3).
   * Returns the fastest route by default.
   */
  async getDirections(request: DirectionsRequest): Promise<DirectionsRoute[]> {
    try {
      const waypoints: GMapsLatLng[] | undefined = request.waypoints?.map((wp) => ({
        lat: wp.latitude,
        lng: wp.longitude,
      }));

      const params: any = {
        origin: {
          lat: request.origin.latitude,
          lng: request.origin.longitude,
        },
        destination: {
          lat: request.destination.latitude,
          lng: request.destination.longitude,
        },
        mode: TravelMode.driving,
        alternatives: request.alternatives ?? false,
        key: this.apiKey,
      };

      // Only include waypoints if there are any (passing undefined causes a crash)
      if (waypoints && waypoints.length > 0) {
        params.waypoints = waypoints;
      }

      const response: DirectionsResponse = await this.client.directions({ params });

      if (
        response.data.status !== Status.OK ||
        !response.data.routes ||
        response.data.routes.length === 0
      ) {
        throw new GoogleMapsServiceError(
          'Could not calculate route between the specified locations',
          'DIRECTIONS_FAILED'
        );
      }

      return response.data.routes;
    } catch (error) {
      if (error instanceof GoogleMapsServiceError) {
        throw error;
      }
      throw new GoogleMapsServiceError(
        `Directions request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DIRECTIONS_ERROR'
      );
    }
  }

  /**
   * Get the fastest route from a directions result.
   * Selects the route with the shortest total duration (Requirement 4.3).
   */
  selectFastestRoute(routes: DirectionsRoute[]): DirectionsRoute {
    if (routes.length === 0) {
      throw new GoogleMapsServiceError(
        'No routes available to select from',
        'NO_ROUTES'
      );
    }

    if (routes.length === 1) {
      return routes[0];
    }

    return routes.reduce((fastest, current) => {
      const fastestDuration = fastest.legs.reduce(
        (sum, leg) => sum + (leg.duration?.value || 0),
        0
      );
      const currentDuration = current.legs.reduce(
        (sum, leg) => sum + (leg.duration?.value || 0),
        0
      );
      return currentDuration < fastestDuration ? current : fastest;
    });
  }

  /**
   * Parse a Google Maps DirectionsRoute into RouteSegment objects.
   * Each leg becomes a segment with per-segment distance_km and duration_seconds.
   * Extracts country_code from end address of each leg (Requirement 4.5).
   */
  parseRouteSegments(
    route: DirectionsRoute,
    routeId: string
  ): ParsedRoute {
    const segments: RouteSegment[] = [];
    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;

    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      const distanceKm = (leg.distance?.value || 0) / 1000;
      const durationSeconds = leg.duration?.value || 0;

      totalDistanceKm += distanceKm;
      totalDurationSeconds += durationSeconds;

      const countryCode = this.extractCountryCode(leg.end_address || '');

      const segment: RouteSegment = {
        id: '', // Will be assigned by the database
        route_id: routeId,
        segment_index: i,
        start_waypoint_id: null,
        end_waypoint_id: null,
        distance_km: Math.round(distanceKm * 100) / 100,
        duration_seconds: durationSeconds,
        country_code: countryCode,
        polyline_encoded: leg.steps
          ? leg.steps.map((s) => s.polyline?.points || '').join('')
          : null,
      };

      segments.push(segment);
    }

    return {
      segments,
      total_distance_km: Math.round(totalDistanceKm * 100) / 100,
      total_duration_seconds: totalDurationSeconds,
      polyline_encoded: route.overview_polyline?.points || '',
    };
  }

  /**
   * Extract country code from a formatted address string.
   * The country is typically the last component of a Google Maps formatted address.
   * Falls back to 'XX' if extraction fails.
   */
  extractCountryCode(formattedAddress: string): string {
    if (!formattedAddress) {
      return 'XX';
    }

    // Google Maps formatted addresses typically end with the country name
    const parts = formattedAddress.split(',').map((p) => p.trim());
    const countryName = parts[parts.length - 1];

    // Map common European country names to ISO 3166-1 alpha-2 codes
    const countryMap: Record<string, string> = {
      Austria: 'AT',
      Belgium: 'BE',
      Bulgaria: 'BG',
      Croatia: 'HR',
      'Czech Republic': 'CZ',
      Czechia: 'CZ',
      Denmark: 'DK',
      Estonia: 'EE',
      Finland: 'FI',
      France: 'FR',
      Germany: 'DE',
      Greece: 'GR',
      Hungary: 'HU',
      Ireland: 'IE',
      Italy: 'IT',
      Latvia: 'LV',
      Lithuania: 'LT',
      Luxembourg: 'LU',
      Moldova: 'MD',
      Netherlands: 'NL',
      Norway: 'NO',
      Poland: 'PL',
      Portugal: 'PT',
      Romania: 'RO',
      Serbia: 'RS',
      Slovakia: 'SK',
      Slovenia: 'SI',
      Spain: 'ES',
      Sweden: 'SE',
      Switzerland: 'CH',
      'United Kingdom': 'GB',
      UK: 'GB',
    };

    return countryMap[countryName] || 'XX';
  }

  /**
   * Reverse geocode coordinates to get the country code.
   * Used as a fallback when address parsing doesn't yield a country.
   */
  async reverseGeocodeCountry(location: LatLng): Promise<string> {
    try {
      const response: ReverseGeocodeResponse =
        await this.client.reverseGeocode({
          params: {
            latlng: { lat: location.latitude, lng: location.longitude },
            result_type: [AddressType.country],
            key: this.apiKey,
          },
        });

      if (
        response.data.status !== Status.OK ||
        !response.data.results ||
        response.data.results.length === 0
      ) {
        return 'XX';
      }

      const countryResult = response.data.results[0];
      const countryComponent = countryResult.address_components?.find(
        (c: { types: string[]; short_name: string }) =>
          c.types.includes('country')
      );

      return countryComponent?.short_name || 'XX';
    } catch {
      return 'XX';
    }
  }
}

// Singleton instance for use across the application
let _instance: GoogleMapsService | null = null;

export function getGoogleMapsService(): GoogleMapsService {
  if (!_instance) {
    _instance = new GoogleMapsService();
  }
  return _instance;
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetGoogleMapsService(): void {
  _instance = null;
}
