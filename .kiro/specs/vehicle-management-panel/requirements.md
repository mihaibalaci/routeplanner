# Requirements Document

## Introduction

The Vehicle Management Panel provides a dedicated "My Vehicles" page where authenticated users can view all their vehicle profiles in a split-panel layout, inspect individual vehicle details including route completion counts, and designate a default vehicle. The default vehicle is automatically selected in the Route Planner for cost calculations. The feature spans backend API enhancements (new fields and endpoints), a database migration, and a new frontend page.

## Glossary

- **Vehicle_Management_Page**: The frontend "My Vehicles" page accessible at `/vehicles`, displaying a split-panel layout with a vehicle list and vehicle detail view.
- **Vehicle_List_Panel**: The left panel of the Vehicle_Management_Page that displays all user vehicles as a scrollable list.
- **Vehicle_Detail_Panel**: The right panel of the Vehicle_Management_Page that displays full details and route count for a selected vehicle.
- **Default_Vehicle**: The single vehicle profile per user marked with `is_default = true`, used for automatic selection in cost calculations.
- **Route_Count**: The number of finalized routes that have a `trip_costs` record referencing a specific vehicle profile.
- **Vehicles_API**: The backend REST API at `/api/v1/vehicles` serving vehicle profile data.
- **Route_Planner**: The existing Route Planner page that uses a selected vehicle for cost calculations.

## Requirements

### Requirement 1: Vehicle List API with Default and Route Count

**User Story:** As an authenticated user, I want the vehicle list endpoint to return default status and route count for each vehicle, so that I can see which vehicle is my default and how many routes I have completed with each.

#### Acceptance Criteria

1. WHEN an authenticated user sends a GET request to `/api/v1/vehicles`, THE Vehicles_API SHALL return a JSON array where each vehicle object includes `id`, `name`, `vehicle_type`, `is_default`, and `route_count` fields.
2. THE Vehicles_API SHALL compute `route_count` as the number of routes with status `finalized` that have a `trip_costs` record referencing the vehicle profile.
3. IF an unauthenticated request is sent to `/api/v1/vehicles`, THEN THE Vehicles_API SHALL return HTTP 401 with an error message.

### Requirement 2: Vehicle Detail API with Route Count

**User Story:** As an authenticated user, I want to retrieve full details of a specific vehicle including its route count, so that I can view comprehensive information in the detail panel.

#### Acceptance Criteria

1. WHEN an authenticated user sends a GET request to `/api/v1/vehicles/:id`, THE Vehicles_API SHALL return the full vehicle profile including `id`, `name`, `vehicle_type`, `fuel_type`, `tank_capacity_liters`, `consumption_per_100km`, `is_default`, and `route_count`.
2. THE Vehicles_API SHALL compute `route_count` using the same finalized-route-with-trip-costs logic as the list endpoint.
3. IF the vehicle does not exist, THEN THE Vehicles_API SHALL return HTTP 404.
4. IF the vehicle belongs to a different user, THEN THE Vehicles_API SHALL return HTTP 403.

### Requirement 3: Set Default Vehicle Endpoint

**User Story:** As an authenticated user, I want to set a vehicle as my default so that the Route Planner automatically uses it for cost calculations.

#### Acceptance Criteria

1. WHEN an authenticated user sends a PATCH request to `/api/v1/vehicles/:id/default`, THE Vehicles_API SHALL set `is_default = true` on the specified vehicle and `is_default = false` on all other vehicles belonging to that user within a single database transaction.
2. THE Vehicles_API SHALL return the updated vehicle profile with `is_default = true` in the response.
3. IF the vehicle does not exist, THEN THE Vehicles_API SHALL return HTTP 404.
4. IF the vehicle belongs to a different user, THEN THE Vehicles_API SHALL return HTTP 403.
5. THE Vehicles_API SHALL ensure only one vehicle per user has `is_default = true` at any time.

### Requirement 4: Auto-Default First Vehicle

**User Story:** As a new user creating my first vehicle, I want it to automatically become my default so that I can immediately use the Route Planner without extra configuration.

#### Acceptance Criteria

1. WHEN a user creates a vehicle profile and the user has no existing vehicle profiles, THE Vehicles_API SHALL automatically set `is_default = true` on the newly created vehicle.
2. WHEN a user creates a vehicle profile and the user already has existing vehicle profiles, THE Vehicles_API SHALL set `is_default = false` on the newly created vehicle.

### Requirement 5: Database Migration for is_default Column

**User Story:** As a developer, I want the database schema to support the default vehicle feature so that the is_default state is persisted reliably.

#### Acceptance Criteria

1. THE Migration SHALL add an `is_default` column of type `BOOLEAN` with a default value of `false` to the `vehicle_profiles` table.
2. THE Migration SHALL be reversible, removing the `is_default` column on rollback.

### Requirement 6: Vehicle List Panel (Left Panel)

**User Story:** As a user, I want to see all my vehicles in a scrollable list with name and type icon, so that I can quickly identify and select a vehicle.

#### Acceptance Criteria

1. THE Vehicle_List_Panel SHALL display each vehicle as a list item showing the vehicle name and a type-specific icon (car, motorcycle, or camper).
2. THE Vehicle_List_Panel SHALL visually indicate the Default_Vehicle with a badge or highlight.
3. WHEN a user clicks a vehicle list item, THE Vehicle_Management_Page SHALL display that vehicle's details in the Vehicle_Detail_Panel.
4. THE Vehicle_List_Panel SHALL be scrollable when the list exceeds the available viewport height.

### Requirement 7: Vehicle Detail Panel (Right Panel)

**User Story:** As a user, I want to see full details of a selected vehicle including how many routes I completed with it, so that I can understand my usage.

#### Acceptance Criteria

1. WHEN a vehicle is selected, THE Vehicle_Detail_Panel SHALL display the vehicle name, type, fuel type, tank capacity, consumption per 100km, and Route_Count.
2. THE Vehicle_Detail_Panel SHALL display a "Set as Default" toggle control.
3. WHEN the user activates the "Set as Default" toggle, THE Vehicle_Management_Page SHALL call the PATCH `/api/v1/vehicles/:id/default` endpoint and update the UI to reflect the new default status.
4. WHILE no vehicle is selected, THE Vehicle_Detail_Panel SHALL display a placeholder message prompting the user to select a vehicle.

### Requirement 8: Responsive Split Layout

**User Story:** As a user on any device, I want the My Vehicles page to be usable regardless of screen size, so that I can manage vehicles on desktop and mobile.

#### Acceptance Criteria

1. WHILE the viewport width is at or above the desktop breakpoint (1024px), THE Vehicle_Management_Page SHALL display the Vehicle_List_Panel and Vehicle_Detail_Panel side by side.
2. WHILE the viewport width is below the desktop breakpoint, THE Vehicle_Management_Page SHALL stack the Vehicle_List_Panel above the Vehicle_Detail_Panel.
3. THE Vehicle_List_Panel SHALL remain visible on all screen sizes.

### Requirement 9: Route Planner Default Vehicle Auto-Selection

**User Story:** As a user with a default vehicle, I want the Route Planner to automatically select my default vehicle for cost calculations, so that I do not have to manually choose it each time.

#### Acceptance Criteria

1. WHEN the Route Planner loads vehicle profiles, THE Route_Planner SHALL automatically select the vehicle marked as Default_Vehicle in the VehicleSelector dropdown.
2. WHILE no Default_Vehicle is set, THE Route_Planner SHALL display the VehicleSelector with no pre-selection (existing behavior).

### Requirement 10: Typed Request and Response Interfaces

**User Story:** As a developer, I want all new endpoints to have TypeScript interfaces for request and response payloads, so that the codebase remains type-safe.

#### Acceptance Criteria

1. THE Vehicles_API SHALL define TypeScript interfaces for the list response including `is_default` and `route_count` fields.
2. THE Vehicles_API SHALL define a TypeScript interface for the PATCH default endpoint response.
3. THE Vehicle_Management_Page SHALL define TypeScript interfaces for the API response data consumed by the frontend.
