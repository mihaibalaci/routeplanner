import { Router, Request, Response } from 'express';
import {
  createProfile,
  getProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  setDefaultVehicle,
} from '../services/vehicleProfileService';
import { toVehicleProfileResponse } from '../models/vehicleProfile';

const router = Router();

/**
 * GET /api/v1/vehicles
 * List all vehicle profiles for the authenticated user.
 * Requirements: 5.5
 */
router.get('/', async (req: Request, res: Response) => {
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

    const profiles = await getProfiles(userId);

    res.status(200).json({
      status: 200,
      data: profiles.map(toVehicleProfileResponse),
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve vehicle profiles',
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/vehicles
 * Create a new vehicle profile.
 * Body: { name, vehicle_type, fuel_type, tank_capacity_liters, consumption_per_100km }
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6
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

    const {
      name,
      vehicle_type,
      fuel_type,
      tank_capacity_liters,
      consumption_per_100km,
      battery_capacity_kwh,
      consumption_kwh_per_100km,
      charge_port_type,
    } = req.body;

    const profile = await createProfile(userId, {
      name,
      vehicle_type,
      fuel_type,
      tank_capacity_liters,
      consumption_per_100km,
      battery_capacity_kwh,
      consumption_kwh_per_100km,
      charge_port_type,
    });

    res.status(201).json({
      status: 201,
      data: toVehicleProfileResponse(profile),
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const response: any = {
      status: statusCode,
      message: error.message || 'Failed to create vehicle profile',
      requestId: req.requestId,
    };
    if (error.validationErrors) {
      response.errors = error.validationErrors;
    }
    res.status(statusCode).json(response);
  }
});

/**
 * GET /api/v1/vehicles/:id
 * Get a specific vehicle profile.
 * Requirements: 5.1
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

    const profile = await getProfile(req.params.id);

    if (!profile) {
      res.status(404).json({
        status: 404,
        message: 'Vehicle profile not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (profile.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: toVehicleProfileResponse(profile),
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to retrieve vehicle profile',
      requestId: req.requestId,
    });
  }
});

/**
 * PUT /api/v1/vehicles/:id
 * Update a vehicle profile.
 * Body: { name?, vehicle_type?, fuel_type?, tank_capacity_liters?, consumption_per_100km? }
 * Requirements: 5.4, 5.2, 5.3, 5.6
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

    const existingProfile = await getProfile(req.params.id);

    if (!existingProfile) {
      res.status(404).json({
        status: 404,
        message: 'Vehicle profile not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (existingProfile.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    const {
      name,
      vehicle_type,
      fuel_type,
      tank_capacity_liters,
      consumption_per_100km,
      battery_capacity_kwh,
      consumption_kwh_per_100km,
      charge_port_type,
    } = req.body;

    const updatedProfile = await updateProfile(req.params.id, {
      name,
      vehicle_type,
      fuel_type,
      tank_capacity_liters,
      consumption_per_100km,
      battery_capacity_kwh,
      consumption_kwh_per_100km,
      charge_port_type,
    });

    if (!updatedProfile) {
      res.status(404).json({
        status: 404,
        message: 'Vehicle profile not found',
        requestId: req.requestId,
      });
      return;
    }

    res.status(200).json({
      status: 200,
      data: toVehicleProfileResponse(updatedProfile),
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    const response: any = {
      status: statusCode,
      message: error.message || 'Failed to update vehicle profile',
      requestId: req.requestId,
    };
    if (error.validationErrors) {
      response.errors = error.validationErrors;
    }
    res.status(statusCode).json(response);
  }
});

/**
 * PUT /api/v1/vehicles/:id/default
 * Set a vehicle as the default for the authenticated user.
 * Requirements: 5.1, 5.2
 */
router.put('/:id/default', async (req: Request, res: Response) => {
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

    const existingProfile = await getProfile(req.params.id);

    if (!existingProfile) {
      res.status(404).json({
        status: 404,
        message: 'Vehicle profile not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (existingProfile.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    const updatedProfile = await setDefaultVehicle(userId, req.params.id);

    res.status(200).json({
      status: 200,
      data: toVehicleProfileResponse(updatedProfile),
      requestId: req.requestId,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      status: statusCode,
      message: error.message || 'Failed to set default vehicle',
      requestId: req.requestId,
    });
  }
});

/**
 * DELETE /api/v1/vehicles/:id
 * Delete a vehicle profile.
 * Requirements: 5.1
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

    const profile = await getProfile(req.params.id);

    if (!profile) {
      res.status(404).json({
        status: 404,
        message: 'Vehicle profile not found',
        requestId: req.requestId,
      });
      return;
    }

    // Verify ownership
    if (profile.user_id !== userId) {
      res.status(403).json({
        status: 403,
        message: 'Access denied',
        requestId: req.requestId,
      });
      return;
    }

    await deleteProfile(req.params.id);

    res.status(200).json({
      status: 200,
      message: 'Vehicle profile deleted successfully',
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: error.message || 'Failed to delete vehicle profile',
      requestId: req.requestId,
    });
  }
});

export default router;
