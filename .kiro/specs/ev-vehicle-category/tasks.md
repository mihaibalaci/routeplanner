# Implementation Plan: EV Vehicle Category

## Overview

This plan implements EV vehicle support across the Route Planner Platform: database migration, backend model/service/route updates, frontend vehicle list and detail panel components, and ChargeMap charging station integration. Each task builds incrementally, with property-based tests validating correctness properties from the design.

## Tasks

- [x] 1. Database migration and model updates
  - [x] 1.1 Create database migration `migrations/1700000004000_add-ev-vehicle-type.js`
    - Add `battery_capacity_kwh` (DECIMAL(5,1) NULL), `consumption_kwh_per_100km` (DECIMAL(4,1) NULL), `charge_port_type` (VARCHAR(20) NULL), `is_default` (BOOLEAN NOT NULL DEFAULT false) columns
    - Make `fuel_type`, `tank_capacity_liters`, `consumption_per_100km` nullable
    - Update `vehicle_type` CHECK constraint to include 'ev'
    - Update `fuel_type` CHECK constraint to include 'electric' and allow NULL
    - Update `tank_capacity_liters` and `consumption_per_100km` CHECK constraints to allow NULL
    - Add EV-specific CHECK constraints (battery 10–200, consumption 5–50, charge_port_type enum)
    - Add partial index `idx_vehicle_profiles_user_default` on `(user_id, is_default) WHERE is_default = true`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.1_

  - [x] 1.2 Update TypeScript model `src/models/vehicleProfile.ts`
    - Add `'ev'` to `VehicleType` union and `VALID_VEHICLE_TYPES` array
    - Add `'electric'` to `FuelType` union and `VALID_FUEL_TYPES` array
    - Add `ChargePortType` type and `VALID_CHARGE_PORT_TYPES` constant
    - Add `BATTERY_CAPACITY_MIN`, `BATTERY_CAPACITY_MAX`, `CONSUMPTION_KWH_MIN`, `CONSUMPTION_KWH_MAX` constants
    - Update `VehicleProfile` interface: add `battery_capacity_kwh`, `consumption_kwh_per_100km`, `charge_port_type` (nullable), `is_default`; make `fuel_type`, `tank_capacity_liters`, `consumption_per_100km` nullable
    - Update `CreateVehicleProfileInput` and `UpdateVehicleProfileInput` with optional EV fields
    - Update `VehicleProfileResponse` and `toVehicleProfileResponse` to include EV fields and `is_default`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3_

- [x] 2. Backend service validation and default vehicle logic
  - [x] 2.1 Update validation in `src/services/vehicleProfileService.ts`
    - Add conditional validation: if `vehicle_type === 'ev'`, require `battery_capacity_kwh`, `consumption_kwh_per_100km`, `charge_port_type`; allow `tank_capacity_liters`/`fuel_type` to be omitted
    - If `vehicle_type !== 'ev'`, require `fuel_type`, `tank_capacity_liters`, `consumption_per_100km` as before; ignore EV fields
    - Validate `battery_capacity_kwh` in range [10, 200]
    - Validate `consumption_kwh_per_100km` in range [5, 50]
    - Validate `charge_port_type` against `VALID_CHARGE_PORT_TYPES`
    - Update `createProfile` and `updateProfile` to handle EV fields in INSERT/UPDATE queries using parameterized queries
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.2, 10.1_

  - [x] 2.2 Write property test: Conditional field requirements (Property 1)
    - **Property 1: Conditional field requirements based on vehicle type**
    - Generate random vehicle inputs with varying types and field presence; verify validation accepts/rejects correctly
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 1.5, 1.6, 3.1, 3.6, 9.1, 9.2**

  - [x] 2.3 Write property test: Battery capacity range (Property 2)
    - **Property 2: Battery capacity range validation**
    - Generate random numbers; verify acceptance iff in [10, 200]
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 1.7, 3.3**

  - [x] 2.4 Write property test: Energy consumption range (Property 3)
    - **Property 3: Energy consumption range validation**
    - Generate random numbers; verify acceptance iff in [5, 50]
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 1.8, 3.4**

  - [x] 2.5 Write property test: Charge port type enum (Property 4)
    - **Property 4: Charge port type enum validation**
    - Generate random strings; verify acceptance iff in valid set
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 3.5**

  - [x] 2.6 Implement `setDefaultVehicle` in `src/services/vehicleProfileService.ts`
    - Add function `setDefaultVehicle(userId, vehicleId)` that sets `is_default = true` on target and `is_default = false` on all others for that user within a transaction
    - Add function `getDefaultVehicle(userId)` that returns the explicit default or falls back to most recently created vehicle
    - _Requirements: 5.2, 5.3_

  - [x] 2.7 Write property test: Default vehicle uniqueness (Property 5)
    - **Property 5: Default vehicle uniqueness invariant**
    - Generate random vehicle arrays, apply setDefault logic, verify exactly one has `is_default = true`
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 5.2**

  - [x] 2.8 Write property test: Implicit default fallback (Property 6)
    - **Property 6: Implicit default fallback**
    - Generate random vehicle arrays with no explicit default, verify most recent `created_at` is selected
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 5.3**

- [x] 3. Checkpoint - Ensure all backend service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend API routes and authorization
  - [x] 4.1 Update vehicle routes in `src/routes/vehicles.ts`
    - Update `POST /api/v1/vehicles` to accept EV-specific fields in request body
    - Update `PUT /api/v1/vehicles/:id` to accept EV-specific fields in request body
    - Add `PUT /api/v1/vehicles/:id/default` endpoint to set a vehicle as default
    - Update `GET /api/v1/vehicles` response to include `battery_capacity_kwh`, `consumption_kwh_per_100km`, `charge_port_type`, `is_default`
    - Update `GET /api/v1/vehicles/:id` response to include all EV and default fields
    - Ensure vehicle ownership verification on all endpoints (return 403 for cross-user access)
    - Ensure 401 for unauthenticated requests
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.4, 10.2, 10.3, 10.4_

  - [x] 4.2 Write property test: API response shape (Property 7)
    - **Property 7: API response shape correctness**
    - Generate random profiles, serialize via `toVehicleProfileResponse`, verify all fields present with correct nullability
    - File: `src/services/vehicleProfileService.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 9.3**

  - [x] 4.3 Write property test: Vehicle ownership authorization (Property 11)
    - **Property 11: Vehicle ownership authorization**
    - Generate random user/vehicle pairs, verify cross-user access is denied with 403
    - File: `src/routes/vehicles.test.ts`
    - **Validates: Requirements 10.2, 10.4**

- [x] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Frontend Vehicle List Component
  - [x] 6.1 Create `frontend/src/components/VehicleListComponent.ts`
    - Implement `VehicleListComponent` class with `VehicleListOptions` interface (container, onSelect callback)
    - Render a flat grid of vehicle cards, each showing: vehicle name, vehicle_type icon/badge (car, motorcycle, camper, EV ⚡), default indicator (star badge if `is_default`)
    - Show "Create a vehicle" prompt when profiles array is empty
    - Implement `render()`, `setProfiles()`, `getSelectedId()`, `destroy()` methods
    - Replace usage of `VehicleSelector` dropdown in pages that reference it
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.2 Write property test: Vehicle list rendering completeness (Property 8)
    - **Property 8: Vehicle list rendering completeness**
    - Generate random profile arrays, render component in jsdom, verify DOM has correct number of cards with correct name, type badge, and default indicator
    - File: `frontend/src/components/VehicleListComponent.test.ts`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 7. Frontend Vehicle Detail Panel
  - [x] 7.1 Create `frontend/src/components/VehicleDetailPanel.ts`
    - Implement `VehicleDetailPanel` class with `VehicleDetailPanelOptions` interface (container, onClose callback)
    - For EV vehicles: display battery_capacity_kwh, consumption_kwh_per_100km, charge_port_type, and computed estimated range `(battery_capacity_kwh / consumption_kwh_per_100km) * 100` rounded to 1 decimal
    - For ICE vehicles: display fuel_type, tank_capacity_liters, consumption_per_100km
    - Implement `show(vehicle)`, `hide()` methods with close button
    - Wire click events from `VehicleListComponent` to open the detail panel
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.2 Write property test: Detail panel conditional field display (Property 9)
    - **Property 9: Detail panel conditional field display**
    - Generate random profiles, render panel in jsdom, verify correct field set displayed per vehicle type
    - File: `frontend/src/components/VehicleDetailPanel.test.ts`
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x] 7.3 Write property test: EV range calculation (Property 10)
    - **Property 10: EV range calculation correctness**
    - Generate random battery/consumption pairs (both > 0), verify displayed range equals `(battery / consumption) * 100` rounded to 1 decimal
    - File: `frontend/src/services/evCalculations.test.ts`
    - **Validates: Requirements 7.4**

- [x] 8. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. ChargeMap integration and charging station layer
  - [x] 9.1 Create `src/services/chargeMapService.ts`
    - Implement `ChargingStation` and `BoundingBox` interfaces
    - Implement `fetchChargingStations(bbox)` that calls ChargeMap public API filtered by bounding box
    - Implement `isApiAvailable()` health check
    - Handle API errors gracefully, returning empty array on failure
    - _Requirements: 8.2, 8.3_

  - [x] 9.2 Create `frontend/src/components/ChargingStationLayer.ts`
    - Implement `ChargingStationLayer` class with `ChargingStationLayerOptions` (map instance)
    - `show(routeBounds)`: fetch stations via API; on failure, embed ChargeMap iframe widget as fallback
    - `hide()`: remove markers and iframe
    - Add clickable markers with info windows showing station name, connector types, availability
    - _Requirements: 8.1, 8.3, 8.4, 8.6_

  - [x] 9.3 Integrate charging station layer in Route Planner page
    - In `frontend/src/pages/RoutePlannerPage.ts`, instantiate `ChargingStationLayer` on the map
    - Show the layer when selected vehicle is EV and a route is displayed
    - Hide the layer when selected vehicle is not EV
    - _Requirements: 8.1, 8.5_

- [x] 10. Final wiring and backward compatibility
  - [x] 10.1 Update `frontend/src/pages/RoutePlannerPage.ts` to use `VehicleListComponent`
    - Replace `VehicleSelector` usage with `VehicleListComponent`
    - Wire vehicle selection to update cost breakdown and charging station layer
    - Ensure existing ICE vehicle workflows remain unchanged
    - _Requirements: 6.6, 9.4_

  - [x] 10.2 Update `frontend/src/components/CostBreakdownPanel.ts` to handle EV vehicles
    - Adjust cost breakdown display for EV vehicles (no fuel cost, show energy cost if applicable)
    - Ensure ICE vehicle cost breakdown remains unchanged
    - _Requirements: 9.3, 9.4_

  - [x] 10.3 Write unit tests for ChargeMap service
    - Test `fetchChargingStations` with mocked API responses
    - Test `isApiAvailable` returning true/false
    - Test graceful fallback behavior
    - File: `src/services/chargeMapService.test.ts`
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses `fast-check` (v3.23.2) for property-based testing and `vitest` for the test runner
- All database queries must use parameterized queries (no string interpolation)
- Frontend uses vanilla TypeScript only — no React, no new frameworks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.6"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.7", "2.8"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["6.1", "7.1", "9.1"] },
    { "id": 6, "tasks": ["6.2", "7.2", "7.3", "9.2"] },
    { "id": 7, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3"] }
  ]
}
```
