# Design Document: Road Costs Breakdown

## Architecture Overview

This feature extends the existing `CostBreakdownService` and `CostBreakdownPanel` to include road costs (vignettes, bridge tolls, and highway tolls). The backend calls the Google Routes API `computeRoutes` endpoint with `extraComputations: ["TOLLS"]` to retrieve toll data, combines it with existing vignette pricing from the database, and returns a unified `roadCosts` object. The frontend renders a new "Road Costs" subsection with vignette duration dropdowns, bridge tolls, and highway tolls.

### Data Flow

```
┌─────────────────────┐
│  CostBreakdownPanel │
│  (Frontend)         │
└────────┬────────────┘
         │ GET /cost-breakdown/:routeId?vehicleId=X&durations={...}
         ▼
┌─────────────────────────┐
│  costBreakdownRoute.ts  │  (auth + ownership validation)
└────────┬────────────────┘
         ▼
┌─────────────────────────────┐
│  CostBreakdownService       │
│  getCostBreakdown()         │
├─────────────────────────────┤
│  1. Fetch route segments    │──▶ routeService
│  2. Fetch vehicle profile   │──▶ vehicleProfileService
│  3. Calculate fuel costs    │──▶ fuelPriceService
│  4. Fetch toll data         │──▶ Google Routes API (NEW)
│  5. Calculate vignettes     │──▶ vignetteService
│  6. Compose roadCosts       │
│  7. Calculate totals        │
└─────────────────────────────┘
```

## Components

### Backend

#### 1. `src/services/tollService.ts` (NEW)

Encapsulates Google Routes API toll retrieval and parsing. Responsible for:
- Calling `computeRoutes` with `extraComputations: ["TOLLS"]`
- Parsing the response into typed `BridgeTollEntry` and `HighwayTollEntry` arrays
- Handling API errors/timeouts gracefully (returns `null` on failure)

#### 2. `src/services/costBreakdownService.ts` (MODIFIED)

Extended to:
- Call `tollService.getTollsForRoute()` during cost composition
- Include a `roadCosts` object in the response
- Calculate `totalRoadCostsEur` as sum of vignettes + bridge tolls + highway tolls
- Update `totalCostEur` to include road costs (fuel + road costs)
- Mark `isPartialEstimate: true` when toll API fails

#### 3. `src/models/roadCosts.ts` (NEW)

TypeScript interfaces for the road costs feature.

### Frontend

#### 4. `frontend/src/components/CostBreakdownPanel.ts` (MODIFIED)

Extended to:
- Render a "Road Costs" subsection with vignettes, bridge tolls, and highway tolls
- Render duration dropdowns per vignette country (defaulting to shortest available)
- Conditionally hide bridge/highway toll groups when empty
- Display road costs subtotal
- Re-fetch on duration change

#### 5. `frontend/src/services/costCalculations.ts` (MODIFIED)

Extended with:
- New interfaces matching the backend `roadCosts` response structure
- Helper function for road costs subtotal calculation

## Interfaces

### New TypeScript Interfaces (`src/models/roadCosts.ts`)

```typescript
/**
 * Google Routes API toll response structure (relevant subset).
 */
export interface GoogleRoutesTollInfo {
  tollInfo?: {
    estimatedPrice?: Array<{
      currencyCode: string;
      units: string;
      nanos?: number;
    }>;
  };
  // Per-leg toll info from the Routes API
  legs?: Array<{
    travelAdvisory?: {
      tollInfo?: {
        estimatedPrice?: Array<{
          currencyCode: string;
          units: string;
          nanos?: number;
        }>;
      };
    };
  }>;
  // Route-level toll info
  travelAdvisory?: {
    tollInfo?: {
      estimatedPrice?: Array<{
        currencyCode: string;
        units: string;
        nanos?: number;
      }>;
    };
  };
}

/**
 * Parsed toll entry from the Google Routes API response.
 */
export interface ParsedTollEntry {
  name: string;
  costEur: number;
  category: 'bridge' | 'highway';
}

/**
 * A bridge toll entry in the cost breakdown response.
 */
export interface BridgeTollEntry {
  name: string;
  cost: number;
}

/**
 * A highway toll entry in the cost breakdown response.
 */
export interface HighwayTollEntry {
  segment: string;
  cost: number;
}

/**
 * A vignette entry in the road costs response.
 */
export interface VignetteEntry {
  countryCode: string;
  countryName: string;
  duration: string;
  cost: number;
  availableDurations: string[];
}

/**
 * The road costs section of the cost breakdown response.
 */
export interface RoadCosts {
  vignettes: VignetteEntry[];
  bridgeTolls: BridgeTollEntry[];
  highwayTolls: HighwayTollEntry[];
  totalRoadCostsEur: number;
}
```

### Modified `CostBreakdownData` Interface

```typescript
export interface CostBreakdownData {
  totalCostEur: number;
  isPartialEstimate: boolean;
  fuel: {
    totalFuelCostEur: number;
    breakdown: FuelCountryBreakdown[];
  };
  roadCosts: RoadCosts;  // NEW — replaces top-level vignettes
  vehicleProfile: {
    id: string;
    name: string;
    fuelType: string;
    consumptionPer100km: number;
  };
}
```

### Toll Service Interface

```typescript
export interface TollServiceResult {
  bridgeTolls: BridgeTollEntry[];
  highwayTolls: HighwayTollEntry[];
}

/**
 * Fetches toll data for a route from the Google Routes API.
 * Returns null if the API call fails or times out.
 */
export async function getTollsForRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[]
): Promise<TollServiceResult | null>;
```

## Data Models

### Google Routes API Request (computeRoutes)

```typescript
// POST https://routes.googleapis.com/directions/v2:computeRoutes
{
  origin: { location: { latLng: { latitude: number, longitude: number } } },
  destination: { location: { latLng: { latitude: number, longitude: number } } },
  intermediates?: Array<{ location: { latLng: { latitude: number, longitude: number } } }>,
  travelMode: "DRIVE",
  extraComputations: ["TOLLS"],
  routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" } }
}
```

### Google Routes API Response (toll-relevant subset)

```typescript
{
  routes: [{
    legs: [{
      travelAdvisory: {
        tollInfo: {
          estimatedPrice: [{ currencyCode: "EUR", units: "5", nanos: 500000000 }]
        }
      }
    }],
    travelAdvisory: {
      tollInfo: {
        estimatedPrice: [{ currencyCode: "EUR", units: "12", nanos: 300000000 }]
      }
    }
  }]
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Google Routes API timeout (>10s) | Return cost breakdown without toll data, `isPartialEstimate: true` |
| Google Routes API error (4xx/5xx) | Return cost breakdown without toll data, `isPartialEstimate: true` |
| Google Routes API returns no tolls | Return empty `bridgeTolls` and `highwayTolls` arrays, `isPartialEstimate: false` |
| Route not found | 404 error with requestId |
| Vehicle not found | 404 error with requestId |
| Unauthenticated request | 401 error with requestId |
| Route not owned by user | 403 error with requestId |
| Vignette price unavailable | Include entry with `cost: 0`, `isPartialEstimate: true` |

## Key Design Decisions

1. **Toll service as separate module**: The Google Routes API toll logic is isolated in `tollService.ts` rather than embedded in `costBreakdownService.ts`. This keeps the cost breakdown service focused on composition and makes toll logic independently testable.

2. **Graceful degradation on toll API failure**: When the toll API fails, the response still includes fuel and vignette data. The `isPartialEstimate` flag signals to the frontend that some data is missing.

3. **Road costs replaces top-level vignettes**: The existing `vignettes` field in `CostBreakdownData` is moved under `roadCosts.vignettes`. This is a breaking change to the API response shape but consolidates all road-related costs under one object.

4. **Duration dropdown defaults to shortest**: Consistent with the existing behavior in `costBreakdownService.ts` which already uses `getShortestDuration()`.

5. **Toll categorization**: The Google Routes API doesn't explicitly categorize tolls as "bridge" vs "highway". The toll service uses heuristics based on toll names (e.g., names containing "bridge", "tunnel", "crossing" → bridge toll; others → highway toll).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Toll parsing extracts all entries with required fields

*For any* valid Google Routes API toll response containing N toll entries, the parsed result SHALL contain exactly N entries, each with a non-empty name, a non-negative cost, and a category that is either "bridge" or "highway".

**Validates: Requirements 1.2**

### Property 2: Road costs response structure completeness

*For any* valid route and vehicle combination, the cost breakdown response SHALL contain a `roadCosts` object with `vignettes` (array where each entry has countryCode, countryName, duration, cost, and availableDurations), `bridgeTolls` (array where each entry has name and cost), `highwayTolls` (array where each entry has segment and cost), and `totalRoadCostsEur` (number).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Road costs total equals sum of components

*For any* set of vignette costs, bridge toll costs, and highway toll costs, `totalRoadCostsEur` SHALL equal the sum of all individual costs rounded to 2 decimal places.

**Validates: Requirements 2.5**

### Property 4: Duration override lookup correctness

*For any* country with available vignette durations and a valid duration override, the service SHALL return the price corresponding to the overridden duration (not the default shortest duration).

**Validates: Requirements 4.3**

### Property 5: Duration dropdown shows only available durations

*For any* vignette country with a set of available durations reported by the Vignette_Service, the rendered dropdown SHALL contain exactly those durations and no others.

**Validates: Requirements 4.1, 4.4**

### Property 6: Default duration is shortest available

*For any* vignette country with multiple available durations, the default selected duration SHALL be the one with the lowest duration order value (i.e., the shortest validity period).

**Validates: Requirements 4.5**

### Property 7: Road cost entries render all required information

*For any* set of road cost data (vignettes, bridge tolls, highway tolls), the rendered UI SHALL display: for each vignette — country name, selected duration, and cost in EUR; for each bridge toll — bridge name and cost in EUR; for each highway toll — segment name and cost in EUR.

**Validates: Requirements 5.2, 5.3, 5.4**

### Property 8: Road costs subtotal equals sum of displayed components

*For any* rendered cost breakdown with road costs data, the displayed "Road costs subtotal" value SHALL equal the sum of all displayed vignette costs, bridge toll costs, and highway toll costs.

**Validates: Requirements 5.5**

### Property 9: Total cost equals fuel plus road costs

*For any* cost breakdown with fuel cost F and road costs R (vignettes + bridge tolls + highway tolls), `totalCostEur` SHALL equal `F + R` rounded to 2 decimal places.

**Validates: Requirements 6.1**
