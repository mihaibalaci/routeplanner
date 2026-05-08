# Route Planner Web Platform

A web-based route planning platform for Europe that enables users to plan multi-stop routes, calculate trip fuel costs, find optimal refueling stops, track vignette costs, and export routes in multiple navigation formats.

## Architecture

- **Backend**: Node.js/TypeScript with Express, PostgreSQL, Redis
- **Frontend**: Vanilla TypeScript SPA with Material Design Lite
- **APIs**: Google Maps (Directions, Places, Geocoding)

## Project Structure

```
├── src/                    # Backend source code
│   ├── routes/             # Express route handlers
│   ├── services/           # Business logic services
│   ├── models/             # TypeScript type definitions
│   ├── middleware/         # Express middleware (auth, rate limiting, etc.)
│   ├── exporters/          # Route export format implementations
│   ├── jobs/               # Background job schedulers
│   ├── utils/              # Database, Redis, helpers
│   └── tests/              # Property-based and integration tests
├── frontend/               # Frontend SPA (separate build)
│   ├── src/
│   │   ├── api/            # API client with JWT management
│   │   ├── components/     # UI components (AppShell)
│   │   ├── pages/          # Page components
│   │   ├── services/       # Frontend services (Google Maps)
│   │   └── styles/         # CSS
│   └── index.html
├── migrations/             # PostgreSQL migrations (node-pg-migrate)
└── deploy.sh               # Deployment script
```

## Features

1. **Route Planning** — Multi-stop routes with Google Maps integration
2. **Trip Cost Calculator** — Fuel cost estimation with per-country breakdown
3. **Smart Refuel Stops** — Optimal refueling suggestions based on range and prices
4. **Vignette Cost Tracking** — Automatic detection and pricing for 9 European countries
5. **Route Export** — 8 formats: GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT
6. **User Accounts** — Email/password + Google/Apple SSO authentication

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Backend Setup

```bash
npm install
cp .env.example .env  # Edit with your credentials
npx node-pg-migrate up
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
npm test          # Run all backend tests
npm run lint      # Lint backend code
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT token signing |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `APPLE_CLIENT_ID` | Apple Sign In client ID |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | SMTP authentication username |
| `SMTP_PASS` | SMTP authentication password |
| `SMTP_FROM` | Sender email address |
| `APP_URL` | Public URL of the app (for email links) |

## API Endpoints

All endpoints are prefixed with `/api/v1/`.

| Resource | Endpoints |
|----------|-----------|
| Auth | POST /auth/register, /auth/login, /auth/google, /auth/apple |
| Routes | CRUD + /calculate, /alternatives, /export |
| Vehicles | CRUD /vehicles |
| Trips | POST /trips/:routeId/cost, GET /trips/:routeId/cost |
| Refuel | POST /refuel/:routeId/suggest, /accept, /reject |
| Fuel | GET /fuel/prices, /fuel/stations |
| Vignettes | GET /vignettes/countries, /prices, /route/:id, /route/:id/cost |
| Users | GET /users/me, /users/me/routes |

## License

Private — All rights reserved.
