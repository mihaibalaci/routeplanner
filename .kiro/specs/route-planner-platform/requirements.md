# Requirements Document

## Introduction

A web-based route planning platform for Europe that enables users to plan multi-stop routes, calculate trip fuel costs, find optimal refueling stops, and export routes in multiple navigation formats. The platform targets motorcycle, car, and camper vehicle types, with all pricing in EUR. The system is designed API-first for scalability to 1 million users, with web, iOS, and Android clients.

## Glossary

- **Route_Planner**: The core system component responsible for computing driving routes between origin, destination, and intermediate stops using the Google Maps Directions API.
- **Trip_Cost_Calculator**: The component that estimates total fuel cost for a planned route based on vehicle consumption profile and fuel prices along the route.
- **Refuel_Advisor**: The component that analyzes a route and suggests optimal refueling stops based on tank capacity, consumption rate, fuel prices, and proximity to the route.
- **Route_Exporter**: The component that converts a finalized route into downloadable navigation file formats (GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT).
- **Vehicle_Profile**: A user-configured record containing vehicle type (Motorcycle, Car, Camper), fuel type, tank capacity in liters, and average fuel consumption in liters per 100 km.
- **Fuel_Price_Service**: The background service that scrapes and caches fuel prices from external sources (CieloWeb, GlobalPetrolPrices, Google Maps fallback).
- **User_Account_Service**: The component managing user registration, authentication, profile, vehicle garage, and route history.
- **Waypoint**: A geographic point (origin, destination, or intermediate stop) defined by coordinates or a place name.
- **Route_Segment**: A portion of the route between two consecutive waypoints.
- **API_Gateway**: The entry point for all client requests, exposing RESTful endpoints for every platform feature.
- **Vignette_Service**: The component that detects vignette requirements for route countries, scrapes and caches vignette pricing from external sources (i-vignette.com, vintrica.com), and calculates vignette costs based on vehicle type and user-selected duration.

## Requirements

---

## Delivery Slice 1: Route Planning

### Requirement 1: Route Creation

**User Story:** As a traveler, I want to set an origin, destination, and intermediate stops on a map, so that I can plan a multi-stop driving route across Europe.

#### Acceptance Criteria

1. WHEN a user enters an origin location, THE Route_Planner SHALL geocode the input using the Google Maps Geocoding API and display the resolved location on the map.
2. WHEN a user enters a destination location, THE Route_Planner SHALL geocode the input and display the resolved location on the map.
3. WHEN a user adds an intermediate stop, THE Route_Planner SHALL insert the waypoint between origin and destination and recalculate the route.
4. WHEN a user reorders intermediate stops, THE Route_Planner SHALL recalculate the route to reflect the new stop sequence.
5. WHEN a user removes a waypoint, THE Route_Planner SHALL recalculate the route excluding the removed waypoint.
6. THE Route_Planner SHALL support a minimum of 10 intermediate stops per route.
7. WHEN a geocoding request fails to resolve a location, THE Route_Planner SHALL display an error message indicating the location could not be found and retain the previous route state.

### Requirement 2: Real-Time Map Rendering

**User Story:** As a traveler, I want the map to update dynamically as I build or modify my route, so that I can visually verify my planned journey without page reloads.

#### Acceptance Criteria

1. WHEN a waypoint is added, removed, or reordered, THE Route_Planner SHALL update the displayed route polyline on the map within 2 seconds of the route calculation completing.
2. WHEN the route is recalculated, THE Route_Planner SHALL display the total distance in kilometers and estimated driving time.
3. WHILE the route is being recalculated, THE Route_Planner SHALL display a loading indicator on the map.
4. THE Route_Planner SHALL render all map updates without requiring a full page reload.

### Requirement 3: Place Search and Autocomplete

**User Story:** As a traveler, I want to search for locations with autocomplete suggestions, so that I can quickly find and select waypoints.

#### Acceptance Criteria

1. WHEN a user types in a waypoint input field, THE Route_Planner SHALL display autocomplete suggestions from the Google Maps Places API after the user has entered at least 3 characters.
2. WHEN a user selects an autocomplete suggestion, THE Route_Planner SHALL populate the waypoint with the selected place and update the map.
3. THE Route_Planner SHALL restrict autocomplete suggestions to European countries.
4. WHEN the Places API returns no results, THE Route_Planner SHALL display a message indicating no matching locations were found.

### Requirement 4: Route Directions Integration

**User Story:** As a traveler, I want the system to compute driving directions between my waypoints, so that I receive an accurate route with distance and time estimates.

#### Acceptance Criteria

1. WHEN all waypoints are set, THE Route_Planner SHALL request driving directions from the Google Maps Directions API.
2. THE Route_Planner SHALL use driving mode for all route calculations.
3. WHEN the Directions API returns multiple route alternatives, THE Route_Planner SHALL display the fastest route by default and allow the user to select an alternative.
4. WHEN the Directions API returns an error or no route is found, THE Route_Planner SHALL display an error message indicating the route could not be calculated.
5. THE Route_Planner SHALL display per-segment distance and estimated time for each Route_Segment between consecutive waypoints.

---

## Delivery Slice 2: Trip Cost Calculator

### Requirement 5: Vehicle Profile Management

**User Story:** As a traveler, I want to configure my vehicle's fuel consumption profile, so that the system can accurately estimate my trip fuel costs.

#### Acceptance Criteria

1. WHEN a user creates a Vehicle_Profile, THE User_Account_Service SHALL store the vehicle type (Motorcycle, Car, or Camper), fuel type, tank capacity in liters, and average consumption in liters per 100 km.
2. THE User_Account_Service SHALL validate that tank capacity is between 5 and 200 liters.
3. THE User_Account_Service SHALL validate that average consumption is between 1 and 50 liters per 100 km.
4. WHEN a user updates a Vehicle_Profile, THE User_Account_Service SHALL persist the changes and recalculate any active trip cost estimate using the updated profile.
5. THE User_Account_Service SHALL allow a user to store up to 10 Vehicle_Profiles in their garage.
6. IF a user submits a Vehicle_Profile with invalid values, THEN THE User_Account_Service SHALL reject the submission and return specific validation error messages.

### Requirement 6: Fuel Price Data Collection

**User Story:** As a platform operator, I want the system to collect real-time fuel prices from multiple sources, so that trip cost estimates use current pricing data.

#### Acceptance Criteria

1. THE Fuel_Price_Service SHALL scrape fuel prices from CieloWeb as the primary data source.
2. WHEN CieloWeb data is unavailable, THE Fuel_Price_Service SHALL fall back to GlobalPetrolPrices as the secondary source.
3. WHEN both CieloWeb and GlobalPetrolPrices are unavailable, THE Fuel_Price_Service SHALL fall back to Google Maps fuel price data.
4. THE Fuel_Price_Service SHALL update fuel price data at least once every 6 hours.
5. THE Fuel_Price_Service SHALL cache fuel prices in Redis with a time-to-live of 6 hours.
6. THE Fuel_Price_Service SHALL store fuel prices per country and fuel type in EUR per liter.
7. IF a scraping job fails for all sources, THEN THE Fuel_Price_Service SHALL retain the most recent valid prices and log an alert.

### Requirement 7: Trip Cost Calculation

**User Story:** As a traveler, I want to see the estimated fuel cost for my planned route, so that I can budget for my trip.

#### Acceptance Criteria

1. WHEN a route and Vehicle_Profile are both available, THE Trip_Cost_Calculator SHALL compute the total fuel cost by multiplying route distance by vehicle consumption rate and applicable fuel prices.
2. THE Trip_Cost_Calculator SHALL apply country-specific fuel prices for each Route_Segment based on the countries traversed.
3. THE Trip_Cost_Calculator SHALL display the total estimated cost in EUR with two decimal places.
4. WHEN the route crosses multiple countries, THE Trip_Cost_Calculator SHALL display a per-country cost breakdown.
5. WHEN fuel price data is older than 12 hours, THE Trip_Cost_Calculator SHALL display a warning indicating prices may be outdated.
6. IF no Vehicle_Profile is selected, THEN THE Trip_Cost_Calculator SHALL prompt the user to select or create a Vehicle_Profile before calculating.

---

## Delivery Slice 3: Smart Refuel Stops

### Requirement 8: Refuel Stop Suggestions

**User Story:** As a traveler, I want the system to suggest optimal refueling stops along my route, so that I avoid running out of fuel and minimize fuel costs.

#### Acceptance Criteria

1. WHEN a route and Vehicle_Profile are available, THE Refuel_Advisor SHALL calculate the maximum distance the vehicle can travel on a full tank.
2. THE Refuel_Advisor SHALL suggest refueling stops before the vehicle's remaining range drops below 15% of tank capacity.
3. THE Refuel_Advisor SHALL prefer fuel stations within 2 km of a highway exit along the route.
4. WHEN multiple fuel stations are available near a suggested stop point, THE Refuel_Advisor SHALL rank them by fuel price (lowest first).
5. WHEN a user accepts a suggested refuel stop, THE Route_Planner SHALL add the station as an intermediate waypoint and recalculate the route.
6. WHEN a user rejects a suggested refuel stop, THE Refuel_Advisor SHALL offer the next-best alternative station.
7. IF no fuel stations are found within 5 km of the route at a required refuel point, THEN THE Refuel_Advisor SHALL expand the search radius to 10 km and notify the user of the detour.

---

## Delivery Slice 4: Route Export

### Requirement 9: Route File Export

**User Story:** As a traveler, I want to export my finalized route in multiple navigation file formats, so that I can load it into my GPS device or navigation app.

#### Acceptance Criteria

1. WHEN a user requests a route export, THE Route_Exporter SHALL generate the file in the requested format.
2. THE Route_Exporter SHALL support all of the following formats: GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT.
3. THE Route_Exporter SHALL include all waypoints (origin, intermediate stops, destination) in the exported file.
4. THE Route_Exporter SHALL include refuel stops accepted by the user in the exported file.
5. WHEN a route contains more waypoints than a format supports, THE Route_Exporter SHALL split the route into multiple files and notify the user.
6. THE Route_Exporter SHALL produce valid files that conform to each format's specification.
7. FOR ALL valid routes, parsing an exported file and re-importing it SHALL produce an equivalent set of waypoints (round-trip property).

---

## Delivery Slice 5: User Accounts & History

### Requirement 10: User Registration and Authentication

**User Story:** As a traveler, I want to create an account and log in using email or my Google/Apple account, so that my routes, vehicles, and preferences are saved.

#### Acceptance Criteria

1. WHEN a user registers with email, THE User_Account_Service SHALL create an account with email, password hash, and display name.
2. THE User_Account_Service SHALL validate that the email address is unique and properly formatted.
3. THE User_Account_Service SHALL enforce a minimum password length of 8 characters with at least one uppercase letter, one lowercase letter, and one digit.
4. WHEN a user initiates Google SSO login, THE User_Account_Service SHALL authenticate via OAuth 2.0 using Google Identity Services and create or link an account using the verified Google email.
5. WHEN a user initiates Apple SSO login, THE User_Account_Service SHALL authenticate via Sign in with Apple (OAuth 2.0) and create or link an account using the verified Apple email or private relay address.
6. WHEN an SSO user logs in for the first time, THE User_Account_Service SHALL create a new account using the name and email provided by the identity provider without requiring a password.
7. WHEN an SSO user logs in and an account with the same verified email already exists, THE User_Account_Service SHALL link the SSO identity to the existing account rather than creating a duplicate.
8. WHEN a user logs in with valid credentials (email/password or SSO token), THE User_Account_Service SHALL issue a JWT token with a 24-hour expiry.
9. WHEN a user provides invalid credentials, THE User_Account_Service SHALL return an authentication error without revealing whether the email or password was incorrect.
10. IF a user fails email/password authentication 5 times within 15 minutes, THEN THE User_Account_Service SHALL lock the account for 30 minutes.
11. THE User_Account_Service SHALL display Google and Apple SSO buttons on both the registration and login screens.

### Requirement 11: Route History and Persistence

**User Story:** As a traveler, I want my planned routes to be saved automatically, so that I can revisit and reuse them later.

#### Acceptance Criteria

1. WHEN a user finalizes a route, THE User_Account_Service SHALL persist the route (waypoints, vehicle profile used, cost estimate) to the user's history.
2. THE User_Account_Service SHALL store up to 100 routes per user.
3. WHEN a user views their route history, THE User_Account_Service SHALL display routes sorted by creation date (newest first).
4. WHEN a user selects a saved route, THE Route_Planner SHALL load and display the route on the map.
5. WHEN a user deletes a saved route, THE User_Account_Service SHALL remove the route from history permanently.

---

## Non-Functional Requirements

### Requirement 12: Performance and Scalability

**User Story:** As a platform operator, I want the system to handle 1 million users with responsive performance, so that the platform remains reliable under load.

#### Acceptance Criteria

1. THE API_Gateway SHALL respond to route calculation requests within 3 seconds at the 95th percentile under normal load.
2. THE API_Gateway SHALL support at least 1000 concurrent route calculation requests.
3. THE Fuel_Price_Service SHALL serve cached fuel prices within 100 milliseconds at the 95th percentile.
4. THE Route_Planner SHALL handle up to 1 million registered users without degradation of response times beyond 20% of baseline.
5. WHILE the system is under peak load, THE API_Gateway SHALL maintain availability of at least 99.9%.

### Requirement 13: Security

**User Story:** As a platform operator, I want the system to protect user data and prevent unauthorized access, so that user trust is maintained.

#### Acceptance Criteria

1. THE API_Gateway SHALL require authentication tokens for all endpoints except registration and login.
2. THE User_Account_Service SHALL store passwords using bcrypt with a minimum cost factor of 12.
3. THE API_Gateway SHALL enforce HTTPS for all client-server communication.
4. THE API_Gateway SHALL validate and sanitize all user inputs to prevent injection attacks.
5. WHEN a JWT token expires, THE API_Gateway SHALL reject the request and return a 401 status code.
6. THE User_Account_Service SHALL never expose password hashes or internal identifiers in API responses.

### Requirement 14: API-First Design

**User Story:** As a developer, I want all platform features exposed via a RESTful API, so that web, iOS, and Android clients can consume the same backend.

#### Acceptance Criteria

1. THE API_Gateway SHALL expose RESTful endpoints for every user-facing feature (route planning, cost calculation, refuel suggestions, export, account management).
2. THE API_Gateway SHALL return responses in JSON format with consistent error structures.
3. THE API_Gateway SHALL version all endpoints using URL path versioning (e.g., /api/v1/).
4. THE API_Gateway SHALL document all endpoints using OpenAPI 3.0 specification.
5. THE API_Gateway SHALL implement rate limiting of 100 requests per minute per authenticated user.

### Requirement 15: Mobile Feature Parity

**User Story:** As a mobile user, I want the iOS and Android apps to provide the same features as the web platform, so that I have a consistent experience across devices.

#### Acceptance Criteria

1. THE iOS and Android applications SHALL support all features available on the web platform: route planning, trip cost calculation, smart refuel stops, route export, and account management.
2. THE mobile applications SHALL consume the same API_Gateway endpoints as the web frontend.
3. THE mobile applications SHALL support offline viewing of previously loaded routes.

---

## Delivery Slice 6: Vignette Cost Tracking

### Requirement 16: Vignette Detection and Cost Estimation

**User Story:** As a traveler, I want the system to detect which countries on my route require a vignette and include the vignette cost in my total trip estimate, so that I can budget accurately for road tolls.

#### Acceptance Criteria

1. WHEN a route crosses a country that requires a vignette, THE Vignette_Service SHALL detect and list that country as requiring a vignette.
2. WHEN displaying trip cost, THE Trip_Cost_Calculator SHALL show vignette requirements per country in the route cost breakdown.
3. WHEN calculating total trip cost, THE Trip_Cost_Calculator SHALL include vignette costs in addition to fuel costs.
4. THE Vignette_Service SHALL scrape vignette pricing data from i-vignette.com as the primary source and vintrica.com as the secondary source.
5. WHEN a user selects a vignette duration for a country, THE Vignette_Service SHALL use that duration's price for the cost calculation.
6. THE Vignette_Service SHALL support different vehicle categories for vignette pricing: motorcycle, car, and camper.
7. WHEN the vehicle type is motorcycle AND the country exempts motorcycles from vignettes, THE Vignette_Service SHALL NOT require a vignette for that country.
8. IF all vignette price scraping sources fail, THEN THE Vignette_Service SHALL retain the most recent valid prices and log an alert.
9. THE Vignette_Service SHALL update vignette price data at least once every 24 hours.
10. WHEN calculating vignette cost for multiple countries, THE sum of per-country vignette costs SHALL equal the total vignette cost.
