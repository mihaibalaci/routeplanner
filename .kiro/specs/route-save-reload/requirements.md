# Requirements Document

## Introduction

This feature enables users to reload a previously saved route back into the Route Planner for viewing, editing, and exporting. Currently, routes are saved to the backend after calculation, and the History page lists them, but there is no way to load a saved route back into the planner UI for modification. This feature bridges that gap by allowing full round-trip route management: save, reload, modify, recalculate, update, and export.

## Glossary

- **Route_Planner**: The main route planning page that displays the map, waypoint inputs, and route calculation controls.
- **History_Page**: The page that lists all previously saved routes for the authenticated user.
- **Saved_Route**: A route record persisted in the backend database, including waypoints, segments, distance, and duration data.
- **Waypoint**: A geographic point (origin, stop, or destination) that defines the route path.
- **Route_Loader**: The frontend component responsible for fetching a saved route from the backend and populating the Route Planner UI with its data.
- **Export_Service**: The backend service that converts route data into navigation device formats (GPX, BCR, FIT, etc.).

## Requirements

### Requirement 1: Load Saved Route into Route Planner

**User Story:** As a user, I want to load a saved route from my history into the Route Planner, so that I can view it on the map and make changes.

#### Acceptance Criteria

1. WHEN a user clicks a saved route on the History_Page, THE Route_Planner SHALL navigate to the planner view and populate the origin, destination, and intermediate stop inputs with the Saved_Route waypoint labels.
2. WHEN the Route_Planner loads a Saved_Route, THE Route_Planner SHALL display the route polyline on the map.
3. WHEN the Route_Planner loads a Saved_Route, THE Route_Planner SHALL display the total distance and duration from the stored route data.
4. WHEN the Route_Planner loads a Saved_Route that has intermediate stops, THE Route_Planner SHALL render one stop input field for each intermediate Waypoint in the correct order.
5. IF the Route_Loader receives a 404 response from the backend, THEN THE Route_Planner SHALL display an error message indicating the route was not found.
6. IF the Route_Loader receives a network error, THEN THE Route_Planner SHALL display an error message and allow the user to retry loading.

### Requirement 2: Modify Loaded Route Waypoints

**User Story:** As a user, I want to modify the waypoints of a loaded route, so that I can adjust my trip without starting from scratch.

#### Acceptance Criteria

1. WHILE a Saved_Route is loaded in the Route_Planner, THE Route_Planner SHALL allow the user to add new intermediate stops.
2. WHILE a Saved_Route is loaded in the Route_Planner, THE Route_Planner SHALL allow the user to remove existing intermediate stops.
3. WHILE a Saved_Route is loaded in the Route_Planner, THE Route_Planner SHALL allow the user to change the origin or destination by editing the input fields.
4. WHEN the user modifies any Waypoint of a loaded route, THE Route_Planner SHALL indicate that the route needs recalculation by enabling the Calculate Route button.
5. WHEN the user modifies any Waypoint of a loaded route, THE Route_Planner SHALL clear the previously displayed distance and duration until recalculation completes.

### Requirement 3: Recalculate Modified Route

**User Story:** As a user, I want to recalculate a modified route, so that I can see the updated distance, duration, and path on the map.

#### Acceptance Criteria

1. WHEN the user clicks Calculate Route after modifying waypoints, THE Route_Planner SHALL send the updated waypoints to Google Maps for route calculation.
2. WHEN recalculation succeeds, THE Route_Planner SHALL update the map with the new route polyline.
3. WHEN recalculation succeeds, THE Route_Planner SHALL display the updated total distance and duration.
4. IF recalculation fails, THEN THE Route_Planner SHALL display an error message with the failure reason and retain the previous waypoint inputs.

### Requirement 4: Update Saved Route

**User Story:** As a user, I want to save changes to an existing route, so that my modifications are persisted without creating a duplicate.

#### Acceptance Criteria

1. WHILE a Saved_Route is loaded and has been recalculated with modifications, THE Route_Planner SHALL display an "Update Route" button.
2. WHEN the user clicks "Update Route", THE Route_Planner SHALL send the updated waypoints and route data to the backend using the existing route identifier.
3. WHEN the backend confirms the update, THE Route_Planner SHALL display a success confirmation to the user.
4. IF the update request fails, THEN THE Route_Planner SHALL display an error message and retain the current route state in the UI.
5. WHILE a Saved_Route is loaded and has been recalculated, THE Route_Planner SHALL also offer a "Save as New" option to create a separate route copy.

### Requirement 5: Export Route from Route Planner

**User Story:** As a user, I want to export a loaded route directly from the Route Planner, so that I can download it for my GPS device without navigating to a separate page.

#### Acceptance Criteria

1. WHILE a Saved_Route is loaded and in a calculated state, THE Route_Planner SHALL display an "Export" button.
2. WHEN the user clicks "Export", THE Route_Planner SHALL present the available export formats (GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT).
3. WHEN the user selects a format and confirms, THE Export_Service SHALL generate the file and trigger a browser download.
4. IF the export request fails, THEN THE Route_Planner SHALL display an error message indicating the failure reason.

### Requirement 6: Export Route from History Page

**User Story:** As a user, I want to export a route directly from the History page, so that I can quickly download a route without loading it into the planner first.

#### Acceptance Criteria

1. THE History_Page SHALL display an export action for each Saved_Route in the list.
2. WHEN the user triggers the export action on a Saved_Route, THE History_Page SHALL present the available export formats.
3. WHEN the user selects a format, THE Export_Service SHALL generate the file and trigger a browser download.
4. IF the export request fails, THEN THE History_Page SHALL display an error message for the affected route.

### Requirement 7: Route Loading State Management

**User Story:** As a user, I want clear visual feedback when a route is loading, so that I understand the system is working.

#### Acceptance Criteria

1. WHILE the Route_Loader is fetching route data from the backend, THE Route_Planner SHALL display a loading indicator.
2. WHILE the Route_Loader is fetching route data, THE Route_Planner SHALL disable the Calculate Route button.
3. WHEN route loading completes successfully, THE Route_Planner SHALL remove the loading indicator and enable user interaction.
4. THE Route_Planner SHALL retain the loaded route identifier in the browser URL so that the page can be refreshed without losing context.
