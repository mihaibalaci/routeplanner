# Requirements Document

## Introduction

The Cost Breakdown Panel is a new UI component embedded directly in the Route Planner page that consolidates all trip cost information (fuel, vignettes, and total) into a single, always-visible panel. Currently, cost data is scattered across separate pages (Trip Cost, Vignette Cost, Fuel Calculator). This feature brings a unified cost summary into the route planning workflow so users can see financial impact as they plan their route without navigating away.

## Glossary

- **Cost_Breakdown_Panel**: A collapsible UI panel displayed on the Route Planner page that shows itemized cost estimates for a calculated route.
- **Route_Planner_Page**: The main page where users plan multi-stop driving routes using Google Maps.
- **Fuel_Cost**: The estimated cost of fuel for the entire route, calculated per country segment based on distance, vehicle consumption, and local fuel prices.
- **Vignette_Cost**: The cost of required road vignettes for countries along the route.
- **Total_Cost**: The sum of Fuel_Cost and Vignette_Cost for the entire route.
- **Country_Breakdown**: An itemized list showing cost contributions per country traversed.
- **Vehicle_Profile**: A user-defined vehicle configuration containing fuel type, tank capacity, and consumption rate.
- **Route_Segment**: A portion of the route within a single country, with associated distance and duration.
- **API_Client**: The frontend HTTP client that communicates with the backend Express API.

## Requirements

### Requirement 1: Display Cost Breakdown Panel After Route Calculation

**User Story:** As a route planner user, I want to see a cost breakdown panel on the Route Planner page after calculating a route, so that I can immediately understand the financial cost of my trip.

#### Acceptance Criteria

1. WHEN the Route_Planner_Page receives a successful route response from the directions service (route data with distance and duration is available), THE Cost_Breakdown_Panel SHALL become visible on the Route Planner page below the waypoints card.
2. WHILE no route has been calculated, THE Cost_Breakdown_Panel SHALL display an empty state containing a descriptive icon, a title stating no route is available, and a text prompt instructing the user to calculate a route.
3. WHILE a route is being calculated, THE Cost_Breakdown_Panel SHALL display a loading indicator in place of the panel content.
4. WHEN the user initiates a new route calculation while a previous route result is displayed, THE Cost_Breakdown_Panel SHALL transition to the loading state until the new calculation completes or fails.
5. IF the route calculation fails, THEN THE Cost_Breakdown_Panel SHALL revert to the empty state and shall not display stale cost data from a previous route.

### Requirement 2: Vehicle Profile Selection

**User Story:** As a route planner user, I want to select a vehicle profile within the Cost Breakdown Panel, so that cost estimates use my vehicle's fuel type and consumption rate.

#### Acceptance Criteria

1. THE Cost_Breakdown_Panel SHALL display a vehicle profile selector populated with the authenticated user's saved vehicle profiles, showing each profile's name, vehicle type, and fuel type.
2. WHEN the user selects a vehicle profile and a route has been calculated, THE Cost_Breakdown_Panel SHALL trigger a cost recalculation using the selected vehicle's fuel_type and consumption_per_100km.
3. IF the user selects a vehicle profile and no route has been calculated, THEN THE Cost_Breakdown_Panel SHALL display the selected profile without triggering a cost calculation and SHALL indicate that a route calculation is required.
4. IF no vehicle profiles exist for the user, THEN THE Cost_Breakdown_Panel SHALL display a prompt to create a vehicle profile with a link to the vehicle creation form.
5. IF the user is not authenticated, THEN THE Cost_Breakdown_Panel SHALL display a message indicating that login is required to view cost estimates.
6. THE Cost_Breakdown_Panel SHALL default the vehicle profile selector to no selection until the user explicitly chooses a profile.

### Requirement 3: Fuel Cost Display

**User Story:** As a route planner user, I want to see the total fuel cost and a per-country fuel breakdown, so that I can understand where fuel expenses are highest.

#### Acceptance Criteria

1. WHEN a vehicle profile is selected and a route is calculated, THE Cost_Breakdown_Panel SHALL display the total fuel cost in EUR, rounded to two decimal places.
2. WHEN a vehicle profile is selected and a route is calculated, THE Cost_Breakdown_Panel SHALL display a per-country fuel cost breakdown listed in route traversal order, showing country name, distance in that country rounded to the nearest kilometer, and fuel cost for that segment in EUR rounded to two decimal places.
3. THE Cost_Breakdown_Panel SHALL calculate fuel cost per country using the formula: (segment_distance_km / 100) × vehicle_consumption_per_100km × country_fuel_price_eur, where country_fuel_price_eur is the price per liter for the fuel type specified in the selected vehicle profile.
4. IF a country segment has a distance of less than 1 km, THEN THE Cost_Breakdown_Panel SHALL omit that segment from the per-country breakdown and exclude it from the total fuel cost calculation.

### Requirement 4: Vignette Cost Display

**User Story:** As a route planner user, I want to see vignette costs for countries on my route, so that I know which road tolls I need to purchase.

#### Acceptance Criteria

1. WHEN a vehicle profile is selected and a route is calculated, THE Cost_Breakdown_Panel SHALL display the total vignette cost in EUR rounded to 2 decimal places.
2. WHEN a vehicle profile is selected and a route is calculated, THE Cost_Breakdown_Panel SHALL list each country on the route that requires a vignette, showing the country name, the selected duration, and the price in EUR for that duration.
3. THE Cost_Breakdown_Panel SHALL default vignette duration selection to the shortest available duration for each country, ordered as: 1-day, 10-day, 1-week, 1-month, 2-month, 3-month, 6-month, 1-year.
4. WHEN the user changes the vignette duration for a country, THE Cost_Breakdown_Panel SHALL recalculate and update the total vignette cost by summing all per-country vignette prices.
5. WHILE the vehicle type is motorcycle and the country exempts motorcycles from vignettes, THE Cost_Breakdown_Panel SHALL display that country with an "exempt" label and exclude its cost from the total vignette cost.
6. IF the calculated route does not pass through any country requiring a vignette, THEN THE Cost_Breakdown_Panel SHALL display a message indicating no vignettes are required for this route.
7. IF vignette price data is unavailable for a country on the route, THEN THE Cost_Breakdown_Panel SHALL indicate that pricing is unavailable for that country and exclude it from the total cost calculation.

### Requirement 5: Total Cost Summary

**User Story:** As a route planner user, I want to see a combined total cost at the top of the panel, so that I have a quick overview of the full trip expense.

#### Acceptance Criteria

1. THE Cost_Breakdown_Panel SHALL display the total trip cost as the sum of Fuel_Cost and Vignette_Cost at the top of the panel, visually distinguished from itemized costs by larger font weight or size.
2. WHEN either Fuel_Cost or Vignette_Cost changes, THE Cost_Breakdown_Panel SHALL update the total trip cost within 500ms.
3. THE Cost_Breakdown_Panel SHALL display all monetary values rounded to two decimal places with the EUR currency symbol prefixed before the numeric value (e.g., €12.34).
4. IF Fuel_Cost or Vignette_Cost is unavailable due to a data retrieval error, THEN THE Cost_Breakdown_Panel SHALL display the total as a partial sum of the available component and indicate that the total is incomplete.

### Requirement 6: Panel Collapse and Expand

**User Story:** As a route planner user, I want to collapse the cost breakdown panel, so that I can focus on the map when I don't need cost information.

#### Acceptance Criteria

1. THE Cost_Breakdown_Panel SHALL provide a toggle button to collapse and expand the panel content, defaulting to the expanded state when cost data is first displayed.
2. THE toggle button SHALL be keyboard-operable and SHALL convey the current collapsed or expanded state to assistive technologies.
3. WHILE the panel is collapsed, THE Cost_Breakdown_Panel SHALL display only the total trip cost and the toggle button in a single-row header.
4. WHEN the user activates the toggle button to expand the panel, THE Cost_Breakdown_Panel SHALL reveal the full itemized breakdown using cached data without triggering a new API request.
5. WHEN a new route calculation completes, THE Cost_Breakdown_Panel SHALL reset to the expanded state to display the updated cost breakdown.

### Requirement 7: Error Handling

**User Story:** As a route planner user, I want to see clear error messages when cost calculation fails, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. IF the cost calculation API returns an error, THEN THE Cost_Breakdown_Panel SHALL display an error message describing the failure reason and a retry button that re-triggers the cost calculation, up to a maximum of 3 consecutive retry attempts.
2. IF fuel price data is unavailable for a country on the route, THEN THE Cost_Breakdown_Panel SHALL display the affected country name with a visual unavailable marker next to it, display a partial total excluding that country's fuel cost, and label the total as "partial estimate."
3. IF the network request does not receive a response within 15 seconds or the connection is refused, THEN THE Cost_Breakdown_Panel SHALL display an error message indicating a connectivity problem, provide a retry button, and retain any previously displayed cost data until a successful response is received.
4. WHEN a new route is successfully calculated, THE Cost_Breakdown_Panel SHALL clear any previously displayed error state and display the updated cost data.

### Requirement 8: Responsive Layout Integration

**User Story:** As a route planner user on different screen sizes, I want the cost breakdown panel to adapt to my viewport, so that the Route Planner page remains usable.

#### Acceptance Criteria

1. WHILE the viewport width is 1024px or greater, THE Cost_Breakdown_Panel SHALL render as a sidebar panel to the right of the map with a minimum width of 320px.
2. WHILE the viewport width is less than 1024px, THE Cost_Breakdown_Panel SHALL render below the map as a full-width collapsible section that is collapsed by default.
3. WHILE the viewport width is less than 1024px, WHEN the user activates the collapse/expand toggle, THE Cost_Breakdown_Panel SHALL expand to show its content or collapse to show only its header.
4. THE Cost_Breakdown_Panel SHALL not overlap or visually obscure the map or waypoint inputs at any viewport width from 320px to 3840px.
5. WHEN the viewport width crosses the 1024px threshold due to resizing, THE Cost_Breakdown_Panel SHALL transition between sidebar and collapsible layouts within 300ms without requiring a page reload.
