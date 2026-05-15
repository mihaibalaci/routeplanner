import { Router, Request, Response } from 'express';
import { getPrice, FUEL_TYPES } from '../services/fuelPriceService';
import { findStationsNearPoint } from '../services/refuelAdvisorService';
import { query } from '../utils/database';

const router = Router();

/**
 * GET /api/v1/fuel/prices/latest
 * Returns the latest average fuel/energy prices (no auth required).
 * Used for the Route Planner info badge.
 */
router.get('/prices/latest', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT fuel_type, ROUND(AVG(price_per_liter_eur)::numeric, 3) as avg_price
       FROM fuel_prices
       WHERE expires_at > NOW()
       GROUP BY fuel_type
       ORDER BY fuel_type`
    );

    const prices: Record<string, number> = {};
    for (const row of result.rows) {
      prices[row.fuel_type] = parseFloat(row.avg_price);
    }

    // Add electricity price if not in DB (default estimate)
    if (!prices['electric']) {
      prices['electric'] = 0.30; // €/kWh average estimate
    }

    res.status(200).json({
      status: 200,
      data: prices,
      requestId: (_req as any).requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: 'Failed to fetch latest prices',
      requestId: (_req as any).requestId,
    });
  }
});

/**
 * GET /api/v1/fuel/prices?country={code}&type={fuel_type}
 *
 * Returns the cached fuel price for a given country and fuel type.
 * Requires authentication.
 *
 * Query params:
 *   - country: ISO 3166-1 alpha-2 country code (e.g., "DE", "FR")
 *   - type: fuel type (diesel, petrol_95, petrol_98, lpg)
 *
 * Returns:
 *   - 200 with fuel price data
 *   - 400 if required params are missing or invalid
 *   - 404 if no price data is available
 */
router.get('/prices', async (req: Request, res: Response) => {
  try {
    const country = req.query.country;
    const fuelType = req.query.type;

    // Validate required parameters
    if (!country || typeof country !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: country',
        requestId: req.requestId,
      });
      return;
    }

    if (!fuelType || typeof fuelType !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: type',
        requestId: req.requestId,
      });
      return;
    }

    // Validate country code format (2 uppercase letters)
    const countryCode = country.toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      res.status(400).json({
        status: 400,
        message: 'Invalid country code. Must be a 2-letter ISO country code.',
        requestId: req.requestId,
      });
      return;
    }

    // Validate fuel type
    if (!FUEL_TYPES.includes(fuelType as any)) {
      res.status(400).json({
        status: 400,
        message: `Invalid fuel type. Must be one of: ${FUEL_TYPES.join(', ')}`,
        requestId: req.requestId,
      });
      return;
    }

    // Get price from cache or DB
    const price = await getPrice(countryCode, fuelType);

    if (!price) {
      res.status(404).json({
        status: 404,
        message: `No fuel price data available for ${countryCode}/${fuelType}`,
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: price,
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[FuelRoute] Error fetching fuel price:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Failed to fetch fuel price',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/fuel/stations?lat={lat}&lng={lng}&radius={km}
 *
 * Find nearby fuel stations within a given radius of a geographic point.
 * Requires authentication.
 *
 * Query params:
 *   - lat: latitude (decimal number)
 *   - lng: longitude (decimal number)
 *   - radius: search radius in km (optional, defaults to 5)
 *
 * Returns:
 *   - 200 with array of fuel stations
 *   - 400 if required params are missing or invalid
 *
 * Requirements: 8.3, 8.7
 */
router.get('/stations', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        status: 401,
        message: 'Authentication required',
        requestId: req.requestId,
      });
      return;
    }

    const latStr = req.query.lat;
    const lngStr = req.query.lng;
    const radiusStr = req.query.radius;

    // Validate required parameters
    if (!latStr || typeof latStr !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: lat',
        requestId: req.requestId,
      });
      return;
    }

    if (!lngStr || typeof lngStr !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: lng',
        requestId: req.requestId,
      });
      return;
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      res.status(400).json({
        status: 400,
        message: 'Invalid lat parameter. Must be a number between -90 and 90.',
        requestId: req.requestId,
      });
      return;
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      res.status(400).json({
        status: 400,
        message: 'Invalid lng parameter. Must be a number between -180 and 180.',
        requestId: req.requestId,
      });
      return;
    }

    // Default radius to 5 km if not provided
    let radius = 5;
    if (radiusStr && typeof radiusStr === 'string') {
      radius = parseFloat(radiusStr);
      if (isNaN(radius) || radius <= 0 || radius > 50) {
        res.status(400).json({
          status: 400,
          message: 'Invalid radius parameter. Must be a positive number up to 50 km.',
          requestId: req.requestId,
        });
        return;
      }
    }

    const stations = await findStationsNearPoint(lat, lng, radius);

    res.status(200).json({
      status: 200,
      data: { stations },
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[FuelRoute] Error finding nearby stations:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Failed to find nearby fuel stations',
      requestId: req.requestId,
    });
  }
});

export default router;
