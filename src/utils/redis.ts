import { createClient, RedisClientType } from 'redis';

// ─── TTL Constants (in seconds) ───────────────────────────────────────────────

export const CACHE_TTL = {
  FUEL_PRICE: 6 * 60 * 60, // 6 hours
  ROUTE_CALC: 60 * 60, // 1 hour
  SESSION: 24 * 60 * 60, // 24 hours
  RATE_LIMIT: 60, // 1 minute
  LOGIN_ATTEMPTS: 15 * 60, // 15 minutes
  PLACES_AUTOCOMPLETE: 30 * 60, // 30 minutes
  VIGNETTE_PRICES: 24 * 60 * 60, // 24 hours
  VIGNETTE_COUNTRIES: 24 * 60 * 60, // 24 hours
  VIGNETTE_ROUTE: 60 * 60, // 1 hour
} as const;

// ─── Key Pattern Builders ─────────────────────────────────────────────────────

export const CACHE_KEYS = {
  fuelPrice: (country: string, fuelType: string) =>
    `fuel:price:${country}:${fuelType}`,

  routeCalc: (routeId: string) => `route:calc:${routeId}`,

  session: (userId: string) => `session:${userId}`,

  rateLimit: (userId: string) => `rate_limit:${userId}`,

  loginAttempts: (email: string) => `login_attempts:${email}`,

  placesAutocomplete: (queryHash: string) =>
    `places:autocomplete:${queryHash}`,

  vignettePrices: (country: string, vehicleType: string) =>
    `vignette:prices:${country}:${vehicleType}`,

  vignetteCountries: () => `vignette:countries`,

  vignetteRoute: (routeId: string) => `vignette:route:${routeId}`,
} as const;

// ─── Redis Client Singleton ───────────────────────────────────────────────────

let client: RedisClientType | null = null;
let isConnecting = false;

/**
 * Get or create the Redis client singleton.
 * Connects lazily on first call.
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (client && client.isOpen) {
    return client;
  }

  if (isConnecting) {
    // Wait for the ongoing connection attempt
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (client && client.isOpen) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
    return client!;
  }

  isConnecting = true;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          return new Error('Redis max reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      },
      connectTimeout: 5000,
    },
  }) as RedisClientType;

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  client.on('ready', () => {
    console.info('[Redis] Connected and ready');
  });

  try {
    await client.connect();
  } catch (err) {
    client = null;
    isConnecting = false;
    throw err;
  }

  isConnecting = false;
  return client;
}

/**
 * Disconnect the Redis client gracefully.
 */
export async function disconnectRedis(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
  }
}

// ─── Cache Helper Functions ───────────────────────────────────────────────────

/**
 * Get a value from Redis, automatically deserializing JSON.
 * Returns null if the key doesn't exist or on error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redisClient = await getRedisClient();
    const value = await redisClient.get(key);
    if (value === null) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (err) {
    console.error(`[Redis] Error getting key "${key}":`, (err as Error).message);
    return null;
  }
}

/**
 * Set a value in Redis with automatic JSON serialization and TTL.
 * @param key - The cache key
 * @param value - The value to store (will be JSON-serialized)
 * @param ttlSeconds - Time-to-live in seconds
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<boolean> {
  try {
    const redisClient = await getRedisClient();
    const serialized = JSON.stringify(value);
    await redisClient.set(key, serialized, { EX: ttlSeconds });
    return true;
  } catch (err) {
    console.error(`[Redis] Error setting key "${key}":`, (err as Error).message);
    return false;
  }
}

/**
 * Delete a key from Redis.
 * Returns true if the key was deleted, false otherwise.
 */
export async function cacheDelete(key: string): Promise<boolean> {
  try {
    const redisClient = await getRedisClient();
    const result = await redisClient.del(key);
    return result > 0;
  } catch (err) {
    console.error(`[Redis] Error deleting key "${key}":`, (err as Error).message);
    return false;
  }
}

/**
 * Increment a numeric value in Redis.
 * If the key doesn't exist, it's initialized to 0 before incrementing.
 * Optionally sets a TTL if the key is new (counter == 1).
 * @returns The new value after incrementing, or null on error.
 */
export async function cacheIncrement(
  key: string,
  ttlSeconds?: number
): Promise<number | null> {
  try {
    const redisClient = await getRedisClient();
    const newValue = await redisClient.incr(key);

    // Set TTL only on first increment (key was just created)
    if (newValue === 1 && ttlSeconds !== undefined) {
      await redisClient.expire(key, ttlSeconds);
    }

    return newValue;
  } catch (err) {
    console.error(
      `[Redis] Error incrementing key "${key}":`,
      (err as Error).message
    );
    return null;
  }
}
