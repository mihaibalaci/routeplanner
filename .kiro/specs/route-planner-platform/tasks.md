# Implementation Plan: Route Planner Web Platform

## Overview

Incremental implementation of the Route Planner Web Platform following the delivery slices defined in requirements: Route Planning → Trip Cost Calculator → Smart Refuel → Vignette Cost Tracking → Route Export → User Accounts. Infrastructure and authentication are set up first as foundational layers, then each feature slice builds on the previous. All code is TypeScript with PostgreSQL, Redis, and Google Maps API integration. Property-based tests use fast-check.

## Tasks

- [x] 1. Project setup and infrastructure
  - [x] 1.1 Initialize Node.js/TypeScript project with Express, configure tsconfig, ESLint, Prettier, and install core dependencies (express, pg, redis, jsonwebtoken, bcrypt, fast-check, vitest)
    - Create package.json with exact dependency versions
    - Configure TypeScript strict mode
    - Set up project directory structure: src/{routes, services, models, middleware, utils, exporters, jobs, tests}
    - _Requirements: 14.1, 14.3_

  - [x] 1.2 Set up PostgreSQL database schema and migration system
    - Install and configure a migration tool (e.g., node-pg-migrate)
    - Create initial migration with all tables: users, auth_identities, vehicle_profiles, routes, waypoints, route_segments, fuel_prices, trip_costs, fuel_stations, refuel_stops, vignette_countries, vignette_prices
    - Include all indexes, constraints, and CHECK constraints from the design
    - _Requirements: 12.4, 14.1, 16.1_

  - [x] 1.3 Set up Redis connection and caching utilities
    - Create Redis client wrapper with connection pooling
    - Implement cache helper functions: get, set with TTL, delete, increment
    - Define key patterns as constants matching the design (fuel:price:{country}:{fuel_type}, rate_limit:{user_id}, vignette:prices:{country}:{vehicle_type}, vignette:countries, vignette:route:{route_id}, etc.)
    - _Requirements: 6.5, 12.3, 16.9_

  - [x] 1.4 Implement API Gateway middleware stack
    - Create Express app with JSON body parsing, CORS, request ID generation
    - Implement JWT authentication middleware (skip for /auth/register, /auth/login)
    - Implement rate limiting middleware (100 req/min per user via Redis)
    - Implement input validation/sanitization middleware
    - Implement consistent error response handler
    - _Requirements: 13.1, 13.3, 13.4, 14.2, 14.3, 14.5_

  - [x] 1.5 Write property tests for rate limiting and error structure
    - **Property 31: Consistent API Error Structure** — For any API error, response SHALL contain status and message fields
    - **Property 32: Rate Limiting Enforcement** — For any user exceeding 100 requests in 60 seconds, excess requests SHALL return 429
    - **Validates: Requirements 14.2, 14.5**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. User authentication and accounts (Delivery Slice 5 — foundational)
  - [x] 3.1 Implement user registration with email/password
    - Create User model and repository (CRUD operations)
    - Implement password validation (min 8 chars, uppercase, lowercase, digit)
    - Hash passwords with bcrypt (cost factor 12)
    - Validate email uniqueness and format
    - Create POST /api/v1/auth/register endpoint
    - _Requirements: 10.1, 10.2, 10.3, 13.2_

  - [x] 3.2 Implement email/password login with JWT issuance
    - Validate credentials against stored hash
    - Issue JWT with 24-hour expiry on success
    - Return generic error on failure (don't reveal which credential was wrong)
    - Implement failed attempt tracking and account lockout (5 failures in 15 min → 30 min lock)
    - Create POST /api/v1/auth/login endpoint
    - _Requirements: 10.8, 10.9, 10.10_

  - [x] 3.3 Implement Google SSO authentication
    - Verify Google ID token using Google Identity Services
    - Create or link account using verified Google email
    - If email matches existing account, link SSO identity (no duplicate)
    - If new email, create account without password
    - Issue JWT on success
    - Create POST /api/v1/auth/google endpoint
    - _Requirements: 10.4, 10.6, 10.7_

  - [x] 3.4 Implement Apple SSO authentication
    - Verify Apple auth code via Sign in with Apple (OAuth 2.0)
    - Create or link account using verified Apple email or private relay
    - Same linking logic as Google SSO
    - Create POST /api/v1/auth/apple endpoint
    - _Requirements: 10.5, 10.6, 10.7_

  - [x] 3.5 Write property tests for authentication
    - **Property 20: Password Validation Rules** — Strings accepted iff length >= 8, has uppercase, lowercase, and digit
    - **Property 21: Email Uniqueness Enforcement** — Duplicate email registration SHALL be rejected
    - **Property 22: SSO Account Linking** — SSO login with existing email SHALL link, not create duplicate
    - **Property 23: JWT Expiry Correctness** — JWT expiry SHALL be exactly 24 hours from issuance
    - **Property 24: Generic Authentication Error** — Failed login responses SHALL be identical regardless of which credential was wrong
    - **Property 25: Account Lockout After Failed Attempts** — 5+ failures in 15 min SHALL lock for 30 min
    - **Property 28: Authentication Required for Protected Endpoints** — Requests without valid token SHALL return 401
    - **Property 29: Password Hash Security** — Stored hash SHALL use bcrypt cost >= 12, password not recoverable from API
    - **Validates: Requirements 10.2, 10.3, 10.7, 10.8, 10.9, 10.10, 13.1, 13.2, 13.5, 13.6**

  - [x] 3.6 Write property test for input sanitization
    - **Property 30: Input Sanitization** — Inputs with SQL injection or XSS patterns SHALL be sanitized or rejected
    - **Validates: Requirements 13.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Route Planning (Delivery Slice 1)
  - [x] 5.1 Implement Route model and repository
    - Create Route, Waypoint, and RouteSegment models
    - Implement CRUD operations for routes with waypoints
    - Implement waypoint insertion at position, removal, and reordering
    - Enforce minimum 10 intermediate stops support
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 5.2 Implement Google Maps integration service
    - Create Google Maps client wrapper (Directions, Places, Geocoding APIs)
    - Implement geocoding with error handling (return error on failure, retain route state)
    - Implement directions request with driving mode
    - Parse response into RouteSegment objects with per-segment distance and duration
    - Handle multiple route alternatives (return fastest by default)
    - _Requirements: 1.1, 1.2, 1.7, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.3 Implement Places autocomplete service
    - Create autocomplete endpoint restricted to European countries
    - Trigger only when query length >= 3 characters
    - Return empty result for queries < 3 characters
    - Handle no-results case with appropriate message
    - Create GET /api/v1/places/autocomplete endpoint
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.4 Implement Route Planning API endpoints
    - POST /api/v1/routes — Create route with waypoints
    - GET /api/v1/routes/:id — Retrieve saved route
    - PUT /api/v1/routes/:id — Update route waypoints (add, remove, reorder)
    - DELETE /api/v1/routes/:id — Delete route
    - POST /api/v1/routes/:id/calculate — Trigger route calculation via Google Maps
    - GET /api/v1/routes/:id/alternatives — Get alternative routes
    - Return total distance (km) and estimated driving time
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 4.1, 4.3, 4.5_

  - [x] 5.5 Write property tests for route manipulation
    - **Property 1: Waypoint Insertion Preserves and Grows** — Inserting at position P yields N+1 waypoints with correct ordering
    - **Property 2: Waypoint Reorder Preserves Set** — Reordering preserves same waypoint set, origin/destination unchanged
    - **Property 3: Waypoint Removal Shrinks and Excludes** — Removing yields N-1 waypoints, removed absent, order preserved
    - **Property 4: Failed Geocoding Preserves Route State** — On geocoding failure, route state remains identical
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7**

  - [x] 5.6 Write property tests for autocomplete and route segments
    - **Property 5: Autocomplete Triggers Only After Minimum Characters** — Returns suggestions only for length >= 3
    - **Property 6: Autocomplete Results Restricted to Europe** — All results have European country codes
    - **Property 7: Route Segments Match Waypoint Count** — N waypoints produce N-1 segments with positive distance and duration
    - **Validates: Requirements 3.1, 3.3, 4.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Trip Cost Calculator (Delivery Slice 2)
  - [x] 7.1 Implement Vehicle Profile service and API
    - Create VehicleProfile model and repository
    - Validate tank_capacity in [5, 200] liters, consumption in [1, 50] L/100km
    - Enforce max 10 profiles per user
    - Return specific validation error messages on invalid input
    - Create CRUD endpoints: GET/POST/PUT/DELETE /api/v1/vehicles
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Implement Fuel Price Service and background scraping jobs
    - Create fuel price scraper with fallback chain: CieloWeb → GlobalPetrolPrices → Google Maps
    - Implement background job scheduler (run every 6 hours)
    - Cache prices in Redis with 6-hour TTL
    - Store prices per country and fuel type in EUR/liter in PostgreSQL
    - Retain existing prices on total failure, log alert
    - Create GET /api/v1/fuel/prices endpoint
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 7.3 Implement Trip Cost Calculator service
    - Implement cost calculation algorithm: sum of (segment_km / 100 × consumption × country_price) per segment
    - Apply country-specific fuel prices for each route segment
    - Display total cost in EUR with 2 decimal places
    - Generate per-country cost breakdown for multi-country routes
    - Flag prices_outdated when any price is older than 12 hours
    - Prompt user to select vehicle if none selected
    - Create POST /api/v1/trips/:routeId/cost and GET /api/v1/trips/:routeId/cost endpoints
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 7.4 Write property tests for vehicle profiles
    - **Property 8: Vehicle Profile Round-Trip** — Store and retrieve produces identical record
    - **Property 9: Vehicle Profile Validation Boundaries** — Values in [5,200] and [1,50] accepted, outside rejected with error messages
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.6**

  - [x] 7.5 Write property tests for fuel price service
    - **Property 10: Fuel Price Fallback Chain** — Sources attempted in order, first success used
    - **Property 11: Fuel Price Retention on Total Failure** — Existing prices unchanged when all sources fail
    - **Validates: Requirements 6.2, 6.3, 6.7**

  - [x] 7.6 Write property tests for trip cost calculation
    - **Property 12: Trip Cost Calculation Correctness** — Total equals sum of per-segment costs, rounded to 2 decimals
    - **Property 13: Country Cost Breakdown Sums to Total** — Sum of country costs equals total within 0.01 EUR tolerance
    - **Property 14: Outdated Price Warning** — prices_outdated flag true when any price older than 12 hours
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Smart Refuel Stops (Delivery Slice 3)
  - [x] 9.1 Implement Refuel Advisor service
    - Calculate maximum vehicle range: (tank_capacity / consumption_per_100km) × 100
    - Suggest refuel stops before remaining range drops below 15% of tank capacity
    - Find fuel stations within 2 km of highway exits along route
    - Rank candidate stations by fuel price (lowest first)
    - Expand search radius to 5 km, then 10 km if no stations found within 2 km
    - Notify user of detour when expanded beyond 5 km
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

  - [x] 9.2 Implement Refuel Advisor API endpoints
    - POST /api/v1/refuel/:routeId/suggest — Get refuel stop suggestions
    - POST /api/v1/refuel/:routeId/accept/:stationId — Accept stop, add as waypoint, recalculate route
    - POST /api/v1/refuel/:routeId/reject/:stationId — Reject stop, offer next-best alternative
    - Create GET /api/v1/fuel/stations endpoint for nearby station lookup
    - _Requirements: 8.5, 8.6, 8.7_

  - [x] 9.3 Write property tests for refuel advisor
    - **Property 15: Refuel Stop Safety Invariant** — Distance between consecutive refuel points SHALL NOT exceed 85% of max range
    - **Property 16: Refuel Station Ranking by Price** — Suggestions ordered by fuel price ascending
    - **Property 17: Refuel Search Radius Expansion** — No stations within 5 km triggers expansion to 10 km
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.7**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Vignette Cost Tracking (Delivery Slice 6)
  - [x] 11.1 Create vignette database tables and seed data
    - Create migration for vignette_countries table (id, country_code, country_name, motorcycle_exempt, available_durations, active, updated_at)
    - Create migration for vignette_prices table (id, vignette_country_id, vehicle_type, duration, price_eur, source, fetched_at, expires_at)
    - Add indexes: idx_vignette_prices_lookup, idx_vignette_countries_code
    - Seed vignette_countries with: AT, BG, CZ, HU, MD, RO, SK, SI, CH
    - Set motorcycle_exempt = true for RO and BG
    - Set available_durations per country based on known offerings
    - _Requirements: 16.1, 16.6, 16.7_

  - [x] 11.2 Implement Vignette Service core logic
    - Create VignetteCountry and VignettePrice models and repositories
    - Implement getCountriesRequiringVignette() — return all active vignette countries
    - Implement getPrices(countryCode, vehicleType) — lookup prices from DB/cache
    - Implement getRouteVignetteRequirements(routeId) — extract unique countries from route_segments, filter to vignette countries, apply motorcycle exemption logic
    - Implement calculateVignetteCost(routeId, vehicleType, durationPreferences) — sum per-country costs based on selected durations, default to shortest available duration
    - Cache results in Redis: vignette:countries (24h TTL), vignette:prices:{country}:{vehicle_type} (24h TTL), vignette:route:{route_id} (1h TTL)
    - _Requirements: 16.1, 16.5, 16.6, 16.7, 16.9, 16.10_

  - [x] 11.3 Implement vignette price scraping background job
    - Create scraper for i-vignette.com (primary source) — parse pricing pages per country and vehicle type
    - Create scraper for vintrica.com (secondary/fallback source)
    - Implement fallback chain: attempt i-vignette.com first, fall back to vintrica.com on failure
    - Skip motorcycle scraping for exempt countries (RO, BG)
    - Schedule job to run every 24 hours
    - On total failure: retain existing cached prices, log alert
    - Persist scraped prices to vignette_prices table with expires_at = fetched_at + 24h
    - Update Redis cache after successful scrape
    - _Requirements: 16.4, 16.7, 16.8, 16.9_

  - [x] 11.4 Implement Vignette API endpoints
    - GET /api/v1/vignettes/countries — List all countries requiring vignettes (from cache or DB)
    - GET /api/v1/vignettes/prices?country={code}&vehicle_type={type} — Get vignette prices for a country and vehicle type
    - GET /api/v1/vignettes/route/:routeId — Get vignette requirements for a calculated route (which countries need vignettes, exemptions, available durations, prices)
    - GET /api/v1/vignettes/route/:routeId/cost?duration={duration} — Calculate vignette cost for a route with user-selected durations per country
    - All endpoints require authentication
    - _Requirements: 16.1, 16.2, 16.5, 16.6_

  - [x] 11.5 Integrate vignette cost with Trip Cost Calculator
    - Extend Trip Cost Calculator to call Vignette Service for route vignette requirements
    - Implement calculateTotalCost(routeId, vehicleId, durationPreferences) — returns fuel cost + vignette cost combined
    - Update POST /api/v1/trips/:routeId/cost to accept optional durationPreferences parameter
    - Update GET /api/v1/trips/:routeId/cost response to include vignette breakdown alongside fuel breakdown
    - Total trip cost = fuel cost + total vignette cost, rounded to 2 decimal places
    - _Requirements: 16.2, 16.3, 16.5, 16.10_

  - [x] 11.6 Write property test for vignette country detection
    - **Property 33: Vignette Country Detection with Motorcycle Exemption** — Route segments crossing vignette countries (AT, BG, CZ, HU, MD, RO, SK, SI, CH) are detected; motorcycle exemptions applied for RO, BG
    - **Validates: Requirements 16.1, 16.6**

  - [x] 11.7 Write property test for total trip cost with vignettes
    - **Property 34: Total Trip Cost Includes Vignettes** — Total trip cost SHALL equal fuel cost + vignette cost, rounded to 2 decimal places
    - **Validates: Requirements 16.3**

  - [x] 11.8 Write property test for vignette price fallback
    - **Property 35: Vignette Price Fallback Chain** — Sources attempted in order (i-vignette.com → vintrica.com), first success used
    - **Property 37: Vignette Price Retention on Total Failure** — Existing cached prices unchanged when all sources fail
    - **Validates: Requirements 16.4, 16.7**

  - [x] 11.9 Write property test for vignette duration and cost summation
    - **Property 36: Vignette Duration Preference Respected** — Cost for each country uses selected duration price; defaults to shortest available duration
    - **Property 38: Vignette Country Breakdown Sums to Total** — Sum of per-country vignette costs equals total vignette cost within 0.01 EUR tolerance
    - **Validates: Requirements 16.5, 16.8**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Route Export (Delivery Slice 4)
  - [x] 13.1 Implement Route Exporter service with strategy pattern
    - Create IRouteFormatExporter interface with format, maxWaypoints, export(), validate() methods
    - Implement GpxExporter — GPX 1.1 format with waypoints and track segments
    - Implement ItnExporter — TomTom ITN format
    - Implement AscExporter — ASCII waypoint format
    - Implement Ov2Exporter — TomTom OV2 POI format
    - Implement BcrExporter — Map&Guide BCR format
    - Implement TrkExporter — CompeGPS TRK format
    - Implement MpsExporter — Map&Guide MPS format
    - Implement FitExporter — Garmin FIT format
    - _Requirements: 9.1, 9.2, 9.6_

  - [x] 13.2 Implement export API and file splitting logic
    - Include all waypoints (origin, stops, destination) and accepted refuel stops in export
    - Implement file splitting when route exceeds format's max waypoints
    - Notify user when route is split into multiple files
    - Create POST /api/v1/routes/:id/export endpoint
    - _Requirements: 9.3, 9.4, 9.5_

  - [x] 13.3 Write property tests for route export
    - **Property 18: Export Round-Trip Waypoint Preservation** — Export then parse produces equivalent waypoints within GPS precision tolerance
    - **Property 19: Export File Splitting on Format Limit** — Split files' combined waypoints equal original route waypoints
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.7**

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Route History and User Profile (Delivery Slice 5 — remaining)
  - [x] 15.1 Implement route history and persistence
    - Persist finalized routes with waypoints, vehicle profile used, and cost estimate
    - Enforce max 100 routes per user
    - Return routes sorted by creation date (newest first)
    - Load saved route onto map when selected
    - Implement route deletion (permanent removal)
    - Create GET /api/v1/users/me/routes and related endpoints
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 15.2 Write property tests for route history
    - **Property 26: Route History Ordering** — Routes returned sorted by creation date descending
    - **Property 27: Route Deletion Permanence** — Deleted route returns not-found, absent from history
    - **Validates: Requirements 11.3, 11.5**

- [x] 16. Frontend implementation (Web — MDL)
  - [x] 16.1 Set up frontend project with Material Design Lite
    - Initialize frontend build tooling (Vite + TypeScript)
    - Install and configure MDL (Material Design Lite)
    - Set up API client service with JWT token management
    - Create app shell with navigation, responsive layout
    - _Requirements: 14.1, 14.3_

  - [x] 16.2 Implement authentication UI
    - Create registration form (email, password, display name)
    - Create login form (email/password)
    - Add Google SSO button and Apple SSO button
    - Implement JWT storage and auto-refresh
    - Show validation errors inline
    - _Requirements: 10.1, 10.4, 10.5, 10.11_

  - [x] 16.3 Implement route planning map UI
    - Integrate Google Maps JavaScript SDK
    - Create waypoint input fields with autocomplete (Places API)
    - Render route polyline on map, update dynamically without page reload
    - Display loading indicator during route calculation
    - Show total distance (km) and estimated driving time
    - Show per-segment distance and time
    - Support adding, removing, reordering waypoints (drag-and-drop)
    - Display alternative routes and allow selection
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.3_

  - [x] 16.4 Implement trip cost calculator UI
    - Create vehicle profile management (CRUD forms in garage)
    - Display trip cost estimate with per-country breakdown
    - Show outdated price warning when applicable
    - Prompt to select/create vehicle if none selected
    - _Requirements: 5.1, 5.5, 7.3, 7.4, 7.5, 7.6_

  - [x] 16.5 Implement vignette cost display UI
    - Show vignette requirements per country in the trip cost breakdown panel
    - Display which countries on the route require a vignette
    - Show motorcycle exemption indicator for RO and BG when vehicle is motorcycle
    - Add duration selector dropdown per country (1-day, 10-day, 1-week, 1-month, etc.)
    - Display per-country vignette cost based on selected duration
    - Show total vignette cost and combined total (fuel + vignettes)
    - Update costs dynamically when user changes duration selection
    - _Requirements: 16.2, 16.3, 16.5, 16.6_

  - [x] 16.6 Implement refuel advisor UI
    - Display suggested refuel stops on map with price info
    - Allow accept/reject of suggestions
    - Show next-best alternative on rejection
    - Indicate expanded search radius detours
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 16.7 Implement route export UI
    - Create export dialog with format selection (GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT)
    - Trigger download of exported file(s)
    - Notify user when route is split into multiple files
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 16.8 Implement route history UI
    - Display saved routes list sorted by date
    - Allow loading a saved route onto the map
    - Allow deleting saved routes
    - _Requirements: 11.3, 11.4, 11.5_

- [x] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Integration and end-to-end tests
  - [x] 18.1 Write API integration tests
    - Test full route planning flow: create → add waypoints → calculate → get alternatives
    - Test trip cost flow: create vehicle → calculate cost → verify breakdown
    - Test vignette flow: calculate route crossing AT, HU → get vignette requirements → select durations → verify total cost includes vignettes
    - Test vignette motorcycle exemption: motorcycle vehicle crossing RO → verify no vignette required
    - Test refuel flow: suggest stops → accept → verify route updated
    - Test export flow: finalize route → export each format → verify file validity
    - Test auth flows: register → login → access protected → refresh token
    - Use real PostgreSQL test database and mocked Google Maps responses
    - _Requirements: 12.1, 12.2, 14.1, 16.1, 16.3, 16.7_

  - [x] 18.2 Write end-to-end tests for critical user flows
    - Full journey: register → create route → calculate cost (fuel + vignettes) → suggest refuel → export
    - Auth edge cases: lockout → unlock → login
    - Rate limiting: exceed limit → verify 429 → wait → verify recovery
    - Vignette scraping: mock i-vignette.com failure → verify vintrica.com fallback → verify prices cached
    - _Requirements: 12.1, 12.5, 14.5, 16.4, 16.8_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between delivery slices
- Property tests validate universal correctness properties from the design document (38 properties total)
- Unit tests validate specific examples and edge cases
- Authentication (Delivery Slice 5) is implemented early as it's foundational for all other slices
- Vignette Cost Tracking (Delivery Slice 6) is placed after Trip Cost Calculator since it extends the cost calculation with vignette data
- Mobile apps (Requirement 15) are excluded from tasks as they consume the same API and require separate native projects
- All TypeScript with fast-check for property-based testing and vitest as test runner
- Vignette countries: AT (Austria), BG (Bulgaria), CZ (Czech Republic), HU (Hungary), MD (Moldova), RO (Romania), SK (Slovakia), SI (Slovenia), CH (Switzerland)
- Motorcycle-exempt countries: RO, BG
- Vignette data sources: i-vignette.com (primary), vintrica.com (secondary)
- Vignette scraping frequency: every 24 hours; Redis cache TTL: 24 hours

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 6, "tasks": ["3.5", "3.6"] },
    { "id": 7, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 8, "tasks": ["5.4"] },
    { "id": 9, "tasks": ["5.5", "5.6"] },
    { "id": 10, "tasks": ["7.1", "7.2"] },
    { "id": 11, "tasks": ["7.3"] },
    { "id": 12, "tasks": ["7.4", "7.5", "7.6"] },
    { "id": 13, "tasks": ["9.1"] },
    { "id": 14, "tasks": ["9.2"] },
    { "id": 15, "tasks": ["9.3"] },
    { "id": 16, "tasks": ["11.1"] },
    { "id": 17, "tasks": ["11.2", "11.3"] },
    { "id": 18, "tasks": ["11.4", "11.5"] },
    { "id": 19, "tasks": ["11.6", "11.7", "11.8", "11.9"] },
    { "id": 20, "tasks": ["13.1"] },
    { "id": 21, "tasks": ["13.2"] },
    { "id": 22, "tasks": ["13.3"] },
    { "id": 23, "tasks": ["15.1"] },
    { "id": 24, "tasks": ["15.2"] },
    { "id": 25, "tasks": ["16.1"] },
    { "id": 26, "tasks": ["16.2", "16.3"] },
    { "id": 27, "tasks": ["16.4", "16.5", "16.6", "16.7", "16.8"] },
    { "id": 28, "tasks": ["18.1"] },
    { "id": 29, "tasks": ["18.2"] }
  ]
}
```
