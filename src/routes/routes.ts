import { Router, Request, Response } from 'express';
import {
  createRoute,
  getRoute,
  updateRoute,
  deleteRoute,
  addWaypoint,
  removeWaypoint,
  reorderWaypoints,
} from '../services/routeService';
import { getGoogleMapsService, ParsedRoute } from '../services/googleMapsService';
import { query } from '../utils/database';
import { LatLng } from '../models/route';
import { isFormatSupported, ExportFormat } from '../exporters/index';
import { exportRoute } from '../services/routeExportService';

const router = Router();

/**
 * GET /api/v1/routes
 * List all routes for the authenticated user, ordered by most recent.
 * Returns route summary with waypoint labels for origin/destination.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ status: 401, message: 'Authentication required', requestId: req.requestId });
      return;
    }

    const result = await query(
      `SELECT r.id, r.name, r.total_distance_km, r.total_duration_seconds, r.status, r.created_at,
              (SELECT label FROM waypoints WHERE route_id = r.id AND waypoint_type = 'origin' ORDER BY position LIMIT 1) as origin_label,
              (SELECT label FROM waypoints WHERE route_id = r.id AND waypoint_type = 'destination' ORDER BY position DESC LIMIT 1) as destination_label,
              (SELECT COUNT(*) FROM waypoints WHERE route_id = r.id) as waypoints_count
       FROM routes r
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const routes = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      origin: row.origin_label || 'Unknown',
      destination: row.destination_label || 'Unknown',
      total_distance_km: row.total_distance_km ? parseFloat(row.total_distance_km) : null,
      total_duration_seconds: row.total_duration_seconds,
      waypoints_count: parseInt(row.waypoints_count, 10),
      status: row.status,
      created_at: row.created_at,
    }));

    res.status(200).json({ status: 200, data: routes, requestId: req.requestId });
  } catch (error: any) {
    res.status(500).json({ status: 500, message: error.message || 'Failed to list routes', requestId: req.requestId });
  }
});

/**
 * POST /api/v1/routes
 * Create a new route with waypoints.
 * Body: { name: string, waypoints: [{ latitude, longitude, label?, waypoint_type }] }
 * Requirements: 1.1, 1.2, 1.3
 */
router.post('/', async (req: Request, res: Response) => {
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

    const { name, waypoints } = req.body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
      res.status(400).json({
        status: 400,
        message: 'At least one waypoint is required',
        requestId: req.requestId,
      });
      return;
    }

    // Validate each waypoint
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (wp.latitude === undefined || wp.longitude === undefined) {
        res.status(400).json({
          status: 400,
          message: `Waypoint at index ${i} must have latitude and longitude`,
          requestId: req.requestId,
        });
        return;
      }
      if (!wp.waypoint_type || !['origin', 'stop', 'destination'].includes(wp.waypoint_type)) {
        res.status(400).json({
          status: 400,
          message: `Waypoint at index ${i} must have a valid waypoint_type (origin, stop, destination)`,
          requestId: req.requestId,
        });
        return;
      }
    }

    const result = await createRoute(userId, name || 'Untitled Route', waypoints);

    res.status(201).json({
      status: 201,
      data: result,
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to create route',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/routes/:id
 * Retrieve a saved route with waypoints and segments.
 * Requirements: 1.1, 2.2
 */
router.get('/:id', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.id);

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
      message: error.message || 'Failed to retrieve route',
      requestId: req.requestId,
    });
  }
});

/**
 * PUT /api/v1/routes/:id
 * Update route waypoints (add, remove, reorder) or route metadata.
 * Body: { action: 'add_waypoint' | 'remove_waypoint' | 'reorder', ... }
 * Requirements: 1.3, 1.4, 1.5
 */
router.put('/:id', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.id);

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

    const { action } = req.body;

    if (action === 'add_waypoint') {
      const { waypoint, position } = req.body;
      if (!waypoint || waypoint.latitude === undefined || waypoint.longitude === undefined) {
        res.status(400).json({
          status: 400,
          message: 'Waypoint with latitude and longitude is required',
          requestId: req.requestId,
        });
        return;
      }
      if (!waypoint.waypoint_type || !['origin', 'stop', 'destination'].includes(waypoint.waypoint_type)) {
        res.status(400).json({
          status: 400,
          message: 'Waypoint must have a valid waypoint_type (origin, stop, destination)',
          requestId: req.requestId,
        });
        return;
      }

      const insertPosition = position ?? routeData.waypoints.length;
      const updatedWaypoints = await addWaypoint(req.params.id, waypoint, insertPosition);

      res.status(200).json({
        status: 200,
        data: { waypoints: updatedWaypoints },
        requestId: req.requestId,
      });
    } else if (action === 'remove_waypoint') {
      const { waypoint_id } = req.body;
      if (!waypoint_id) {
        res.status(400).json({
          status: 400,
          message: 'waypoint_id is required for remove_waypoint action',
          requestId: req.requestId,
        });
        return;
      }

      const updatedWaypoints = await removeWaypoint(req.params.id, waypoint_id);

      res.status(200).json({
        status: 200,
        data: { waypoints: updatedWaypoints },
        requestId: req.requestId,
      });
    } else if (action === 'reorder') {
      const { waypoint_ids } = req.body;
      if (!waypoint_ids || !Array.isArray(waypoint_ids)) {
        res.status(400).json({
          status: 400,
          message: 'waypoint_ids array is required for reorder action',
          requestId: req.requestId,
        });
        return;
      }

      const updatedWaypoints = await reorderWaypoints(req.params.id, waypoint_ids);

      res.status(200).json({
        status: 200,
        data: { waypoints: updatedWaypoints },
        requestId: req.requestId,
      });
    } else if (!action) {
      // Update route metadata (name, etc.)
      const { name } = req.body;
      const updatedRoute = await updateRoute(req.params.id, { name });

      res.status(200).json({
        status: 200,
        data: { route: updatedRoute },
        requestId: req.requestId,
      });
    } else {
      res.status(400).json({
        status: 400,
        message: `Invalid action: ${action}. Valid actions: add_waypoint, remove_waypoint, reorder`,
        requestId: req.requestId,
      });
    }
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to update route',
      requestId: req.requestId,
    });
  }
});

/**
 * DELETE /api/v1/routes/:id
 * Delete a route.
 * Requirements: 1.5
 */
router.delete('/:id', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.id);

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

    await deleteRoute(req.params.id);

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
 * POST /api/v1/routes/:id/calculate
 * Trigger route calculation via Google Maps.
 * Stores segments and updates total distance/duration.
 * Requirements: 4.1, 4.3, 4.5, 2.2
 */
router.post('/:id/calculate', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.id);

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

    const { waypoints } = routeData;

    if (waypoints.length < 2) {
      res.status(400).json({
        status: 400,
        message: 'At least 2 waypoints are required to calculate a route',
        requestId: req.requestId,
      });
      return;
    }

    const origin: LatLng = {
      latitude: waypoints[0].latitude,
      longitude: waypoints[0].longitude,
    };
    const destination: LatLng = {
      latitude: waypoints[waypoints.length - 1].latitude,
      longitude: waypoints[waypoints.length - 1].longitude,
    };
    const intermediateWaypoints: LatLng[] = waypoints.slice(1, -1).map((wp) => ({
      latitude: wp.latitude,
      longitude: wp.longitude,
    }));

    const mapsService = getGoogleMapsService();

    // Get directions from Google Maps
    const routes = await mapsService.getDirections({
      origin,
      destination,
      waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
      alternatives: false,
    });

    // Select the fastest route
    const fastestRoute = mapsService.selectFastestRoute(routes);

    // Parse into segments
    const parsed: ParsedRoute = mapsService.parseRouteSegments(fastestRoute, req.params.id);

    // Delete existing segments for this route
    await query('DELETE FROM route_segments WHERE route_id = $1', [req.params.id]);

    // Store new segments
    for (const segment of parsed.segments) {
      await query(
        `INSERT INTO route_segments (route_id, segment_index, distance_km, duration_seconds, country_code, polyline_encoded)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.params.id,
          segment.segment_index,
          segment.distance_km,
          segment.duration_seconds,
          segment.country_code,
          segment.polyline_encoded,
        ]
      );
    }

    // Update route with totals and status
    await updateRoute(req.params.id, {
      total_distance_km: parsed.total_distance_km,
      total_duration_seconds: parsed.total_duration_seconds,
      polyline_encoded: parsed.polyline_encoded,
      status: 'calculated',
    });

    // Fetch updated route
    const updatedRoute = await getRoute(req.params.id);

    res.status(200).json({
      status: 200,
      data: {
        ...updatedRoute,
        total_distance_km: parsed.total_distance_km,
        total_duration_seconds: parsed.total_duration_seconds,
      },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to calculate route',
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/routes/:id/alternatives
 * Get alternative routes via Google Maps.
 * Requirements: 4.3
 */
router.get('/:id/alternatives', async (req: Request, res: Response) => {
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

    const routeData = await getRoute(req.params.id);

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

    const { waypoints } = routeData;

    if (waypoints.length < 2) {
      res.status(400).json({
        status: 400,
        message: 'At least 2 waypoints are required to get alternatives',
        requestId: req.requestId,
      });
      return;
    }

    const origin: LatLng = {
      latitude: waypoints[0].latitude,
      longitude: waypoints[0].longitude,
    };
    const destination: LatLng = {
      latitude: waypoints[waypoints.length - 1].latitude,
      longitude: waypoints[waypoints.length - 1].longitude,
    };
    const intermediateWaypoints: LatLng[] = waypoints.slice(1, -1).map((wp) => ({
      latitude: wp.latitude,
      longitude: wp.longitude,
    }));

    const mapsService = getGoogleMapsService();

    // Get directions with alternatives=true
    const routes = await mapsService.getDirections({
      origin,
      destination,
      waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
      alternatives: true,
    });

    // Parse all routes into segments
    const alternatives = routes.map((route) => {
      return mapsService.parseRouteSegments(route, req.params.id);
    });

    res.status(200).json({
      status: 200,
      data: {
        alternatives: alternatives.map((alt) => ({
          total_distance_km: alt.total_distance_km,
          total_duration_seconds: alt.total_duration_seconds,
          segments: alt.segments,
          polyline_encoded: alt.polyline_encoded,
        })),
      },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to get alternative routes',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/routes/:id/export
 * Export a route in the specified navigation format.
 * Body: { format: ExportFormat }
 * Returns base64-encoded file(s) with split info.
 * Requirements: 9.3, 9.4, 9.5
 */
router.post('/:id/export', async (req: Request, res: Response) => {
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

    const { format } = req.body;

    if (!format || !isFormatSupported(format)) {
      res.status(400).json({
        status: 400,
        message: `Unsupported export format: ${format}. Supported formats: gpx, itn, asc, ov2, bcr, trk, mps, fit`,
        requestId: req.requestId,
      });
      return;
    }

    // Verify route exists and user owns it
    const routeData = await getRoute(req.params.id);

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

    const result = await exportRoute(req.params.id, format as ExportFormat);

    res.status(200).json({
      status: 200,
      data: {
        files: result.files.map((file) => file.toString('base64')),
        format: result.format,
        split: result.split,
        splitCount: result.splitCount,
      },
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to export route',
      requestId: req.requestId,
    });
  }
});

export default router;
