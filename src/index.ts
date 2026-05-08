import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import {
  requestIdMiddleware,
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  errorHandler,
} from './middleware';
import authRouter from './routes/auth';
import placesRouter from './routes/places';
import routesRouter from './routes/routes';
import vehiclesRouter from './routes/vehicles';
import fuelRouter from './routes/fuel';
import tripsRouter from './routes/trips';
import refuelRouter from './routes/refuel';
import vignettesRouter from './routes/vignettes';
import usersRouter from './routes/users';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request ID generation (must be early to attach ID to all responses)
app.use(requestIdMiddleware);

// Input validation/sanitization
app.use(validationMiddleware);

// JWT authentication (skips public paths)
app.use(authMiddleware);

// Rate limiting (after auth so we have userId)
app.use(rateLimitMiddleware);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API version prefix
app.get('/api/v1', (_req, res) => {
  res.json({ message: 'Route Planner API v1' });
});

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/places', placesRouter);
app.use('/api/v1/routes', routesRouter);
app.use('/api/v1/vehicles', vehiclesRouter);
app.use('/api/v1/fuel', fuelRouter);
app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1/refuel', refuelRouter);
app.use('/api/v1/vignettes', vignettesRouter);
app.use('/api/v1/users', usersRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Route Planner API running on port ${PORT}`);
  });
}

export default app;
