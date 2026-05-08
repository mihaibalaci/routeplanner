/**
 * ChargeMap integration service.
 * Retrieves charging station data from the ChargeMap public API.
 * Uses CHARGEMAP_API_URL env var for the base URL.
 *
 * Requirements: 8.2, 8.3
 */

export interface ChargingStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  connectorTypes: string[];
  availability?: 'available' | 'occupied' | 'unknown';
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

const DEFAULT_CHARGEMAP_API_URL = 'https://api.chargemap.com/v1';
const REQUEST_TIMEOUT_MS = 10000;

function getBaseUrl(): string {
  return process.env.CHARGEMAP_API_URL || DEFAULT_CHARGEMAP_API_URL;
}

/**
 * Fetch charging stations within a bounding box from the ChargeMap API.
 * Returns an empty array on any error (network, API error, timeout).
 */
export async function fetchChargingStations(bbox: BoundingBox): Promise<ChargingStation[]> {
  try {
    const baseUrl = getBaseUrl();
    const url = new URL('/v1/stations', baseUrl);
    url.searchParams.set('north', String(bbox.north));
    url.searchParams.set('south', String(bbox.south));
    url.searchParams.set('east', String(bbox.east));
    url.searchParams.set('west', String(bbox.west));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((station: Record<string, unknown>) => ({
      id: String(station.id || ''),
      name: String(station.name || ''),
      latitude: Number(station.latitude || station.lat || 0),
      longitude: Number(station.longitude || station.lng || 0),
      connectorTypes: Array.isArray(station.connectorTypes)
        ? station.connectorTypes.map(String)
        : Array.isArray(station.connector_types)
          ? station.connector_types.map(String)
          : [],
      availability: parseAvailability(station.availability),
    }));
  } catch {
    return [];
  }
}

/**
 * Check if the ChargeMap API is available.
 * Makes a lightweight health check request and returns true/false.
 */
export async function isApiAvailable(): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    const url = new URL('/v1/status', baseUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return response.ok;
  } catch {
    return false;
  }
}

function parseAvailability(
  value: unknown
): 'available' | 'occupied' | 'unknown' | undefined {
  if (value === 'available' || value === 'occupied' || value === 'unknown') {
    return value;
  }
  return undefined;
}
