# Implementation Plan: Cost Breakdown Panel

## Overview

Implement a unified Cost Breakdown Panel on the Route Planner page that consolidates fuel costs, vignette costs, and total trip cost into a single, always-visible panel. The implementation introduces a new composite backend endpoint (`GET /api/v1/cost-breakdown/:routeId`), a pure computation module for testable cost logic, and frontend components (`CostBreakdownPanel`, `VehicleSelector`) integrated into the existing `RoutePlannerPage` class.

## Tasks

- [x] 1. Create shared types and pure computation module
  - [x] 1.1 Define TypeScript interfaces and types for cost breakdown data
    - Create `frontend/src/services/costCalculations.ts` with interfaces: `RouteSegmentCost`, `VignetteSelection`, `CostBreakdownData`, `FuelCountryBreakdown`, `VignetteCountryBreakdown`
    - Define `VignetteDuration` type and `DURATION_ORDER` mapping (reuse from backend model or duplicate for frontend)
    - Export `PanelState` type: `'empty' | 'loading' | 'loaded' | 'error'`
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.1_

  - [x] 1.2 Implement pure cost calculation functions
    - Implement `calculateSegmentFuelCost(distanceKm, consumptionPer100km, pricePerLiter)` returning rounded result
    - Implement `calculateTotalFuelCost(segments, consumptionPer100km, fuelPrices)` filtering sub-1km segments and returning `{ total, breakdown }` in traversal order
    - Implement `selectDefaultDuration(availableDurations)` returning shortest by DURATION_ORDER
    - Implement `calculateTotalVignetteCost(selections)` summing non-exempt, non-unavailable entries
    - Implement `formatEur(amount)` returning `€X.XX` string
    - Implement `calculateTripTotal(fuelCost, vignetteCost)` returning `{ total, isPartial }`
    - _Requirements: 3.3, 3.4, 4.3, 4.4, 5.1, 5.3_

  - [x] 1.3 Write property test: Fuel cost formula correctness (Property 1)
    - **Property 1: Fuel cost formula correctness**
    - For any segment with distance ≥ 1 km, consumption in [1, 50], and price > 0, verify `calculateSegmentFuelCost` equals `(distanceKm / 100) × consumptionPer100km × pricePerLiter` rounded to 2 decimals, and `calculateTotalFuelCost` total equals sum of per-segment costs
    - **Validates: Requirements 3.1, 3.3**

  - [x] 1.4 Write property test: Traversal order preservation (Property 2)
    - **Property 2: Traversal order preservation**
    - For any sequence of route segments, verify the breakdown output lists countries in first-occurrence order matching the input segment sequence
    - **Validates: Requirements 3.2**

  - [x] 1.5 Write property test: Sub-1km segment filtering (Property 3)
    - **Property 3: Sub-1km segment filtering**
    - For any set of segments, verify segments with distance < 1 km do not appear in breakdown and their cost is excluded from total
    - **Validates: Requirements 3.4**

  - [x] 1.6 Write property test: Vignette total equals sum of selected durations (Property 4)
    - **Property 4: Vignette total equals sum of selected durations**
    - For any set of vignette selections with known prices, verify total equals sum of non-exempt, non-unavailable prices rounded to 2 decimals
    - **Validates: Requirements 4.1, 4.4**

  - [x] 1.7 Write property test: Default duration is shortest available (Property 6)
    - **Property 6: Default duration is shortest available**
    - For any non-empty set of available durations, verify `selectDefaultDuration` returns the one with lowest DURATION_ORDER value
    - **Validates: Requirements 4.3**

  - [x] 1.8 Write property test: Motorcycle exemption zeroes cost (Property 7)
    - **Property 7: Motorcycle exemption zeroes cost**
    - For any country where motorcycle_exempt is true and vehicle type is motorcycle, verify vignette cost is 0 and marked exempt
    - **Validates: Requirements 4.5**

  - [x] 1.9 Write property test: Total trip cost is sum of components (Property 8)
    - **Property 8: Total trip cost is sum of components**
    - For any fuel cost F ≥ 0 and vignette cost V ≥ 0, verify `calculateTripTotal` returns F + V rounded to 2 decimals
    - **Validates: Requirements 5.1**

  - [x] 1.10 Write property test: Currency formatting (Property 9)
    - **Property 9: Currency formatting**
    - For any non-negative number, verify `formatEur` output matches pattern `€X.XX` with exactly 2 decimal places
    - **Validates: Requirements 5.3**

- [x] 2. Implement backend composite endpoint
  - [x] 2.1 Create cost breakdown route handler
    - Create `src/routes/costBreakdown.ts` with `GET /api/v1/cost-breakdown/:routeId`
    - Accept query params: `vehicleId` (required), `durations` (optional JSON string of duration overrides)
    - Add auth middleware guard (return 401 if unauthenticated)
    - Verify route ownership (return 403 if not owner)
    - Return 400 if vehicleId missing, 404 if route not found
    - _Requirements: 2.5, 7.1_

  - [x] 2.2 Implement composite cost calculation service function
    - Create `src/services/costBreakdownService.ts` with `getCostBreakdown(routeId, vehicleId, durationOverrides)`
    - Call existing `calculateTripCost` for fuel data and `calculateVignetteCost` for vignette data
    - Compose response matching `CostBreakdownData` interface from design
    - Set `isPartialEstimate: true` when any country fuel price or vignette price is unavailable
    - Filter out sub-1km segments from fuel breakdown
    - Include `vehicleProfile` summary in response (id, name, fuelType, consumptionPer100km)
    - Include `availableDurations` per vignette country for frontend duration selector
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.5, 4.7, 5.1, 5.4, 7.2_

  - [x] 2.3 Register the new route in the Express app
    - Import and mount `costBreakdownRouter` at `/api/v1/cost-breakdown` in `src/index.ts`
    - Apply auth middleware to the route
    - _Requirements: 2.5_

  - [x] 2.4 Write unit tests for cost breakdown endpoint
    - Test auth guard (401 without token)
    - Test route ownership check (403 for non-owner)
    - Test missing vehicleId (400)
    - Test route not found (404)
    - Test successful response shape matches `CostBreakdownData` interface
    - Test partial estimate flag when fuel price unavailable
    - Test motorcycle exemption in vignette breakdown
    - _Requirements: 2.5, 4.5, 5.4, 7.1, 7.2_

- [x] 3. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement VehicleSelector component
  - [x] 4.1 Create VehicleSelector frontend component
    - Create `frontend/src/components/VehicleSelector.ts`
    - Implement `VehicleSelectorOptions` interface with `container` and `onSelect` callback
    - Render a `<select>` dropdown populated with vehicle profiles (name, vehicle type, fuel type)
    - Default to no selection (placeholder: "Select a vehicle...")
    - Handle empty profiles state: show prompt to create a vehicle with link
    - Handle unauthenticated state: show login required message
    - Fire `onSelect` callback when user selects a profile
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.2 Write unit tests for VehicleSelector
    - Test rendering with profiles list
    - Test empty state (no profiles)
    - Test selection callback fires with correct vehicleId
    - Test default no-selection state
    - _Requirements: 2.1, 2.4, 2.6_

- [x] 5. Implement CostBreakdownPanel component
  - [x] 5.1 Create CostBreakdownPanel class with state machine
    - Create `frontend/src/components/CostBreakdownPanel.ts`
    - Implement state machine: empty → loading → loaded → error, with collapsed sub-state
    - Implement constructor accepting `CostBreakdownPanelOptions` (container, onVehicleChange)
    - Implement public methods: `setRouteCalculating()`, `setRouteResult(routeId)`, `setRouteFailed()`, `setVehicleProfiles(profiles)`, `destroy()`
    - Track `retryCount` (max 3), `routeId`, `selectedVehicleId`, `costData`, `errorMessage`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 5.2 Implement empty and loading state rendering
    - Empty state: descriptive icon, title "No route available", prompt text "Calculate a route to see cost estimates"
    - Loading state: loading spinner/indicator replacing panel content
    - Transition to loading when route calculation starts or vehicle changes
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 5.3 Implement loaded state rendering with cost data
    - Render total trip cost at top with larger font weight (visually distinguished)
    - Render fuel section: total fuel cost + per-country breakdown in traversal order (country name, distance km, fuel cost EUR)
    - Render vignette section: total vignette cost + per-country list (country name, selected duration dropdown, price EUR)
    - Show "exempt" label for motorcycle-exempt countries
    - Show "unavailable" badge for countries with missing price data
    - Show "No vignettes required" message when no vignette countries on route
    - Format all monetary values as €X.XX
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.5, 4.6, 4.7, 5.1, 5.3_

  - [x] 5.4 Implement vignette duration change handling
    - Add duration `<select>` per vignette country populated with `availableDurations`
    - On duration change, store override in `durationOverrides` state
    - Re-fetch cost breakdown with updated durations query param
    - Update total vignette cost and total trip cost on response
    - _Requirements: 4.3, 4.4, 5.2_

  - [x] 5.5 Implement collapse/expand toggle
    - Add toggle button (keyboard-operable, aria-expanded attribute)
    - Collapsed state: show only total trip cost + toggle button in single-row header
    - Expanded state: show full itemized breakdown
    - Expand uses cached data (no new API request)
    - Reset to expanded when new route calculation completes
    - Default to expanded when cost data first displayed
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.6 Implement error state and retry logic
    - Show error message describing failure reason
    - Show retry button (re-triggers cost calculation)
    - Disable retry button after 3 consecutive attempts
    - On network timeout (15s): show connectivity error, retain previous data
    - On successful new calculation: clear error state
    - Handle partial estimates: show "Partial estimate" label with available components
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 5.7 Implement API integration with abort controller and timeout
    - Use `apiClient.get()` to call `GET /api/v1/cost-breakdown/:routeId`
    - Pass `vehicleId` and optional `durations` as query params
    - Implement 15-second timeout with AbortController
    - Handle 401 (show login required), 404 (show route not found), 500 (show generic error with retry)
    - _Requirements: 7.1, 7.3_

  - [x] 5.8 Write property test: Vignette entry completeness (Property 5)
    - **Property 5: Vignette entry completeness**
    - For any country on the route requiring a vignette, verify the breakdown entry contains country name, selected duration, and price (or unavailable indicator)
    - **Validates: Requirements 4.2**

  - [x] 5.9 Write unit tests for CostBreakdownPanel state transitions
    - Test empty → loading → loaded flow
    - Test empty → loading → error flow
    - Test loaded → loading (new route) → loaded flow
    - Test error → loading (retry) → loaded flow
    - Test retry count maxes at 3
    - Test collapse/expand toggle preserves data
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.4, 7.1_

- [x] 6. Checkpoint - Core components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate panel into RoutePlannerPage
  - [x] 7.1 Wire CostBreakdownPanel into RoutePlannerPage
    - Add panel container element in `RoutePlannerPage.build()` below the waypoints card
    - Instantiate `CostBreakdownPanel` in `RoutePlannerPage.constructor()` or `bindEvents()`
    - Call `panel.setRouteCalculating()` when route calculation starts
    - Call `panel.setRouteResult(routeId)` on successful route response
    - Call `panel.setRouteFailed()` on route calculation failure
    - Fetch user's vehicle profiles and pass to `panel.setVehicleProfiles()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1_

  - [x] 7.2 Implement responsive layout (sidebar vs. collapsible)
    - Add CSS for sidebar layout (≥1024px): panel renders to the right of the map, min-width 320px
    - Add CSS for mobile layout (<1024px): panel renders below map as full-width collapsible, collapsed by default
    - Add `matchMedia` listener for 1024px breakpoint to toggle layout class
    - Ensure transition between layouts within 300ms (CSS transition)
    - Verify panel does not overlap map or waypoint inputs at any width 320px–3840px
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 7.3 Write unit tests for RoutePlannerPage integration
    - Test panel is instantiated and rendered in correct container
    - Test panel lifecycle methods called on route calculation events
    - Test vehicle profiles loaded on page init
    - _Requirements: 1.1, 2.1_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend composite endpoint reuses existing `tripCostService` and `vignetteService` — no new DB tables needed
- The frontend follows the existing page-class pattern (vanilla TypeScript, no framework)
- fast-check is already installed (v3.23.2) for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 6, "tasks": ["5.8", "5.9", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] }
  ]
}
```
