import { Router, Request, Response } from 'express';
import { findById } from '../services/userService';
import { toUserResponse } from '../models/user';
import {
  getRoutesByUser,
  getRoute,
  deleteRoute,
  updateRoute,
} from '../services/routeService';
import { Route } from '../models/route';

const router = Router();

/** Maximum number of finalized routes stored per user. */
const MAX_ROUTES_PER_USER = 100;

/**
 * Route summary returned in the list view (no waypoints/segments).
 */
export interface RouteSummary {
  id: string;
  name: string | null;
  total_distance_km: number | null;
  total_duration_seconds: number | null;
  status: string;
  created_at: Date;
}

/**
 * Maps a full Route to a summary for the list endpoint.
 */
function toRouteSummary(route: Route): RouteSummary {
  return {
    id: route.id,
    name: route.name,
    total_distance_km: route.total_distance_km,
    total_duration_seconds: route.total_duration_seconds,
    status: route.status,
    created_at: route.created_at,
  };
}

/**
 * GET /api/v1/users/me
 * Get current user profile.
 * Requirements: 14.1
 */
router.get('/me', async (req: Request, res: Response) => {
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

    const user = await findById(userId);
    if (!user) {
      res.status(404).json({
        status: 404,
        message: 'User not found',
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: toUserResponse(user),
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to get user profile',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/users/me/routes
 * Get user's route history sorted by creation date (newest first).
 * Returns route summaries (no waypoints/segments for list view).
 * Enforces max 100 routes per user.
 * Requirements: 11.2, 11.3
 */
router.get('/me/routes', async (req: Request, res: Response) => {
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

    const routes = await getRoutesByUser(userId);

    // Return at most MAX_ROUTES_PER_USER routes (already sorted by created_at DESC)
    const limitedRoutes = routes.slice(0, MAX_ROUTES_PER_USER);

    res.status(200).json({
      status: 200,
      data: limitedRoutes.map(toRouteSummary),
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to get route history',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/users/me/routes/:routeId
 * Load a saved route with full details (waypoints, segments) for map display.
 * Requirements: 11.4
 */
router.get('/me/routes/:routeId', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.routeId);

    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: routeData,
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to load route',
      requestId: req.requestId,
    });
  }
});

/**
 * DELETE /api/v1/users/me/routes/:routeId
 * Permanently delete a saved route from history.
 * Requirements: 11.5
 */
router.delete('/me/routes/:routeId', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.routeId);

    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    await deleteRoute(req.params.routeId);

    res.status(200).json({
      status: 200,
      message: 'Route deleted successfully',
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to delete route',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/users/me/routes/:routeId/finalize
 * Finalize a route — sets status to 'finalized' and enforces max 100 routes.
 * If user already has 100 finalized routes, the oldest is deleted.
 * Requirements: 11.1, 11.2
 */
router.post('/me/routes/:routeId/finalize', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.routeId);

    if (!routeData) {
      res.status(404).json({
        status: 404,
        message: 'Route not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (routeData.route.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    // Check if route is already finalized
    if (routeData.route.status === 'finalized') {
      res.status(200).json({
        status: 200,
        data: routeData,
        message: 'Route is already finalized',
        requestId: req.requestId,
      });
      return;
    }

    // Enforce max 100 routes per user — delete oldest if at limit
    const userRoutes = await getRoutesByUser(userId);
    if (userRoutes.length >= MAX_ROUTES_PER_USER) {
      // Delete the oldest route(s) to make room (routes are sorted newest first)
      const routesToDelete = userRoutes.slice(MAX_ROUTES_PER_USER - 1);
      for (const oldRoute of routesToDelete) {
        await deleteRoute(oldRoute.id);
      }
    }

    // Finalize the route
    await updateRoute(req.params.routeId, { status: 'finalized' });

    // Return the full route details
    const finalizedRouteData = await getRoute(req.params.routeId);

    res.status(200).json({
      status: 200,
      data: finalizedRouteData,
      message: 'Route finalized successfully',
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to finalize route',
      requestId: req.requestId,
    });
  }
});

export default router;
