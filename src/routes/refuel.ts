import { Router, Request, Response } from 'express';
import {
  suggestRefuelStops,
  acceptStop,
  rejectStop,
} from '../services/refuelAdvisorService';
import { getRoute } from '../services/routeService';

const router = Router();

/**
 * Verifies that the authenticated user owns the specified route.
 * Returns the route data if ownership is confirmed, or sends an error response.
 */
async function verifyRouteOwnership(
  req: Request,
  res: Response
): Promise<{ routeData: any } | null> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({
      status: 401,
      message: 'Authentication required',
      requestId: req.requestId,
    });
    return null;
  }

  const routeId = req.params.routeId;
  const routeData = await getRoute(routeId);

  if (!routeData) {
    res.status(404).json({
      status: 404,
      message: 'Route not found',
      requestId: req.requestId,
    });
    return null;
  }

  if (routeData.route.user_id !== userId) {
    res.status(403).json({
      status: 403,
      message: 'Access denied',
      requestId: req.requestId,
    });
    return null;
  }

  return { routeData };
}

/**
 * POST /api/v1/refuel/:routeId/suggest
 *
 * Get refuel stop suggestions for a route based on vehicle profile.
 * Body: { vehicleId: string }
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.7
 */
router.post('/:routeId/suggest', async (req: Request, res: Response) => {
  try {
    const ownership = await verifyRouteOwnership(req, res);
    if (!ownership) return;

    const { vehicleId } = req.body;

    if (!vehicleId || typeof vehicleId !== 'string') {
      res.status(400).json({
        status: 400,
        message: 'Missing required field: vehicleId',
        requestId: req.requestId,
      });
      return;
    }

    const suggestions = await suggestRefuelStops(req.params.routeId, vehicleId);

    res.status(200).json({
      status: 200,
      data: { suggestions },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to get refuel suggestions',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/refuel/:routeId/accept/:stationId
 *
 * Accept a suggested refuel stop. Adds the station as a waypoint on the route
 * and records the refuel stop with status 'accepted'.
 *
 * Requirements: 8.5
 */
router.post('/:routeId/accept/:stationId', async (req: Request, res: Response) => {
  try {
    const ownership = await verifyRouteOwnership(req, res);
    if (!ownership) return;

    const { routeId, stationId } = req.params;

    const refuelStop = await acceptStop(routeId, stationId);

    res.status(200).json({
      status: 200,
      data: { refuelStop },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to accept refuel stop',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/refuel/:routeId/reject/:stationId
 *
 * Reject a suggested refuel stop. Returns the next-best alternative station.
 *
 * Requirements: 8.6
 */
router.post('/:routeId/reject/:stationId', async (req: Request, res: Response) => {
  try {
    const ownership = await verifyRouteOwnership(req, res);
    if (!ownership) return;

    const { routeId, stationId } = req.params;

    const alternative = await rejectStop(routeId, stationId);

    res.status(200).json({
      status: 200,
      data: { alternative },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to reject refuel stop',
      requestId: req.requestId,
    });
  }
});

export default router;
