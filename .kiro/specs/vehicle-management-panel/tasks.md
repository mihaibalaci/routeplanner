# Implementation Plan: Vehicle Management Panel

## Overview

Implement a "My Vehicles" page with split-panel layout, enhanced backend API endpoints (list with route count, detail with route count, set-default), a database migration for `is_default`, auto-default logic on first vehicle creation, and VehicleSelector auto-selection of the default vehicle. The implementation uses TypeScript across the full stack (Express + PostgreSQL backend, vanilla TS + Vite frontend).

## Tasks

- [ ] 1. Database migration and model updates
  - [ ] 1.1 Create database migration to add `is_default` column
    - Create `migrations/1700000003000_add-is-default-column.js`
    - Add `is_default BOOLEAN NOT NULL DEFAULT false` to `vehicle_profiles`
    - Include reversible `down` migration that drops the column
    - _Requirements: 5.1, 5.2_

  - [ ] 1.2 Update VehicleProfile TypeScript interfaces
    - Add `is_default: boolean` to the existing `VehicleProfile` interface in `src/models/vehicleProfile.ts`
    - Add `VehicleListItem` interface with `id`, `name`, `vehicle_type`, `is_default`, `route_count`
    - Add `VehicleDetailResponse` interface with all profile fields plus `route_count`
    - Add `SetDefaultVehicleResponse` interface
    - _Requirements: 10.1, 10.2_

- [ ] 2. Backend service layer enhancements
  - [ ] 2.1 Implement `getProfilesWithRouteCount` in `src/services/vehicleProfileService.ts`
    - Query vehicle profiles with LEFT JOIN to `trip_costs` and `routes` (status = 'finalized')
    - Return `VehicleListItem[]` with computed `route_count`
    - _Requirements: 1.1, 1.2_

  - [ ] 2.2 Implement `getProfileWithRouteCount` in `src/services/vehicleProfileService.ts`
    - Query single vehicle profile with route count via same JOIN logic
    - Return `VehicleDetailResponse | null`
    - _Requirements: 2.1, 2.2_

  - [ ] 2.3 Implement `setDefaultVehicle` in `src/services/vehicleProfileService.ts`
    - Use existing `transaction()` utility from `src/utils/database.ts`
    - Clear `is_default` on all user vehicles, set `is_default = true` on target
    - Return updated profile with route count
    - _Requirements: 3.1, 3.5_

  - [ ] 2.4 Enhance `createProfile` with auto-default logic
    - Check if user has zero existing profiles; if so, set `is_default = true`
    - Otherwise set `is_default = false` on new profile
    - _Requirements: 4.1, 4.2_

  - [ ]* 2.5 Write property tests for service layer
    - **Property 1: Route count equals finalized routes with trip_costs**
    - **Property 2: Single default vehicle invariant**
    - **Property 3: Auto-default on first vehicle creation**
    - **Validates: Requirements 1.2, 2.2, 3.1, 3.5, 4.1, 4.2**

  - [ ]* 2.6 Write unit tests for service layer
    - Test `getProfilesWithRouteCount` returns correct counts
    - Test `setDefaultVehicle` clears other defaults
    - Test `createProfile` auto-default logic for first vs subsequent vehicles
    - _Requirements: 1.2, 3.1, 4.1, 4.2_

- [ ] 3. Backend route endpoints
  - [ ] 3.1 Enhance GET `/api/v1/vehicles` in `src/routes/vehicles.ts`
    - Call `getProfilesWithRouteCount` instead of existing list function
    - Return response with `is_default` and `route_count` fields
    - Maintain existing 401 handling for unauthenticated requests
    - _Requirements: 1.1, 1.3_

  - [ ] 3.2 Enhance GET `/api/v1/vehicles/:id` in `src/routes/vehicles.ts`
    - Call `getProfileWithRouteCount` for detail endpoint
    - Return 404 if not found, 403 if belongs to different user
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ] 3.3 Add PATCH `/api/v1/vehicles/:id/default` endpoint
    - Validate authentication (401), existence (404), ownership (403)
    - Call `setDefaultVehicle` and return updated profile
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.4 Write unit tests for vehicle route endpoints
    - Test GET list returns `is_default` and `route_count`
    - Test GET detail returns full profile with route count
    - Test PATCH default returns 200 with updated profile
    - Test error cases: 401, 403, 404
    - _Requirements: 1.1, 1.3, 2.3, 2.4, 3.3, 3.4_

- [ ] 4. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Frontend components
  - [ ] 5.1 Create `VehicleListPanel` component
    - Create `frontend/src/components/VehicleListPanel.ts`
    - Render scrollable list of vehicles with name and type-specific icon (car, motorcycle, camper)
    - Display default badge/highlight on the default vehicle
    - Emit selection callback on click
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 5.2 Create `VehicleDetailPanel` component
    - Create `frontend/src/components/VehicleDetailPanel.ts`
    - Display full vehicle details: name, type, fuel type, tank capacity, consumption, route count
    - Include "Set as Default" toggle control
    - Show placeholder message when no vehicle is selected
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 5.3 Write unit tests for VehicleListPanel
    - **Property 4: Vehicle list item rendering includes name and type icon**
    - **Property 5: Default vehicle badge visibility in list**
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 5.4 Write unit tests for VehicleDetailPanel
    - **Property 6: Vehicle detail panel displays all required fields**
    - **Validates: Requirements 7.1**

- [ ] 6. Vehicle Management Page and routing
  - [ ] 6.1 Create `VehicleManagementPage` in `frontend/src/pages/VehicleManagementPage.ts`
    - Orchestrate `VehicleListPanel` and `VehicleDetailPanel` in split-panel layout
    - Fetch vehicle list on mount via GET `/api/v1/vehicles`
    - Handle vehicle selection: fetch detail via GET `/api/v1/vehicles/:id`
    - Handle set-default: call PATCH `/api/v1/vehicles/:id/default` and update UI
    - _Requirements: 6.3, 7.3_

  - [ ] 6.2 Add responsive CSS for split-panel layout
    - Side-by-side layout at viewport ≥ 1024px
    - Stacked layout below 1024px
    - Scrollable list panel on all screen sizes
    - Add styles to `frontend/src/styles/main.css`
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 6.3 Register `/vehicles` route in `frontend/src/main.ts`
    - Add route entry for VehicleManagementPage
    - Add navigation link to "My Vehicles" in AppShell
    - _Requirements: 6.1_

- [ ] 7. VehicleSelector default auto-selection
  - [ ] 7.1 Enhance `VehicleSelector` in `frontend/src/components/VehicleSelector.ts`
    - Modify `setProfiles` to auto-select the vehicle with `is_default = true`
    - Only auto-select if no vehicle is already selected
    - Preserve existing behavior when no default is set
    - _Requirements: 9.1, 9.2_

  - [ ]* 7.2 Write unit test for VehicleSelector auto-selection
    - **Property 7: VehicleSelector auto-selects default vehicle**
    - **Validates: Requirements 9.1**

- [ ] 8. Frontend type definitions
  - [ ] 8.1 Add frontend TypeScript interfaces
    - Define `VehicleListItem` and `VehicleDetail` interfaces in a shared types file or within components
    - Ensure types match backend response shapes
    - _Requirements: 10.3_

- [ ] 9. Integration and wiring
  - [ ] 9.1 Wire API client calls for vehicle management
    - Add `getVehicles()`, `getVehicleDetail(id)`, `setDefaultVehicle(id)` to `frontend/src/api/client.ts`
    - Connect VehicleManagementPage to API client
    - _Requirements: 1.1, 2.1, 3.1_

  - [ ]* 9.2 Write integration tests for vehicle management flow
    - Test full flow: list vehicles → select → view detail → set default
    - Test error handling: network errors show toast, 401 redirects to login
    - _Requirements: 6.3, 7.3, 9.1_

- [ ] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout (Express backend + vanilla TS frontend with Vite)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "8.1"] },
    { "id": 2, "tasks": ["2.5", "2.6", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "6.1", "6.2", "9.1"] },
    { "id": 5, "tasks": ["6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "9.2"] }
  ]
}
```
