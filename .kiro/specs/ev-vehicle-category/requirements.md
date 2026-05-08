# Requirements Document

## Introduction

This feature extends the Route Planner Platform with Electric Vehicle (EV) support. It adds "EV" as a new vehicle category with EV-specific fields (battery capacity, energy consumption, charge port type), replaces the existing vehicle dropdown with a flat list/grid UI, introduces a vehicle detail panel, and integrates charging station display on the route planning map for EV vehicles.

## Glossary

- **Vehicle_Profile_Service**: The backend service responsible for CRUD operations on vehicle profiles stored in the vehicle_profiles table.
- **Vehicles_API**: The Express REST API endpoints under `/api/v1/vehicles` that expose vehicle profile data.
- **Vehicle_List_Component**: The frontend component that renders all user vehicles as a flat list or grid.
- **Vehicle_Detail_Panel**: The frontend panel that displays full technical details of a selected vehicle.
- **Route_Planner_Map**: The Google Maps instance used in the Route Planner page to display routes and points of interest.
- **Charging_Station_Layer**: The map overlay that displays EV charging station locations along a planned route.
- **ChargeMap_Service**: The integration layer that retrieves or displays charging station data from ChargeMap (chargemap.com).
- **EV**: Electric Vehicle — a vehicle powered exclusively by an electric battery.
- **ICE**: Internal Combustion Engine — a vehicle powered by fossil fuels.

## Requirements

### Requirement 1: EV Vehicle Type in Database

**User Story:** As a developer, I want the database schema to support EV as a vehicle type with EV-specific columns, so that EV vehicle profiles can be stored alongside existing vehicle types.

#### Acceptance Criteria

1. WHEN a database migration is applied, THE Vehicle_Profile_Service SHALL accept "ev" as a valid value in the vehicle_type column.
2. WHEN a database migration is applied, THE Vehicle_Profile_Service SHALL add a nullable battery_capacity_kwh column of type decimal to the vehicle_profiles table.
3. WHEN a database migration is applied, THE Vehicle_Profile_Service SHALL add a nullable consumption_kwh_per_100km column of type decimal to the vehicle_profiles table.
4. WHEN a database migration is applied, THE Vehicle_Profile_Service SHALL add a nullable charge_port_type column of type varchar to the vehicle_profiles table.
5. WHILE a vehicle profile has vehicle_type set to a value other than "ev", THE Vehicle_Profile_Service SHALL allow battery_capacity_kwh, consumption_kwh_per_100km, and charge_port_type to remain NULL.
6. WHILE a vehicle profile has vehicle_type set to "ev", THE Vehicle_Profile_Service SHALL allow tank_capacity_liters and fuel_type to remain NULL.
7. THE Vehicle_Profile_Service SHALL enforce that battery_capacity_kwh is between 10 and 200 when provided.
8. THE Vehicle_Profile_Service SHALL enforce that consumption_kwh_per_100km is between 5 and 50 when provided.

### Requirement 2: EV Vehicle Type in TypeScript Types

**User Story:** As a developer, I want the TypeScript type definitions to include EV as a vehicle type with corresponding fields, so that type safety is maintained across the codebase.

#### Acceptance Criteria

1. THE Vehicle_Profile_Service SHALL include "ev" in the VehicleType union type.
2. THE Vehicle_Profile_Service SHALL define battery_capacity_kwh as an optional numeric field on the VehicleProfile interface.
3. THE Vehicle_Profile_Service SHALL define consumption_kwh_per_100km as an optional numeric field on the VehicleProfile interface.
4. THE Vehicle_Profile_Service SHALL define charge_port_type as an optional string field on the VehicleProfile interface.
5. THE Vehicle_Profile_Service SHALL include "electric" in the FuelType union type for EV vehicles.

### Requirement 3: EV Vehicle Profile Creation and Validation

**User Story:** As a user, I want to create an EV vehicle profile with battery and charging details, so that I can plan routes with accurate EV range information.

#### Acceptance Criteria

1. WHEN a user submits a vehicle profile with vehicle_type "ev", THE Vehicles_API SHALL require battery_capacity_kwh, consumption_kwh_per_100km, and charge_port_type fields.
2. WHEN a user submits a vehicle profile with vehicle_type "ev", THE Vehicles_API SHALL accept fuel_type "electric" and allow tank_capacity_liters to be omitted.
3. IF battery_capacity_kwh is less than 10 or greater than 200, THEN THE Vehicles_API SHALL return a 400 status with a descriptive validation error.
4. IF consumption_kwh_per_100km is less than 5 or greater than 50, THEN THE Vehicles_API SHALL return a 400 status with a descriptive validation error.
5. IF charge_port_type is not one of the accepted values (Type1, Type2, CCS, CHAdeMO, Tesla), THEN THE Vehicles_API SHALL return a 400 status with a descriptive validation error.
6. WHEN a user submits a vehicle profile with vehicle_type "motorcycle", "car", or "camper", THE Vehicles_API SHALL continue to require fuel_type and tank_capacity_liters as before.

### Requirement 4: Vehicle List API Response

**User Story:** As a frontend developer, I want the vehicles list endpoint to return brand, model, type, and default status, so that the vehicle list UI can render all necessary information.

#### Acceptance Criteria

1. WHEN an authenticated user requests GET /api/v1/vehicles, THE Vehicles_API SHALL return all vehicle profiles including id, name, vehicle_type, fuel_type, and is_default fields.
2. THE Vehicles_API SHALL include battery_capacity_kwh, consumption_kwh_per_100km, and charge_port_type in the response for EV vehicle profiles.
3. THE Vehicles_API SHALL return NULL for battery_capacity_kwh, consumption_kwh_per_100km, and charge_port_type for non-EV vehicle profiles.
4. WHEN an authenticated user requests GET /api/v1/vehicles/:id, THE Vehicles_API SHALL return the full vehicle profile including all consumption, tank, and battery details.

### Requirement 5: Default Vehicle Designation

**User Story:** As a user, I want to mark one vehicle as my default, so that it is pre-selected for route planning and visually highlighted in the list.

#### Acceptance Criteria

1. THE Vehicles_API SHALL support an is_default boolean field on vehicle profiles.
2. WHEN a user sets a vehicle as default, THE Vehicle_Profile_Service SHALL unset is_default on all other vehicles belonging to that user.
3. WHEN a user has no vehicles marked as default, THE Vehicle_Profile_Service SHALL treat the most recently created vehicle as the implicit default.
4. WHEN a user requests GET /api/v1/vehicles, THE Vehicles_API SHALL include the is_default field in each vehicle response object.

### Requirement 6: Vehicle List UI — Flat List Rendering

**User Story:** As a user, I want to see all my vehicles in a flat list or grid instead of a dropdown, so that I can quickly identify and select a vehicle.

#### Acceptance Criteria

1. THE Vehicle_List_Component SHALL render all user vehicles as a flat list or grid layout.
2. THE Vehicle_List_Component SHALL display the vehicle name (brand and model) for each item.
3. THE Vehicle_List_Component SHALL display the vehicle_type as an icon or badge (Car, Motorcycle, Camper, EV) for each item.
4. THE Vehicle_List_Component SHALL display a visual indicator (star icon or "Default" badge) on the vehicle marked as default.
5. WHEN the user has no vehicle profiles, THE Vehicle_List_Component SHALL display a prompt to create a vehicle.
6. THE Vehicle_List_Component SHALL replace the existing VehicleSelector dropdown component.

### Requirement 7: Vehicle Detail Panel

**User Story:** As a user, I want to click a vehicle in the list to see its full technical details, so that I can review consumption and capacity information.

#### Acceptance Criteria

1. WHEN a user clicks a vehicle in the Vehicle_List_Component, THE Vehicle_Detail_Panel SHALL open and display the full details of that vehicle.
2. WHILE the selected vehicle has vehicle_type "car", "motorcycle", or "camper", THE Vehicle_Detail_Panel SHALL display fuel_type, tank_capacity_liters, and consumption_per_100km.
3. WHILE the selected vehicle has vehicle_type "ev", THE Vehicle_Detail_Panel SHALL display battery_capacity_kwh, consumption_kwh_per_100km, and charge_port_type.
4. WHILE the selected vehicle has vehicle_type "ev", THE Vehicle_Detail_Panel SHALL compute and display estimated range using the formula: (battery_capacity_kwh / consumption_kwh_per_100km) multiplied by 100.
5. WHEN the Vehicle_Detail_Panel is open, THE Vehicle_Detail_Panel SHALL provide a way to close the panel and return to the vehicle list.

### Requirement 8: Charging Station Map Display

**User Story:** As an EV user, I want to see charging stations on the route planning map, so that I can plan stops for recharging during long trips.

#### Acceptance Criteria

1. WHILE the selected vehicle has vehicle_type "ev" and a route is displayed, THE Route_Planner_Map SHALL display charging stations along the planned route.
2. THE Charging_Station_Layer SHALL retrieve charging station data from ChargeMap_Service.
3. IF the ChargeMap public API is available, THEN THE Charging_Station_Layer SHALL use the API to fetch station locations filtered by the route corridor.
4. IF the ChargeMap public API is not available, THEN THE Charging_Station_Layer SHALL embed the ChargeMap map widget (iframe) as a fallback to display nearby stations.
5. WHILE the selected vehicle has vehicle_type other than "ev", THE Route_Planner_Map SHALL hide the Charging_Station_Layer.
6. WHEN a user hovers over or clicks a charging station marker, THE Charging_Station_Layer SHALL display station details (name, connector types, availability if provided).

### Requirement 9: Backward Compatibility

**User Story:** As an existing user, I want my current vehicle profiles and workflows to remain unaffected after the EV feature is added, so that I experience no disruption.

#### Acceptance Criteria

1. THE Vehicle_Profile_Service SHALL continue to accept and validate "motorcycle", "car", and "camper" vehicle types without modification.
2. THE Vehicle_Profile_Service SHALL continue to enforce existing fuel_type and tank_capacity_liters constraints for non-EV vehicles.
3. THE Vehicles_API SHALL return existing vehicle profiles in the same response format, with EV-specific fields set to NULL for non-EV vehicles.
4. THE Vehicle_List_Component SHALL render existing vehicle types with their current icons or badges without visual regression.

### Requirement 10: Security and Data Access

**User Story:** As a user, I want my vehicle data to be securely stored and accessed, so that only I can view and modify my vehicles.

#### Acceptance Criteria

1. THE Vehicles_API SHALL use parameterized queries for all database operations involving EV-specific fields.
2. THE Vehicles_API SHALL verify vehicle ownership before returning or modifying any vehicle profile.
3. IF an unauthenticated user requests any vehicle endpoint, THEN THE Vehicles_API SHALL return a 401 status code.
4. IF a user requests a vehicle belonging to another user, THEN THE Vehicles_API SHALL return a 403 status code.
