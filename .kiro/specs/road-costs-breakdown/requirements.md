# Requirements Document

## Introduction

Extend the existing trip cost breakdown to include road costs (vignettes, bridge tolls, and highway tolls). The backend retrieves toll data from the Google Routes API `computeRoutes` endpoint with `extraComputations: ["TOLLS"]` and combines it with existing vignette pricing. The frontend adds a "Road Costs" subsection to the CostBreakdownPanel showing vignettes with a duration dropdown, bridge tolls, highway tolls, and a road costs subtotal.

## Glossary

- **CostBreakdownService**: The backend service (`costBreakdownService.ts`) that composes fuel and vignette cost data into a unified response.
- **CostBreakdownPanel**: The frontend component (`CostBreakdownPanel.ts`) that renders the cost breakdown UI within the route planner page.
- **Google_Routes_API**: The Google Routes API `computeRoutes` endpoint used to calculate routes and retrieve toll information.
- **Toll_Info**: The toll data returned by the Google Routes API when `extraComputations: ["TOLLS"]` is specified, containing estimated toll costs per route segment.
- **Vignette_Service**: The existing backend service (`vignetteService.ts`) that provides vignette country requirements and pricing from the database.
- **Road_Costs**: The combined cost of vignettes, bridge tolls, and highway tolls for a route.
- **Bridge_Toll**: A toll charged for crossing a specific bridge (e.g., Øresund Bridge), extracted from Google Routes API toll info.
- **Highway_Toll**: A toll charged for using a highway segment (e.g., Italian autostrada), extracted from Google Routes API toll info.
- **Duration_Dropdown**: A UI select element allowing the user to choose a vignette validity period (1 day, 7 days, 30 days, or 365 days) per country.

## Requirements

### Requirement 1: Google Routes API Toll Data Retrieval

**User Story:** As a backend developer, I want to call the Google Routes API with toll computation enabled, so that the system can retrieve bridge and highway toll costs for a route.

#### Acceptance Criteria

1. WHEN the CostBreakdownService calculates road costs for a route, THE CostBreakdownService SHALL call the Google_Routes_API `computeRoutes` endpoint with `extraComputations: ["TOLLS"]` using the existing `GOOGLE_MAPS_API_KEY` environment variable.
2. WHEN the Google_Routes_API returns toll information, THE CostBreakdownService SHALL parse the response to extract individual toll entries with their name, cost, and category (bridge or highway).
3. IF the Google_Routes_API returns an error or times out, THEN THE CostBreakdownService SHALL return the cost breakdown without toll data and mark the response as a partial estimate.
4. IF the Google_Routes_API returns no toll information for the route, THEN THE CostBreakdownService SHALL return empty arrays for bridge tolls and highway tolls.

### Requirement 2: Road Costs Response Structure

**User Story:** As a frontend developer, I want the cost breakdown endpoint to return structured road cost data, so that I can render vignettes, bridge tolls, and highway tolls in the UI.

#### Acceptance Criteria

1. THE CostBreakdownService SHALL include a `roadCosts` object in the cost breakdown response containing `vignettes`, `bridgeTolls`, `highwayTolls`, and `totalRoadCostsEur` fields.
2. THE CostBreakdownService SHALL return each vignette entry with `countryCode`, `countryName`, `duration`, `cost`, and `availableDurations` fields.
3. THE CostBreakdownService SHALL return each bridge toll entry with `name` and `cost` fields.
4. THE CostBreakdownService SHALL return each highway toll entry with `segment` and `cost` fields.
5. THE CostBreakdownService SHALL calculate `totalRoadCostsEur` as the sum of all vignette costs, bridge toll costs, and highway toll costs, rounded to 2 decimal places.

### Requirement 3: Typed Request and Response Interfaces

**User Story:** As a developer, I want all new endpoint data to be fully typed with TypeScript interfaces, so that the codebase remains type-safe and maintainable.

#### Acceptance Criteria

1. THE CostBreakdownService SHALL define TypeScript interfaces for `RoadCosts`, `VignetteEntry`, `BridgeTollEntry`, and `HighwayTollEntry` response types.
2. THE CostBreakdownService SHALL define a TypeScript interface for the Google Routes API toll response structure.
3. THE CostBreakdownService SHALL export all new interfaces so that both backend and frontend code can import them.

### Requirement 4: Vignette Duration Selection

**User Story:** As a user, I want to select different vignette durations per country, so that I can see the cost for the validity period that matches my trip.

#### Acceptance Criteria

1. THE CostBreakdownPanel SHALL render a Duration_Dropdown for each vignette country with options for 1 day, 7 days, 30 days, and 365 days.
2. WHEN the user changes a Duration_Dropdown value, THE CostBreakdownPanel SHALL send a new request to the cost breakdown endpoint with the updated duration for that country.
3. WHEN the cost breakdown endpoint receives duration parameters, THE CostBreakdownService SHALL use the specified duration to look up the corresponding vignette price from the Vignette_Service.
4. THE CostBreakdownPanel SHALL display only the durations that are available for each country as reported by the Vignette_Service.
5. THE CostBreakdownPanel SHALL default each Duration_Dropdown to the shortest available duration for that country.

### Requirement 5: Road Costs UI Section

**User Story:** As a user, I want to see a "Road Costs" subsection in the trip cost breakdown, so that I can understand all road-related expenses for my route.

#### Acceptance Criteria

1. THE CostBreakdownPanel SHALL render a "Road Costs" subsection below the fuel cost section within the existing cost breakdown details.
2. THE CostBreakdownPanel SHALL display a "Vignettes" group showing each country name, the selected duration, and the cost in EUR.
3. WHEN the Google_Routes_API returns bridge toll data, THE CostBreakdownPanel SHALL display a "Bridge Tolls" group showing each bridge name and cost in EUR.
4. WHEN the Google_Routes_API returns highway toll data, THE CostBreakdownPanel SHALL display a "Highway Tolls" group showing each segment name and cost in EUR.
5. THE CostBreakdownPanel SHALL display a "Road costs subtotal" line showing the sum of vignettes, bridge tolls, and highway tolls.
6. IF no bridge tolls exist for the route, THEN THE CostBreakdownPanel SHALL hide the "Bridge Tolls" group entirely.
7. IF no highway tolls exist for the route, THEN THE CostBreakdownPanel SHALL hide the "Highway Tolls" group entirely.

### Requirement 6: Total Cost Integration

**User Story:** As a user, I want the total trip cost to include road costs, so that I see the full estimated expense for my journey.

#### Acceptance Criteria

1. THE CostBreakdownService SHALL calculate `totalCostEur` as the sum of fuel costs and road costs (vignettes + bridge tolls + highway tolls), rounded to 2 decimal places.
2. WHEN the user changes a vignette duration, THE CostBreakdownPanel SHALL update the road costs subtotal and the overall total cost displayed in the panel header.

### Requirement 7: Auth and Middleware Compliance

**User Story:** As a developer, I want the road costs feature to follow existing authentication and middleware patterns, so that the codebase remains consistent and secure.

#### Acceptance Criteria

1. THE cost breakdown endpoint SHALL require authentication via the existing auth middleware before processing road cost requests.
2. THE cost breakdown endpoint SHALL validate route ownership before returning road cost data for a route.
3. THE cost breakdown endpoint SHALL include the `requestId` in all error responses following the existing error response pattern.

### Requirement 8: Build Verification

**User Story:** As a developer, I want the implementation to pass the TypeScript build without errors, so that the code is production-ready.

#### Acceptance Criteria

1. WHEN the road costs feature is implemented, THE system SHALL pass `tsc --noEmit` with zero type errors in both backend and frontend projects.
