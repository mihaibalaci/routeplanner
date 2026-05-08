import { Router, Request, Response } from 'express';
import {
  getCountriesRequiringVignette,
  getPrices,
  getRouteVignetteRequirements,
  calculateVignetteCost,
} from '../services/vignetteService';
import { getRoute } from '../services/routeService';
import { VALID_VEHICLE_TYPES, VehicleType } from '../models/vehicleProfile';
import { VignetteDuration, VALID_VIGNETTE_DURATIONS } from '../models/vignette';

const router = Router();

/**
 * GET /api/v1/vignettes/countries
 *
 * Returns all countries that require a vignette.
 * Data is served from Redis cache (24h TTL) or falls back to DB.
 * Requires authentication.
 *
 * Requirements: 16.1
 */
router.get('/countries', async (req: Request, res: Response) => {
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

    const countries = await getCountriesRequiringVignette();

    res.status(200).json({
      status: 200,
      data: { countries },
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[VignetteRoute] Error fetching vignette countries:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Failed to fetch vignette countries',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/vignettes/prices?country={code}&vehicle_type={type}
 *
 * Returns vignette prices for a given country and vehicle type.
 * Requires authentication.
 *
 * Query params:
 *   - country: ISO 3166-1 alpha-2 country code (e.g., "AT", "CZ")
 *   - vehicle_type: one of motorcycle, car, camper
 *
 * Requirements: 16.5, 16.6
 */
router.get('/prices', async (req: Request, res: Response) => {
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

    const country = req.query.country;
    const vehicleType = req.query.vehicle_type;

    // Validate required parameters
    if (!country || typeof country !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: country',
        requestId: req.requestId,
      });
      return;
    }

    if (!vehicleType || typeof vehicleType !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: vehicle_type',
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

    // Validate vehicle type
    if (!VALID_VEHICLE_TYPES.includes(vehicleType as VehicleType)) {
      res.status(400).json({
        status: 400,
        message: `Invalid vehicle_type. Must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`,
        requestId: req.requestId,
      });
      return;
    }

    const prices = await getPrices(countryCode, vehicleType as VehicleType);

    res.status(200).json({
      status: 200,
      data: { prices },
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[VignetteRoute] Error fetching vignette prices:', error.message);
    res.status(500).json({
      status: 500,
      message: 'Failed to fetch vignette prices',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/vignettes/route/:routeId
 *
 * Returns vignette requirements for a calculated route.
 * Includes which countries need vignettes, exemptions, available durations, and prices.
 * Requires authentication and route ownership.
 *
 * Query params (optional):
 *   - vehicle_type: one of motorcycle, car, camper (for exemption logic and price lookup)
 *
 * Requirements: 16.1, 16.2, 16.6
 */
router.get('/route/:routeId', async (req: Request, res: Response) => {
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

    const { routeId } = req.params;

    // Verify route exists and belongs to user
    const routeDetails = await getRoute(routeId);
    if (!routeDetails) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    if (routeDetails.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied: you do not own this route',
        requestId: req.requestId,
      });
      return;
    }

    // Optional vehicle_type for exemption logic
    const vehicleTypeParam = req.query.vehicle_type;
    let vehicleType: VehicleType | undefined;

    if (vehicleTypeParam && typeof vehicleTypeParam === 'string') {
      if (!VALID_VEHICLE_TYPES.includes(vehicleTypeParam as VehicleType)) {
        res.status(400).json({
          status: 400,
          message: `Invalid vehicle_type. Must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`,
          requestId: req.requestId,
        });
        return;
      }
      vehicleType = vehicleTypeParam as VehicleType;
    }

    const requirements = await getRouteVignetteRequirements(routeId, vehicleType);

    res.status(200).json({
      status: 200,
      data: { requirements },
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[VignetteRoute] Error fetching route vignette requirements:', error.message);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to fetch route vignette requirements',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/vignettes/route/:routeId/cost
 *
 * Calculates vignette cost for a route with user-selected durations per country.
 * Requires authentication and route ownership.
 *
 * Query params:
 *   - vehicle_type: one of motorcycle, car, camper (required)
 *   - durations: JSON-encoded object mapping country codes to durations
 *     e.g., {"AT":"10-day","CZ":"1-month"}
 *
 * Requirements: 16.2, 16.5, 16.6
 */
router.get('/route/:routeId/cost', async (req: Request, res: Response) => {
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

    const { routeId } = req.params;

    // Verify route exists and belongs to user
    const routeDetails = await getRoute(routeId);
    if (!routeDetails) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    if (routeDetails.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied: you do not own this route',
        requestId: req.requestId,
      });
      return;
    }

    // Validate vehicle_type (required)
    const vehicleTypeParam = req.query.vehicle_type;
    if (!vehicleTypeParam || typeof vehicleTypeParam !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: vehicle_type',
        requestId: req.requestId,
      });
      return;
    }

    if (!VALID_VEHICLE_TYPES.includes(vehicleTypeParam as VehicleType)) {
      res.status(400).json({
        status: 400,
        message: `Invalid vehicle_type. Must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`,
        requestId: req.requestId,
      });
      return;
    }

    const vehicleType = vehicleTypeParam as VehicleType;

    // Parse duration preferences from query param
    let durationPreferences: Record<string, VignetteDuration> = {};
    const durationsParam = req.query.durations;

    if (durationsParam && typeof durationsParam === 'string') {
      try {
        const parsed = JSON.parse(durationsParam);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          // Validate each duration value
          for (const [code, duration] of Object.entries(parsed)) {
            if (!VALID_VIGNETTE_DURATIONS.includes(duration as VignetteDuration)) {
              res.status(400).json({
                status: 400,
                message: `Invalid duration "${duration}" for country "${code}". Must be one of: ${VALID_VIGNETTE_DURATIONS.join(', ')}`,
                requestId: req.requestId,
              });
              return;
            }
            durationPreferences[code.toUpperCase()] = duration as VignetteDuration;
          }
        } else {
          res.status(400).json({
            status: 400,
            message: 'Invalid durations parameter. Must be a JSON object mapping country codes to durations.',
            requestId: req.requestId,
          });
          return;
        }
      } catch {
        res.status(400).json({
          status: 400,
          message: 'Invalid durations parameter. Must be valid JSON.',
          requestId: req.requestId,
        });
        return;
      }
    }

    const costEstimate = await calculateVignetteCost(routeId, vehicleType, durationPreferences);

    res.status(200).json({
      status: 200,
      data: costEstimate,
      requestId: req.requestId,
    });
  } catch (error: any) {
    console.error('[VignetteRoute] Error calculating vignette cost:', error.message);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to calculate vignette cost',
      requestId: req.requestId,
    });
  }
});

export default router;
