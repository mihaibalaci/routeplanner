# Implementation Plan: Route Save & Reload

## Overview

This plan implements full round-trip route management: loading saved routes into the Route Planner, modifying waypoints, recalculating, updating or saving as new, and exporting from both the Route Planner and History page. The implementation extends the existing backend PUT endpoint with a `replace_waypoints` action and builds frontend state management for route loading, modification tracking, and conditional UI rendering.

## Tasks

- [ ] 1. Backend: Add `replace_waypoints` action to PUT /routes/:id
  - [ ] 1.1 Implement `replaceWaypoints` function in `src/services/routeService.ts`
    - Add a new exported function `replaceWaypoints(routeId: string, waypoints: CreateWaypointInput[]): Promise<Waypoint[]>` that deletes all existing waypoints for the route and inserts the new set within a transaction
    - Reset route status to `'draft'` and clear segments (`DELETE FROM route_segments WHERE route_id = $1`)
    - Enforce the existing MAX_WAYPOINTS limit
    - Update route `updated_at` timestamp
    - _Requirements: 4.1, 4.2_

  - [ ] 1.2 Add `replace_waypoints` action handler in `src/routes/routes.ts`
    - In the PUT `/:id` handler, add an `else if (action === 'replace_waypoints')` branch
    - Validate that `req.body.waypoints` is a non-empty array with valid latitude, longitude, and waypoint_type
    - Call `replaceWaypoints` and return the updated waypoints
    - _Requirements: 4.2, 4.3_

  - [ ]* 1.3 Write unit tests for `replaceWaypoints` service function
    - Test successful replacement with valid waypoints
    - Test MAX_WAYPOINTS enforcement
    - Test that segments are cleared and status reset to draft
    - _Requirements: 4.1, 4.2_

- [ ] 2. Frontend: Route loading from URL parameter
  - [ ] 2.1 Add `RouteLoaderState` interface and state management to `RoutePlannerPage`
    - Create the `RouteLoaderState` and `WaypointData` interfaces as defined in the design
    - Add a private `loaderState: RouteLoaderState` property initialized with defaults
    - Read `?route=ID` from `window.location.search` in `render()` and call `loadRoute(routeId)` if present
    - _Requirements: 7.1, 7.4_

  - [ ] 2.2 Implement `loadRoute(routeId: string)` method in `RoutePlannerPage`
    - Set `isLoading = true`, render loading indicator, disable Calculate button
    - Call `apiClient.get<RouteDetailResponse>(`/routes/${routeId}`)` 
    - On success: populate origin/destination/stop inputs from waypoints, render polyline on map, display distance/duration, store `originalWaypoints`
    - On 404: show "Route not found" error with link to History
    - On network error: show error with Retry button
    - On 403: show "You don't have access to this route"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3_

  - [ ]* 2.3 Write property test for waypoint population (Property 1)
    - **Property 1: Waypoint population preserves labels and order**
    - Generate arbitrary valid route responses with 1 origin, 0–10 stops, 1 destination ordered by position
    - Assert the mapping function produces exactly N input entries with correct labels in order
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 2.4 Write property test for duration and distance formatting (Property 2)
    - **Property 2: Duration and distance formatting**
    - Generate arbitrary positive seconds and positive kilometers
    - Assert formatting produces non-empty strings matching "Xh Ymin" or "Y min" for duration, "X.X km" for distance
    - **Validates: Requirements 1.3, 3.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Frontend: Waypoint modification state management
  - [ ] 4.1 Implement `handleWaypointChange()` in `RoutePlannerPage`
    - Attach change/input event listeners to origin, destination, and stop inputs
    - When any waypoint input changes: set `isModified = true`, set `isRecalculated = false`, clear displayed distance/duration
    - Enable the Calculate Route button
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.2 Write property test for modification state (Property 3)
    - **Property 3: Modification clears results and enables recalculation**
    - Generate arbitrary RouteLoaderState where a route is loaded with distance/duration displayed
    - Apply waypoint modification and assert: isModified is true, Calculate button enabled, distance/duration cleared
    - **Validates: Requirements 2.4, 2.5**

- [ ] 5. Frontend: Update Route / Save as New buttons
  - [ ] 5.1 Implement `renderActionButtons()` in `RoutePlannerPage`
    - Render "Update Route" button: visible only when `loadedRouteId` is non-null AND `isRecalculated` is true
    - Render "Save as New" button: visible under same conditions as Update Route
    - Render "Export" button: visible when route is in calculated state (loaded with status 'calculated' OR `isRecalculated` is true)
    - Integrate action buttons into the `build()` method below the route results section
    - _Requirements: 4.1, 4.5, 5.1_

  - [ ] 5.2 Implement `updateRoute()` method in `RoutePlannerPage`
    - Collect current waypoint data from inputs (with geocoded lat/lng from Places Autocomplete)
    - Call `apiClient.put(`/routes/${loadedRouteId}`, { action: 'replace_waypoints', waypoints })` 
    - Then call `apiClient.post(`/routes/${loadedRouteId}/calculate`)`
    - Show success confirmation on completion, show error on failure
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ] 5.3 Implement `saveAsNew()` method in `RoutePlannerPage`
    - Collect current waypoints and call `apiClient.post('/routes', { name, waypoints })`
    - Then call `apiClient.post(`/routes/${newRouteId}/calculate`)`
    - Update URL to `?route=${newRouteId}` and update `loadedRouteId`
    - _Requirements: 4.5_

  - [ ]* 5.4 Write property test for action button visibility (Property 4)
    - **Property 4: Action button visibility rules**
    - Generate arbitrary RouteLoaderState combinations
    - Assert "Update Route" and "Save as New" visible iff loadedRouteId is non-null AND isRecalculated is true
    - **Validates: Requirements 4.1, 4.5**

  - [ ]* 5.5 Write property test for export button visibility (Property 5)
    - **Property 5: Export button visibility**
    - Generate arbitrary RouteLoaderState combinations
    - Assert "Export" button visible iff route is in calculated state
    - **Validates: Requirements 5.1**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Frontend: ExportModal component
  - [ ] 7.1 Create `ExportModal` component in `frontend/src/components/ExportModal.ts`
    - Implement as a reusable modal/dropdown displaying the 8 supported formats (GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT)
    - Accept `routeId`, `onExport` callback, and `onClose` callback via constructor options
    - On format selection: call `onExport(format)`, show loading state, trigger download on success
    - Implement `downloadExport(routeId, format)` helper: call export API, decode base64, create Blob, trigger browser download
    - Handle split files (multiple downloads with `part1ofN` naming)
    - _Requirements: 5.2, 5.3_

  - [ ] 7.2 Integrate ExportModal into `RoutePlannerPage`
    - Wire the "Export" button to open the ExportModal with the current `loadedRouteId`
    - Handle export errors by showing error message in the planner UI
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 7.3 Integrate ExportModal into `HistoryPage`
    - Add an export button/icon to each route item in the history list
    - On click: open ExportModal inline for that route (without navigating away)
    - Handle export errors per-route
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.4 Write property test for history page export action count (Property 6)
    - **Property 6: History page export action per route**
    - Generate arbitrary non-empty lists of saved routes
    - Assert rendered output contains exactly one export action element per route
    - **Validates: Requirements 6.1**

- [ ] 8. Frontend: URL state management
  - [ ] 8.1 Ensure URL retains route ID throughout lifecycle
    - On successful `loadRoute`: verify URL contains `?route=ID`
    - On `saveAsNew`: update URL to new route ID
    - On page refresh with `?route=ID`: re-trigger route loading
    - _Requirements: 7.4_

  - [ ]* 8.2 Write property test for URL route identifier (Property 7)
    - **Property 7: URL retains loaded route identifier**
    - Generate arbitrary valid route IDs (UUIDs)
    - Assert that after loading, the URL contains `route=<ID>` matching the loaded route's identifier exactly
    - **Validates: Requirements 7.4**

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend already has GET /routes/:id, POST /routes/:id/calculate, and POST /routes/:id/export — no new endpoints needed beyond the `replace_waypoints` action
- The ExportModal component is reusable across RoutePlannerPage and HistoryPage
- All frontend code uses vanilla TypeScript (no framework) matching the existing project patterns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4", "8.1"] },
    { "id": 8, "tasks": ["8.2"] }
  ]
}
```
