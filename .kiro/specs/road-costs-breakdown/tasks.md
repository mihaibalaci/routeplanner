# Implementation Plan: Road Costs Breakdown

## Overview

Extend the existing cost breakdown system to include road costs (vignettes, bridge tolls, highway tolls). The backend gains a new `tollService.ts` that calls the Google Routes API with `extraComputations: ["TOLLS"]`, the `costBreakdownService.ts` is refactored to compose a unified `roadCosts` object, and the frontend `CostBreakdownPanel` renders a new "Road Costs" subsection with duration dropdowns, toll groups, and a subtotal.

## Tasks

- [x] 1. Define road costs interfaces and types
  - [x] 1.1 Create `src/models/roadCosts.ts` with TypeScript interfaces
    - Define `GoogleRoutesTollInfo`, `ParsedTollEntry`, `BridgeTollEntry`, `HighwayTollEntry`, `VignetteEntry`, `RoadCosts`, `TollServiceResult`, and `CostBreakdownData` (updated) interfaces
    - Export all interfaces for use by backend services and frontend
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Update `frontend/src/services/costCalculations.ts` with frontend road costs types
    - Add `BridgeTollEntry`, `HighwayTollEntry`, `VignetteEntry`, and `RoadCosts` interfaces matching the backend response
    - Update `CostBreakdownData` interface to include `roadCosts` field replacing top-level `vignettes`
    - Add `calculateRoadCostsSubtotal` helper function
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_

- [x] 2. Implement toll service (Google Routes API integration)
  - [x] 2.1 Create `src/services/tollService.ts`
    - Implement `getTollsForRoute(origin, destination, waypoints?)` function
    - Call Google Routes API `computeRoutes` with `extraComputations: ["TOLLS"]` using `GOOGLE_MAPS_API_KEY`
    - Parse response to extract toll entries with name, cost, and category (bridge/highway)
    - Use heuristics on toll names to categorize as bridge vs highway (names containing "bridge", "tunnel", "crossing" → bridge; others → highway)
    - Handle API errors and timeouts (>10s) gracefully by returning `null`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 Write property test for toll parsing (Property 1)
    - **Property 1: Toll parsing extracts all entries with required fields**
    - For any valid Google Routes API toll response containing N toll entries, the parsed result SHALL contain exactly N entries, each with a non-empty name, a non-negative cost, and a category of "bridge" or "highway"
    - **Validates: Requirements 1.2**

  - [x] 2.3 Write unit tests for `tollService.ts`
    - Test successful toll retrieval and parsing
    - Test API error handling returns null
    - Test timeout handling returns null
    - Test empty toll response returns empty arrays
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Checkpoint - Ensure toll service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend cost breakdown service with road costs
  - [x] 4.1 Modify `src/services/costBreakdownService.ts` to integrate toll service and restructure response
    - Import and call `getTollsForRoute()` during cost composition
    - Restructure vignette data into `VignetteEntry` format with `countryCode`, `countryName`, `duration`, `cost`, `availableDurations`
    - Compose `roadCosts` object with `vignettes`, `bridgeTolls`, `highwayTolls`, and `totalRoadCostsEur`
    - Calculate `totalRoadCostsEur` as sum of all vignette costs + bridge tolls + highway tolls, rounded to 2 decimal places
    - Update `totalCostEur` to be fuel + road costs
    - Set `isPartialEstimate: true` when toll API fails
    - Remove top-level `vignettes` field, replace with `roadCosts`
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 6.1_

  - [x] 4.2 Write property test for road costs total calculation (Property 3)
    - **Property 3: Road costs total equals sum of components**
    - For any set of vignette costs, bridge toll costs, and highway toll costs, `totalRoadCostsEur` SHALL equal the sum of all individual costs rounded to 2 decimal places
    - **Validates: Requirements 2.5**

  - [x] 4.3 Write property test for total cost calculation (Property 9)
    - **Property 9: Total cost equals fuel plus road costs**
    - For any cost breakdown with fuel cost F and road costs R, `totalCostEur` SHALL equal `F + R` rounded to 2 decimal places
    - **Validates: Requirements 6.1**

  - [x] 4.4 Write property test for duration override lookup (Property 4)
    - **Property 4: Duration override lookup correctness**
    - For any country with available vignette durations and a valid duration override, the service SHALL return the price corresponding to the overridden duration
    - **Validates: Requirements 4.3**

  - [x] 4.5 Write unit tests for modified `costBreakdownService.ts`
    - Test road costs response structure completeness
    - Test graceful degradation when toll API fails (isPartialEstimate: true)
    - Test totalCostEur includes road costs
    - Test duration overrides are applied correctly
    - _Requirements: 2.1, 2.5, 4.3, 6.1_

- [x] 5. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update frontend CostBreakdownPanel to render road costs
  - [x] 6.1 Modify `frontend/src/components/CostBreakdownPanel.ts` to render "Road Costs" subsection
    - Replace `renderVignetteSection()` with `renderRoadCostsSection()`
    - Render "Road Costs" subsection below fuel section with vignettes group, bridge tolls group, highway tolls group, and road costs subtotal
    - Render duration dropdown per vignette country defaulting to shortest available duration
    - Display only available durations per country in each dropdown
    - Conditionally hide "Bridge Tolls" group when `bridgeTolls` array is empty
    - Conditionally hide "Highway Tolls" group when `highwayTolls` array is empty
    - On duration change, send new request with updated duration override
    - Update panel header total to reflect new `totalCostEur` including road costs
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2_

  - [x] 6.2 Write unit tests for CostBreakdownPanel road costs rendering
    - Test "Road Costs" subsection renders below fuel section
    - Test vignettes display country name, duration, and cost
    - Test bridge tolls group hidden when empty
    - Test highway tolls group hidden when empty
    - Test road costs subtotal displays correct sum
    - Test duration dropdown triggers re-fetch
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 7. Ensure auth and middleware compliance
  - [x] 7.1 Verify existing route endpoint auth and ownership validation covers road costs
    - Confirm the cost breakdown endpoint requires authentication via existing auth middleware
    - Confirm route ownership validation is applied before returning road cost data
    - Confirm `requestId` is included in all error responses
    - No new code expected if existing middleware already covers this — verify and document
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Final checkpoint - Build verification and full test pass
  - Run `tsc --noEmit` in both backend and frontend projects to confirm zero type errors
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.1_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design specifies TypeScript as the implementation language (used throughout existing codebase)
- The `roadCosts` field replaces the top-level `vignettes` field — this is a breaking change to the API response shape

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["6.1", "7.1"] },
    { "id": 6, "tasks": ["6.2"] }
  ]
}
```
