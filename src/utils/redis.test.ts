import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CACHE_TTL, CACHE_KEYS } from './redis';

// ─── Tests for CACHE_TTL constants ────────────────────────────────────────────

describe('CACHE_TTL', () => {
  it('should define fuel price TTL as 6 hours in seconds', () => {
    expect(CACHE_TTL.FUEL_PRICE).toBe(21600);
  });

  it('should define route calc TTL as 1 hour in seconds', () => {
    expect(CACHE_TTL.ROUTE_CALC).toBe(3600);
  });

  it('should define session TTL as 24 hours in seconds', () => {
    expect(CACHE_TTL.SESSION).toBe(86400);
  });

  it('should define rate limit TTL as 1 minute in seconds', () => {
    expect(CACHE_TTL.RATE_LIMIT).toBe(60);
  });

  it('should define login attempts TTL as 15 minutes in seconds', () => {
    expect(CACHE_TTL.LOGIN_ATTEMPTS).toBe(900);
  });

  it('should define places autocomplete TTL as 30 minutes in seconds', () => {
    expect(CACHE_TTL.PLACES_AUTOCOMPLETE).toBe(1800);
  });

  it('should define vignette prices TTL as 24 hours in seconds', () => {
    expect(CACHE_TTL.VIGNETTE_PRICES).toBe(86400);
  });

  it('should define vignette countries TTL as 24 hours in seconds', () => {
    expect(CACHE_TTL.VIGNETTE_COUNTRIES).toBe(86400);
  });

  it('should define vignette route TTL as 1 hour in seconds', () => {
    expect(CACHE_TTL.VIGNETTE_ROUTE).toBe(3600);
  });
});

// ─── Tests for CACHE_KEYS builders ───────────────────────────────────────────

describe('CACHE_KEYS', () => {
  describe('fuelPrice', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.fuelPrice('DE', 'diesel')).toBe('fuel:price:DE:diesel');
      expect(CACHE_KEYS.fuelPrice('FR', 'petrol_95')).toBe(
        'fuel:price:FR:petrol_95'
      );
    });
  });

  describe('routeCalc', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.routeCalc('abc-123')).toBe('route:calc:abc-123');
    });
  });

  describe('session', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.session('user-456')).toBe('session:user-456');
    });
  });

  describe('rateLimit', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.rateLimit('user-789')).toBe('rate_limit:user-789');
    });
  });

  describe('loginAttempts', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.loginAttempts('test@example.com')).toBe(
        'login_attempts:test@example.com'
      );
    });
  });

  describe('placesAutocomplete', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.placesAutocomplete('hash123')).toBe(
        'places:autocomplete:hash123'
      );
    });
  });

  describe('vignettePrices', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.vignettePrices('AT', 'car')).toBe(
        'vignette:prices:AT:car'
      );
      expect(CACHE_KEYS.vignettePrices('CH', 'motorcycle')).toBe(
        'vignette:prices:CH:motorcycle'
      );
    });
  });

  describe('vignetteCountries', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.vignetteCountries()).toBe('vignette:countries');
    });
  });

  describe('vignetteRoute', () => {
    it('should generate correct key pattern', () => {
      expect(CACHE_KEYS.vignetteRoute('route-xyz')).toBe(
        'vignette:route:route-xyz'
      );
    });
  });
});

// ─── Tests for cache helper functions (with mocked Redis client) ─────────────

describe('Cache helper functions', () => {
  const mockClient = {
    isOpen: true,
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('redis', () => ({
      createClient: () => mockClient,
    }));
    mockClient.isOpen = true;
    mockClient.get.mockReset();
    mockClient.set.mockReset();
    mockClient.del.mockReset();
    mockClient.incr.mockReset();
    mockClient.expire.mockReset();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.quit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cacheGet', () => {
    it('should return parsed JSON value for existing key', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ price: 1.45 }));

      const { cacheGet, getRedisClient } = await import('./redis');
      // Force the module to use our mock client
      await getRedisClient();
      const result = await cacheGet<{ price: number }>('fuel:price:DE:diesel');

      expect(result).toEqual({ price: 1.45 });
    });

    it('should return null for non-existing key', async () => {
      mockClient.get.mockResolvedValue(null);

      const { cacheGet } = await import('./redis');
      const result = await cacheGet('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockClient.get.mockRejectedValue(new Error('Connection lost'));

      const { cacheGet } = await import('./redis');
      const result = await cacheGet('some-key');

      expect(result).toBeNull();
    });
  });

  describe('cacheSet', () => {
    it('should serialize value and set with TTL', async () => {
      mockClient.set.mockResolvedValue('OK');

      const { cacheSet } = await import('./redis');
      const result = await cacheSet('test-key', { data: 'hello' }, 3600);

      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({ data: 'hello' }),
        { EX: 3600 }
      );
    });

    it('should return false on error', async () => {
      mockClient.set.mockRejectedValue(new Error('Connection lost'));

      const { cacheSet } = await import('./redis');
      const result = await cacheSet('test-key', 'value', 60);

      expect(result).toBe(false);
    });
  });

  describe('cacheDelete', () => {
    it('should return true when key is deleted', async () => {
      mockClient.del.mockResolvedValue(1);

      const { cacheDelete } = await import('./redis');
      const result = await cacheDelete('test-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockClient.del.mockResolvedValue(0);

      const { cacheDelete } = await import('./redis');
      const result = await cacheDelete('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockClient.del.mockRejectedValue(new Error('Connection lost'));

      const { cacheDelete } = await import('./redis');
      const result = await cacheDelete('test-key');

      expect(result).toBe(false);
    });
  });

  describe('cacheIncrement', () => {
    it('should increment and set TTL on first call', async () => {
      mockClient.incr.mockResolvedValue(1);
      mockClient.expire.mockResolvedValue(true);

      const { cacheIncrement } = await import('./redis');
      const result = await cacheIncrement('rate_limit:user1', 60);

      expect(result).toBe(1);
      expect(mockClient.incr).toHaveBeenCalledWith('rate_limit:user1');
      expect(mockClient.expire).toHaveBeenCalledWith('rate_limit:user1', 60);
    });

    it('should increment without setting TTL on subsequent calls', async () => {
      mockClient.incr.mockResolvedValue(5);

      const { cacheIncrement } = await import('./redis');
      const result = await cacheIncrement('rate_limit:user1', 60);

      expect(result).toBe(5);
      expect(mockClient.expire).not.toHaveBeenCalled();
    });

    it('should increment without TTL when ttlSeconds not provided', async () => {
      mockClient.incr.mockResolvedValue(1);

      const { cacheIncrement } = await import('./redis');
      const result = await cacheIncrement('counter:key');

      expect(result).toBe(1);
      expect(mockClient.expire).not.toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      mockClient.incr.mockRejectedValue(new Error('Connection lost'));

      const { cacheIncrement } = await import('./redis');
      const result = await cacheIncrement('test-key');

      expect(result).toBeNull();
    });
  });
});
