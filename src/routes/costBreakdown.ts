import { Router, Request, Response } from 'express';
import { getRoute } from '../services/routeService';

const router = Router();

/**
 * GET /api/v1/cost-breakdown/:routeId
 * Composite endpoint returning fuel + vignette cost breakdown for a route.
 * Query params:
 *   - vehicleId (required): The vehicle profile to use for calculations
 *   - durations (optional): JSON string of duration overrides per country code
 * Requirements: 2.5, 7.1
 */
router.get('/:routeId', async (req: Request, res: Response) => {
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
    const { vehicleId, durations } = req.query;

    // Validate required query param
    if (!vehicleId || typeof vehicleId !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'vehicleId query parameter is required',
        requestId: req.requestId,
      });
      return;
    }

    // Verify route exists
    const routeData = await getRoute(routeId);
    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify route ownership
    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    // Parse optional duration overrides
    let durationOverrides: Record<string, string> | undefined;
    if (durations && typeof durations === 'string') {
      try {
        durationOverrides = JSON.parse(durations);
      } catch {
        res.status(400).json({
          status: 400,
          message: 'Invalid durations format: must be a valid JSON string',
          requestId: req.requestId,
        });
        return;
      }
    }

    // Delegate to service (implemented in task 2.2)
    const { getCostBreakdown } = await import('../services/costBreakdownService');
    const costData = await getCostBreakdown(routeId, vehicleId, durationOverrides);

    res.status(200).json({
      status: 200,
      data: costData,
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to calculate cost breakdown',
      requestId: req.requestId,
    });
  }
});

export default router;
