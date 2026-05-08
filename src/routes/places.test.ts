import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import placesRouter from './places';
import { setPlacesClient, IGooglePlacesClient, PlaceSuggestion } from '../services/placesService';

/** Mock Google Places client */
class MockPlacesClient implements IGooglePlacesClient {
  public mockResponse: PlaceSuggestion[] = [];
  public shouldThrow: Error | null = null;

  async autocomplete(
    _query: string,
    _countries: string[]
  ): Promise<PlaceSuggestion[]> {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    return this.mockResponse;
  }
}

describe('GET /autocomplete', () => {
  let app: express.Application;
  let mockClient: MockPlacesClient;

  beforeEach(() => {
    mockClient = new MockPlacesClient();
    setPlacesClient(mockClient);

    app = express();
    app.use(express.json());
    // Simulate requestId middleware
    app.use((req, _res, next) => {
      (req as any).requestId = 'test-request-id';
      next();
    });
    app.use('/', placesRouter);
  });

  it('returns 400 when q parameter is missing', async () => {
    const res = await request(app).get('/autocomplete');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.message).toBe('Missing required query parameter: q');
  });

  it('returns 200 with empty suggestions for query shorter than 3 chars', async () => {
    const res = await request(app).get('/autocomplete?q=ab');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.suggestions).toEqual([]);
  });

  it('returns 200 with empty suggestions for empty q parameter', async () => {
    const res = await request(app).get('/autocomplete?q=');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.suggestions).toEqual([]);
  });

  it('returns 200 with suggestions for valid query', async () => {
    mockClient.mockResponse = [
      {
        placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
        description: 'Paris, France',
        mainText: 'Paris',
        secondaryText: 'France',
      },
    ];

    const res = await request(app).get('/autocomplete?q=Paris');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(1);
    expect(res.body.data.suggestions[0]).toEqual({
      placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
      description: 'Paris, France',
      mainText: 'Paris',
      secondaryText: 'France',
    });
  });

  it('returns 200 with empty suggestions when no results found', async () => {
    mockClient.mockResponse = [];

    const res = await request(app).get('/autocomplete?q=xyznonexistent');

    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toEqual([]);
  });

  it('returns 500 when API throws an error', async () => {
    mockClient.shouldThrow = new Error('API failure');

    const res = await request(app).get('/autocomplete?q=Berlin');

    expect(res.status).toBe(500);
    expect(res.body.status).toBe(500);
    expect(res.body.message).toBe('Failed to fetch autocomplete suggestions');
  });

  it('includes requestId in all responses', async () => {
    const res = await request(app).get('/autocomplete?q=test');

    expect(res.body.requestId).toBe('test-request-id');
  });

  it('returns multiple suggestions', async () => {
    mockClient.mockResponse = [
      {
        placeId: 'place1',
        description: 'Berlin, Germany',
        mainText: 'Berlin',
        secondaryText: 'Germany',
      },
      {
        placeId: 'place2',
        description: 'Bern, Switzerland',
        mainText: 'Bern',
        secondaryText: 'Switzerland',
      },
      {
        placeId: 'place3',
        description: 'Bergen, Norway',
        mainText: 'Bergen',
        secondaryText: 'Norway',
      },
    ];

    const res = await request(app).get('/autocomplete?q=Ber');

    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(3);
  });
});
