/**
 * Places Autocomplete Service
 *
 * Provides place autocomplete suggestions restricted to European countries
 * using the Google Maps Places Autocomplete API.
 */

/** European country codes for autocomplete restriction */
export const EUROPEAN_COUNTRY_CODES = [
  'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr',
  'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl',
  'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'gb', 'no', 'ch',
  'is', 'li', 'md', 'ua', 'rs', 'ba', 'me', 'mk', 'al', 'xk',
];

/** Minimum query length to trigger autocomplete */
export const MIN_QUERY_LENGTH = 3;

/** Shape of a single autocomplete suggestion */
export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

/** Response from the autocomplete function */
export interface AutocompleteResult {
  suggestions: PlaceSuggestion[];
}

/**
 * Interface for the Google Maps Places API client.
 * Allows dependency injection for testing.
 */
export interface IGooglePlacesClient {
  autocomplete(
    query: string,
    countries: string[]
  ): Promise<PlaceSuggestion[]>;
}

/**
 * Default Google Places client that calls the real Google Maps Places API.
 */
export class GooglePlacesClient implements IGooglePlacesClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_MAPS_API_KEY || '';
  }

  async autocomplete(
    query: string,
    countries: string[]
  ): Promise<PlaceSuggestion[]> {
    const components = countries.map((c) => `country:${c}`).join('|');
    const params = new URLSearchParams({
      input: query,
      components,
      key: this.apiKey,
    });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      status: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting?: {
          main_text?: string;
          secondary_text?: string;
        };
      }>;
    };

    if (data.status === 'ZERO_RESULTS' || !data.predictions || data.predictions.length === 0) {
      return [];
    }

    if (data.status !== 'OK') {
      throw new Error(`Google Places API returned status: ${data.status}`);
    }

    return data.predictions.map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text || prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text || '',
    }));
  }
}

/** Singleton client instance — can be replaced for testing */
let placesClient: IGooglePlacesClient = new GooglePlacesClient();

/**
 * Set the places client (useful for dependency injection in tests).
 */
export function setPlacesClient(client: IGooglePlacesClient): void {
  placesClient = client;
}

/**
 * Get the current places client.
 */
export function getPlacesClient(): IGooglePlacesClient {
  return placesClient;
}

/**
 * Perform a place autocomplete search.
 *
 * - Returns empty suggestions if query length < 3 characters
 * - Restricts results to European countries
 * - Handles no-results gracefully (returns empty array)
 * - Throws on API errors
 */
export async function autocomplete(query: string): Promise<AutocompleteResult> {
  // Return empty result for queries shorter than minimum length
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    return { suggestions: [] };
  }

  try {
    const suggestions = await placesClient.autocomplete(
      query.trim(),
      EUROPEAN_COUNTRY_CODES
    );
    return { suggestions };
  } catch (error) {
    // Re-throw API errors so the route handler can respond appropriately
    throw error;
  }
}
