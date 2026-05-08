import { Router, Request, Response } from 'express';
import { autocomplete } from '../services/placesService';

const router = Router();

/**
 * GET /api/v1/places/autocomplete?q={query}
 *
 * Returns place autocomplete suggestions restricted to European countries.
 *
 * - Returns 400 if `q` parameter is missing
 * - Returns 200 with empty suggestions for queries < 3 characters
 * - Returns 200 with suggestions for valid queries
 * - Returns 500 on API errors
 */
router.get('/autocomplete', async (req: Request, res: Response) => {
  try {
    const query = req.query.q;

    // q parameter is required
    if (query === undefined || query === null) {
      res.status(400).json({
        status: 400,
        message: 'Missing required query parameter: q',
        requestId: req.requestId,
      });
      return;
    }

    const queryStr = String(query);
    const result = await autocomplete(queryStr);

    res.status(200).json({
      status: 200,
      data: result,
      requestId: req.requestId,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 500,
      message: 'Failed to fetch autocomplete suggestions',
      requestId: req.requestId,
    });
  }
});

export default router;
