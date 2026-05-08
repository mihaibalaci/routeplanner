import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  autocomplete,
  setPlacesClient,
  IGooglePlacesClient,
  PlaceSuggestion,
  EUROPEAN_COUNTRY_CODES,
  MIN_QUERY_LENGTH,
} from './placesService';

/** Mock Google Places client for testing */
class MockPlacesClient implements IGooglePlacesClient {
  public lastQuery: string | null = null;
  public lastCountries: string[] | null = null;
  public mockResponse: PlaceSuggestion[] = [];
  public shouldThrow: Error | null = null;

  async autocomplete(
    query: string,
    countries: string[]
  ): Promise<PlaceSuggestion[]> {
    this.lastQuery = query;
    this.lastCountries = countries;

    if (this.shouldThrow) {
      throw this.shouldThrow;
    }

    return this.mockResponse;
  }
}

describe('placesService', () => {
  let mockClient: MockPlacesClient;

  beforeEach(() => {
    mockClient = new MockPlacesClient();
    setPlacesClient(mockClient);
  });

  afterEach(() => {
    setPlacesClient(mockClient); // reset
  });

  describe('autocomplete', () => {
    it('returns empty suggestions for empty query', async () => {
      const result = await autocomplete('');
      expect(result.suggestions).toEqual([]);
      expect(mockClient.lastQuery).toBeNull(); // API not called
    });

    it('returns empty suggestions for query with only spaces', async () => {
      const result = await autocomplete('   ');
      expect(result.suggestions).toEqual([]);
      expect(mockClient.lastQuery).toBeNull();
    });

    it('returns empty suggestions for query shorter than 3 characters', async () => {
      const result = await autocomplete('ab');
      expect(result.suggestions).toEqual([]);
      expect(mockClient.lastQuery).toBeNull();
    });

    it('returns empty suggestions for query of exactly 2 characters', async () => {
      const result = await autocomplete('Pa');
      expect(result.suggestions).toEqual([]);
      expect(mockClient.lastQuery).toBeNull();
    });

    it('calls API for query of exactly 3 characters', async () => {
      mockClient.mockResponse = [
        {
          placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
          description: 'Paris, France',
          mainText: 'Paris',
          secondaryText: 'France',
        },
      ];

      const result = await autocomplete('Par');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].placeId).toBe('ChIJD7fiBh9u5kcRYJSMaMOCCwQ');
      expect(mockClient.lastQuery).toBe('Par');
    });

    it('calls API for query longer than 3 characters', async () => {
      mockClient.mockResponse = [
        {
          placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
          description: 'Paris, France',
          mainText: 'Paris',
          secondaryText: 'France',
        },
        {
          placeId: 'ChIJAVkDPzdOqEcRcDteW0YgIQQ',
          description: 'Parma, Province of Parma, Italy',
          mainText: 'Parma',
          secondaryText: 'Province of Parma, Italy',
        },
      ];

      const result = await autocomplete('Pari');
      expect(result.suggestions).toHaveLength(2);
      expect(mockClient.lastQuery).toBe('Pari');
    });

    it('trims whitespace from query before checking length', async () => {
      mockClient.mockResponse = [];

      const result = await autocomplete('  Par  ');
      expect(result.suggestions).toEqual([]);
      expect(mockClient.lastQuery).toBe('Par');
    });

    it('restricts to European countries', async () => {
      mockClient.mockResponse = [];

      await autocomplete('Berlin');
      expect(mockClient.lastCountries).toEqual(EUROPEAN_COUNTRY_CODES);
    });

    it('returns empty suggestions when API returns no results', async () => {
      mockClient.mockResponse = [];

      const result = await autocomplete('xyznonexistent');
      expect(result.suggestions).toEqual([]);
    });

    it('throws on API error', async () => {
      mockClient.shouldThrow = new Error('Google Places API error: 500');

      await expect(autocomplete('Berlin')).rejects.toThrow(
        'Google Places API error: 500'
      );
    });

    it('returns properly structured suggestions', async () => {
      mockClient.mockResponse = [
        {
          placeId: 'place123',
          description: 'Berlin, Germany',
          mainText: 'Berlin',
          secondaryText: 'Germany',
        },
      ];

      const result = await autocomplete('Ber');
      expect(result.suggestions[0]).toEqual({
        placeId: 'place123',
        description: 'Berlin, Germany',
        mainText: 'Berlin',
        secondaryText: 'Germany',
      });
    });
  });

  describe('constants', () => {
    it('has 40 European country codes', () => {
      expect(EUROPEAN_COUNTRY_CODES).toHaveLength(40);
    });

    it('includes major European countries', () => {
      expect(EUROPEAN_COUNTRY_CODES).toContain('de');
      expect(EUROPEAN_COUNTRY_CODES).toContain('fr');
      expect(EUROPEAN_COUNTRY_CODES).toContain('it');
      expect(EUROPEAN_COUNTRY_CODES).toContain('es');
      expect(EUROPEAN_COUNTRY_CODES).toContain('gb');
    });

    it('minimum query length is 3', () => {
      expect(MIN_QUERY_LENGTH).toBe(3);
    });
  });
});
