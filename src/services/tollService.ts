/**
 * Toll Service
 * Fetches toll data from the Google Routes API computeRoutes endpoint
 * with extraComputations: ["TOLLS"] and parses the response into
 * categorized bridge and highway toll entries.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { LatLng } from '../models/route';
import {
  TollServiceResult,
  BridgeTollEntry,
  HighwayTollEntry,
  ParsedTollEntry,
} from '../models/roadCosts';

/** Timeout for the Google Routes API call in milliseconds. */
const API_TIMEOUT_MS = 10_000;

/** Google Routes API computeRoutes endpoint. */
const ROUTES_API_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Keywords that indicate a toll is for a bridge (case-insensitive match).
 */
const BRIDGE_KEYWORDS = ['bridge', 'tunnel', 'crossing'];

/**
 * Determine whether a toll name indicates a bridge toll.
 * Names containing "bridge", "tunnel", or "crossing" are categorized as bridge;
 * all others are categorized as highway.
 */
export function categorizeToll(name: string): 'bridge' | 'highway' {
  const lower = name.toLowerCase();
  return BRIDGE_KEYWORDS.some((kw) => lower.includes(kw))
    ? 'bridge'
    : 'highway';
}

/**
 * Parse a monetary value from the Google Routes API price format.
 * The API returns units as a string and optional nanos (billionths).
 */
export function parsePrice(units: string, nanos?: number): number {
  const unitValue = parseInt(units, 10) || 0;
  const nanoValue = (nanos || 0) / 1_000_000_000;
  return Math.round((unitValue + nanoValue) * 100) / 100;
}

/**
 * Parse the Google Routes API computeRoutes response to extract toll entries.
 * Extracts tolls from both route-level and per-leg travelAdvisory fields.
 */
export function parseTollResponse(responseBody: unknown): ParsedTollEntry[] {
  const entries: ParsedTollEntry[] = [];

  if (!responseBody || typeof responseBody !== 'object') {
    return entries;
  }

  const body = responseBody as Record<string, unknown>;
  const routes = body.routes as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(routes) || routes.length === 0) {
    return entries;
  }

  const route = routes[0];

  // Extract per-leg toll info
  const legs = route.legs as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(legs)) {
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const travelAdvisory = leg.travelAdvisory as
        | Record<string, unknown>
        | undefined;
      if (!travelAdvisory) continue;

      const tollInfo = travelAdvisory.tollInfo as
        | Record<string, unknown>
        | undefined;
      if (!tollInfo) continue;

      const estimatedPrice = tollInfo.estimatedPrice as
        | Array<Record<string, unknown>>
        | undefined;
      if (!Array.isArray(estimatedPrice)) continue;

      for (const price of estimatedPrice) {
        const currencyCode = price.currencyCode as string;
        const units = price.units as string;
        const nanos = price.nanos as number | undefined;
        const cost = parsePrice(units, nanos);

        const name = `Toll segment ${i + 1} (${currencyCode})`;
        entries.push({
          name,
          costEur: cost,
          category: categorizeToll(name),
        });
      }
    }
  }

  // If no per-leg tolls found, fall back to route-level toll info
  if (entries.length === 0) {
    const travelAdvisory = route.travelAdvisory as
      | Record<string, unknown>
      | undefined;
    if (travelAdvisory) {
      const tollInfo = travelAdvisory.tollInfo as
        | Record<string, unknown>
        | undefined;
      if (tollInfo) {
        const estimatedPrice = tollInfo.estimatedPrice as
          | Array<Record<string, unknown>>
          | undefined;
        if (Array.isArray(estimatedPrice)) {
          for (const price of estimatedPrice) {
            const currencyCode = price.currencyCode as string;
            const units = price.units as string;
            const nanos = price.nanos as number | undefined;
            const cost = parsePrice(units, nanos);

            const name = `Route toll (${currencyCode})`;
            entries.push({
              name,
              costEur: cost,
              category: categorizeToll(name),
            });
          }
        }
      }
    }
  }

  return entries;
}

/**
 * Build the request body for the Google Routes API computeRoutes endpoint.
 */
function buildRequestBody(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[]
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: { latitude: origin.latitude, longitude: origin.longitude },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.latitude,
          longitude: destination.longitude,
        },
      },
    },
    travelMode: 'DRIVE',
    extraComputations: ['TOLLS'],
    routeModifiers: {
      vehicleInfo: { emissionType: 'GASOLINE' },
    },
  };

  if (waypoints && waypoints.length > 0) {
    body.intermediates = waypoints.map((wp) => ({
      location: {
        latLng: { latitude: wp.latitude, longitude: wp.longitude },
      },
    }));
  }

  return body;
}

/**
 * Fetches toll data for a route from the Google Routes API.
 * Returns null if the API call fails or times out (>10s).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
export async function getTollsForRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[]
): Promise<TollServiceResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const requestBody = buildRequestBody(origin, destination, waypoints);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(ROUTES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.legs.travelAdvisory.tollInfo,routes.travelAdvisory.tollInfo',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const responseBody = await response.json();
    const parsedEntries = parseTollResponse(responseBody);

    const bridgeTolls: BridgeTollEntry[] = parsedEntries
      .filter((e) => e.category === 'bridge')
      .map((e) => ({ name: e.name, cost: e.costEur }));

    const highwayTolls: HighwayTollEntry[] = parsedEntries
      .filter((e) => e.category === 'highway')
      .map((e) => ({ segment: e.name, cost: e.costEur }));

    return { bridgeTolls, highwayTolls };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
