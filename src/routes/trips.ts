import { Router, Request, Response } from 'express';
import { calculateTripCost, getTripCost, calculateTotalCost } from '../services/tripCostService';
import { getRoute } from '../services/routeService';

const router = Router();

/**
 * POST /api/v1/trips/:routeId/cost
 * Calculate trip cost for a route with a given vehicle profile.
 * Body: { vehicleId: string, durationPreferences?: Record<string, VignetteDuration> }
 * When durationPreferences is provided, returns combined fuel + vignette cost.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 16.2, 16.3, 16.5, 16.10
 */
router.post('/:routeId/cost', async (req: Request, res: Response) => {
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
    const { vehicleId, durationPreferences } = req.body;

    // Requirement 7.6: Prompt user to select vehicle if none selected
    if (!vehicleId) {
      res.status(400).json({
        status: 400,
        message: 'Please select a vehicle profile',
        requestId: req.requestId,
      });
      return;
    }

    // Verify route ownership
    const routeData = await getRoute(routeId);
    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    // If durationPreferences provided, calculate total cost (fuel + vignettes)
    if (durationPreferences) {
      const totalEstimate = await calculateTotalCost(routeId, vehicleId, durationPreferences);
      res.status(200).json({
        status: 200,
        data: totalEstimate,
        requestId: req.requestId,
      });
      return;
    }

    // Otherwise, calculate fuel-only trip cost
    const costEstimate = await calculateTripCost(routeId, vehicleId);

    res.status(200).json({
      status: 200,
      data: costEstimate,
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to calculate trip cost',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/trips/:routeId/cost
 * Get cached/stored cost calculation for a route.
 * Includes vignette breakdown if available.
 * Requirements: 7.1, 16.2
 */
router.get('/:routeId/cost', async (req: Request, res: Response) => {
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

    // Verify route ownership
    const routeData = await getRoute(routeId);
    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    // Get stored cost
    const costEstimate = await getTripCost(routeId);
    if (!costEstimate) {
      res.status(404).json({
        status: 404,
        message: 'No cost calculation found for this route',
        requestId: req.requestId,
      });
      return;
    }

    // Try to include vignette breakdown alongside fuel breakdown
    let responseData: any = costEstimate;
    try {
      const { getProfile } = await import('../services/vehicleProfileService');
      const { calculateVignetteCost } = await import('../services/vignetteService');

      const vehicle = await getProfile(costEstimate.vehicle_profile_id);
      if (vehicle) {
        const vignetteEstimate = await calculateVignetteCost(
          routeId,
          vehicle.vehicle_type,
          {}
        );

        const totalCostEur = Math.round(
          (costEstimate.total_cost_eur + vignetteEstimate.totalVignetteCostEur) * 100
        ) / 100;

        responseData = {
          ...costEstimate,
          fuel_cost_eur: costEstimate.total_cost_eur,
          vignette_cost_eur: vignetteEstimate.totalVignetteCostEur,
          total_cost_eur: totalCostEur,
          fuel_breakdown: costEstimate.country_breakdown,
          vignette_breakdown: vignetteEstimate.countryBreakdown,
        };
      }
    } catch {
      // If vignette calculation fails, return fuel-only data
    }

    res.status(200).json({
      status: 200,
      data: responseData,
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to retrieve trip cost',
      requestId: req.requestId,
    });
  }
});

export default router;
