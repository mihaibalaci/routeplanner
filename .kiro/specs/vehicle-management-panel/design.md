# Design Document: Vehicle Management Panel

## Architecture Overview

The Vehicle Management Panel extends the existing Route Planner platform with a dedicated "My Vehicles" page and enhanced API endpoints. The architecture follows the existing Express + PostgreSQL backend and vanilla TypeScript frontend pattern already established in the codebase.

**Key architectural decisions:**
- The `is_default` column is added to the existing `vehicle_profiles` table via a new migration
- Route count is computed via a SQL JOIN between `routes` (status = 'finalized') and `trip_costs` (vehicle_profile_id) — not stored as a denormalized column
- The set-default operation uses a database transaction to ensure atomicity
- The frontend page follows the same component pattern as existing pages (class-based, manual DOM rendering)

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Vanilla TS + Vite)                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  VehicleManagementPage                                    │   │
│  │  ┌─────────────────────┐  ┌───────────────────────────┐  │   │
│  │  │  VehicleListPanel   │  │  VehicleDetailPanel        │  │   │
│  │  │  - vehicle items    │  │  - full details            │  │   │
│  │  │  - default badge    │  │  - route count             │  │   │
│  │  │  - click selection  │  │  - set default toggle      │  │   │
│  │  └─────────────────────┘  └───────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  VehicleSelector (existing, enhanced)                     │   │
│  │  - auto-selects default vehicle on load                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP (apiClient)
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Express + PostgreSQL)                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  vehicles.ts (routes)                                     │   │
│  │  GET  /api/v1/vehicles          → list with route_count   │   │
│  │  GET  /api/v1/vehicles/:id      → detail with route_count │   │
│  │  PATCH /api/v1/vehicles/:id/default → set default         │   │
│  │  POST /api/v1/vehicles          → create (enhanced)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  vehicleProfileService.ts (enhanced)                      │   │
│  │  - getProfilesWithRouteCount(userId)                      │   │
│  │  - getProfileWithRouteCount(profileId)                    │   │
│  │  - setDefaultVehicle(userId, vehicleId)                   │   │
│  │  - createProfile (enhanced with auto-default)             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL                                               │   │
│  │  vehicle_profiles: + is_default BOOLEAN DEFAULT false     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Backend Components

#### 1. Database Migration (`migrations/170000000X000_add-is-default-column.js`)

Adds the `is_default` column to `vehicle_profiles`.

```typescript
// Migration: add is_default column
exports.up = (pgm) => {
  pgm.addColumn('vehicle_profiles', {
    is_default: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('vehicle_profiles', 'is_default');
};
```

#### 2. Enhanced Vehicle Profile Model (`src/models/vehicleProfile.ts`)

Extended interfaces to include `is_default` and `route_count`.

```typescript
export interface VehicleProfile {
  id: string;
  user_id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface VehicleListItem {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  is_default: boolean;
  route_count: number;
}

export interface VehicleDetailResponse {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: boolean;
  route_count: number;
}

export interface SetDefaultResponse {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: true;
  route_count: number;
}
```

#### 3. Enhanced Vehicle Profile Service (`src/services/vehicleProfileService.ts`)

New functions for route count computation, default management, and auto-default on creation.

```typescript
/**
 * Computes route_count for a vehicle: number of finalized routes
 * that have a trip_costs record referencing this vehicle.
 */
export async function computeRouteCount(vehicleId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(DISTINCT r.id) as count
     FROM routes r
     INNER JOIN trip_costs tc ON tc.route_id = r.id
     WHERE tc.vehicle_profile_id = $1
       AND r.status = 'finalized'`,
    [vehicleId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Retrieves all vehicle profiles for a user with route_count included.
 */
export async function getProfilesWithRouteCount(userId: string): Promise<VehicleListItem[]> {
  const result = await query(
    `SELECT vp.id, vp.name, vp.vehicle_type, vp.is_default,
            COUNT(DISTINCT r.id) as route_count
     FROM vehicle_profiles vp
     LEFT JOIN trip_costs tc ON tc.vehicle_profile_id = vp.id
     LEFT JOIN routes r ON r.id = tc.route_id AND r.status = 'finalized'
     WHERE vp.user_id = $1
     GROUP BY vp.id
     ORDER BY vp.created_at ASC`,
    [userId]
  );
  return result.rows.map(row => ({
    ...row,
    route_count: parseInt(row.route_count, 10),
  }));
}

/**
 * Retrieves a single vehicle profile with route_count.
 */
export async function getProfileWithRouteCount(
  profileId: string
): Promise<VehicleDetailResponse | null> {
  const result = await query(
    `SELECT vp.*, COUNT(DISTINCT r.id) as route_count
     FROM vehicle_profiles vp
     LEFT JOIN trip_costs tc ON tc.vehicle_profile_id = vp.id
     LEFT JOIN routes r ON r.id = tc.route_id AND r.status = 'finalized'
     WHERE vp.id = $1
     GROUP BY vp.id`,
    [profileId]
  );
  if (result.rows.length === 0) return null;
  return { ...result.rows[0], route_count: parseInt(result.rows[0].route_count, 10) };
}

/**
 * Sets a vehicle as the user's default within a transaction.
 * Clears is_default on all other user vehicles, sets it on the target.
 */
export async function setDefaultVehicle(
  userId: string,
  vehicleId: string
): Promise<VehicleDetailResponse> {
  return transaction(async (client) => {
    // Clear all defaults for this user
    await client.query(
      'UPDATE vehicle_profiles SET is_default = false WHERE user_id = $1',
      [userId]
    );
    // Set the new default
    await client.query(
      'UPDATE vehicle_profiles SET is_default = true, updated_at = NOW() WHERE id = $1',
      [vehicleId]
    );
    // Return updated profile with route count
    const result = await client.query(
      `SELECT vp.*, COUNT(DISTINCT r.id) as route_count
       FROM vehicle_profiles vp
       LEFT JOIN trip_costs tc ON tc.vehicle_profile_id = vp.id
       LEFT JOIN routes r ON r.id = tc.route_id AND r.status = 'finalized'
       WHERE vp.id = $1
       GROUP BY vp.id`,
      [vehicleId]
    );
    return { ...result.rows[0], route_count: parseInt(result.rows[0].route_count, 10) };
  });
}
```

**Enhanced `createProfile`** — auto-default logic:

```typescript
export async function createProfile(
  userId: string,
  data: CreateVehicleProfileInput
): Promise<VehicleProfile> {
  // ... existing validation and count check ...

  // Determine if this should be the default (first vehicle for user)
  const countResult = await query(
    'SELECT COUNT(*) as count FROM vehicle_profiles WHERE user_id = $1',
    [userId]
  );
  const currentCount = parseInt(countResult.rows[0].count, 10);
  const shouldBeDefault = currentCount === 0;

  const result = await query(
    `INSERT INTO vehicle_profiles
       (user_id, name, vehicle_type, fuel_type, tank_capacity_liters, consumption_per_100km, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      data.name.trim(),
      data.vehicle_type,
      data.fuel_type,
      data.tank_capacity_liters,
      data.consumption_per_100km,
      shouldBeDefault,
    ]
  );

  return result.rows[0] as VehicleProfile;
}
```

#### 4. Enhanced Vehicle Routes (`src/routes/vehicles.ts`)

New PATCH endpoint and enhanced GET endpoints.

```typescript
/**
 * PATCH /api/v1/vehicles/:id/default
 * Set a vehicle as the user's default.
 */
router.patch('/:id/default', async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ status: 401, message: 'Authentication required' });
  }

  const profile = await getProfile(req.params.id);
  if (!profile) {
    return res.status(404).json({ status: 404, message: 'Vehicle profile not found' });
  }
  if (profile.user_id !== userId) {
    return res.status(403).json({ status: 403, message: 'Access denied' });
  }

  const updated = await setDefaultVehicle(userId, req.params.id);
  res.status(200).json({ status: 200, data: updated });
});
```

### Frontend Components

#### 5. Vehicle Management Page (`frontend/src/pages/VehicleManagementPage.ts`)

The main page component that orchestrates the split-panel layout.

```typescript
export class VehicleManagementPage {
  private container: HTMLElement;
  private listPanel: VehicleListPanel;
  private detailPanel: VehicleDetailPanel;
  private vehicles: VehicleListItemResponse[] = [];
  private selectedVehicleId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.listPanel = new VehicleListPanel({
      onSelect: (id) => this.handleVehicleSelect(id),
    });
    this.detailPanel = new VehicleDetailPanel({
      onSetDefault: (id) => this.handleSetDefault(id),
    });
  }

  async mount(): Promise<void> {
    this.render();
    await this.loadVehicles();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="vehicle-management">
        <h1 class="vehicle-management__title">My Vehicles</h1>
        <div class="vehicle-management__layout">
          <div class="vehicle-management__list" id="vehicle-list-panel"></div>
          <div class="vehicle-management__detail" id="vehicle-detail-panel"></div>
        </div>
      </div>
    `;
    // Mount sub-panels into their containers
  }

  private async loadVehicles(): Promise<void> { /* fetch GET /api/v1/vehicles */ }
  private async handleVehicleSelect(id: string): Promise<void> { /* fetch detail */ }
  private async handleSetDefault(id: string): Promise<void> { /* PATCH default */ }
}
```

#### 6. Vehicle List Panel (`frontend/src/components/VehicleListPanel.ts`)

Renders the scrollable vehicle list with type icons and default badge.

```typescript
export interface VehicleListItemResponse {
  id: string;
  name: string;
  vehicle_type: 'motorcycle' | 'car' | 'camper';
  is_default: boolean;
  route_count: number;
}

export interface VehicleListPanelOptions {
  onSelect: (vehicleId: string) => void;
}

export class VehicleListPanel {
  private container: HTMLElement | null = null;
  private vehicles: VehicleListItemResponse[] = [];
  private selectedId: string | null = null;
  private onSelect: (vehicleId: string) => void;

  constructor(options: VehicleListPanelOptions) {
    this.onSelect = options.onSelect;
  }

  mount(container: HTMLElement): void { this.container = container; }

  setVehicles(vehicles: VehicleListItemResponse[]): void {
    this.vehicles = vehicles;
    this.render();
  }

  private render(): void {
    // Renders list items with type icon and default badge
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      car: 'directions_car',
      motorcycle: 'two_wheeler',
      camper: 'rv_hookup',
    };
    return icons[type] ?? 'directions_car';
  }
}
```

#### 7. Vehicle Detail Panel (`frontend/src/components/VehicleDetailPanel.ts`)

Renders full vehicle details with set-default toggle.

```typescript
export interface VehicleDetailData {
  id: string;
  name: string;
  vehicle_type: string;
  fuel_type: string;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: boolean;
  route_count: number;
}

export interface VehicleDetailPanelOptions {
  onSetDefault: (vehicleId: string) => void;
}

export class VehicleDetailPanel {
  private container: HTMLElement | null = null;
  private vehicle: VehicleDetailData | null = null;
  private onSetDefault: (vehicleId: string) => void;

  constructor(options: VehicleDetailPanelOptions) {
    this.onSetDefault = options.onSetDefault;
  }

  mount(container: HTMLElement): void { this.container = container; }

  setVehicle(vehicle: VehicleDetailData | null): void {
    this.vehicle = vehicle;
    this.render();
  }

  private render(): void {
    if (!this.vehicle) {
      this.renderPlaceholder();
      return;
    }
    this.renderDetail();
  }

  private renderPlaceholder(): void {
    // "Select a vehicle to view details"
  }

  private renderDetail(): void {
    // Full detail view with set-default toggle
  }
}
```

#### 8. Enhanced VehicleSelector (`frontend/src/components/VehicleSelector.ts`)

Enhanced to auto-select the default vehicle when profiles are loaded.

```typescript
// Enhanced setProfiles to auto-select default
setProfiles(profiles: VehicleProfileResponse[]): void {
  this.profiles = profiles;
  // Auto-select the default vehicle if one exists
  const defaultProfile = profiles.find(p => p.is_default);
  if (defaultProfile && !this.selectedId) {
    this.selectedId = defaultProfile.id;
    this.onSelect(defaultProfile.id);
  }
  this.render();
}
```

## Data Models

### Database Schema Change

```sql
-- New column on vehicle_profiles
ALTER TABLE vehicle_profiles
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;
```

### Route Count Query

The route count is computed dynamically (not stored) to avoid stale data:

```sql
SELECT COUNT(DISTINCT r.id)
FROM routes r
INNER JOIN trip_costs tc ON tc.route_id = r.id
WHERE tc.vehicle_profile_id = $1
  AND r.status = 'finalized'
```

### TypeScript Interfaces

#### Backend Response Types

```typescript
// GET /api/v1/vehicles response item
export interface VehicleListItemResponse {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  is_default: boolean;
  route_count: number;
}

// GET /api/v1/vehicles/:id response
export interface VehicleDetailResponse {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: boolean;
  route_count: number;
}

// PATCH /api/v1/vehicles/:id/default response
export interface SetDefaultVehicleResponse {
  id: string;
  name: string;
  vehicle_type: VehicleType;
  fuel_type: FuelType;
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: true;
  route_count: number;
}
```

#### Frontend Types

```typescript
// Frontend mirrors of backend response types
export interface VehicleListItem {
  id: string;
  name: string;
  vehicle_type: 'motorcycle' | 'car' | 'camper';
  is_default: boolean;
  route_count: number;
}

export interface VehicleDetail {
  id: string;
  name: string;
  vehicle_type: 'motorcycle' | 'car' | 'camper';
  fuel_type: 'diesel' | 'petrol_95' | 'petrol_98' | 'lpg';
  tank_capacity_liters: number;
  consumption_per_100km: number;
  is_default: boolean;
  route_count: number;
}
```

## Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Unauthenticated request | 401 | `{ status: 401, message: "Authentication required" }` |
| Vehicle not found | 404 | `{ status: 404, message: "Vehicle profile not found" }` |
| Vehicle belongs to another user | 403 | `{ status: 403, message: "Access denied" }` |
| Database error during set-default | 500 | `{ status: 500, message: "Failed to update default vehicle" }` — transaction is rolled back |
| Invalid vehicle ID format | 400 | `{ status: 400, message: "Invalid vehicle ID" }` |

The `setDefaultVehicle` function uses the existing `transaction()` utility from `src/utils/database.ts`, which automatically rolls back on error and releases the client.

Frontend error handling:
- Network errors display a toast notification and preserve the current UI state
- 401 errors redirect to the login page
- 403/404 errors display an inline error message in the detail panel

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Route count equals finalized routes with trip_costs

*For any* vehicle profile and any set of routes in the database, the computed `route_count` SHALL equal the number of distinct routes where `status = 'finalized'` AND a `trip_costs` record exists with `vehicle_profile_id` matching that vehicle.

**Validates: Requirements 1.2, 2.2**

### Property 2: Single default vehicle invariant

*For any* user with one or more vehicles, after any sequence of set-default operations, exactly one vehicle SHALL have `is_default = true` and all other vehicles belonging to that user SHALL have `is_default = false`.

**Validates: Requirements 3.1, 3.5**

### Property 3: Auto-default on first vehicle creation

*For any* valid vehicle profile input, if the user has zero existing vehicle profiles then the created vehicle SHALL have `is_default = true`; if the user already has one or more vehicle profiles then the created vehicle SHALL have `is_default = false`.

**Validates: Requirements 4.1, 4.2**

### Property 4: Vehicle list item rendering includes name and type icon

*For any* vehicle with a valid `vehicle_type` (car, motorcycle, or camper), the rendered list item SHALL contain the vehicle's `name` text and the corresponding type-specific icon identifier.

**Validates: Requirements 6.1**

### Property 5: Default vehicle badge visibility in list

*For any* list of vehicles where exactly one has `is_default = true`, the rendered vehicle list SHALL display a default indicator (badge/highlight) only on the default vehicle's list item.

**Validates: Requirements 6.2**

### Property 6: Vehicle detail panel displays all required fields

*For any* valid vehicle detail data, the rendered detail panel SHALL contain the vehicle name, vehicle type, fuel type, tank capacity, consumption per 100km, and route count values.

**Validates: Requirements 7.1**

### Property 7: VehicleSelector auto-selects default vehicle

*For any* list of vehicle profiles where exactly one has `is_default = true`, when the profiles are loaded into the VehicleSelector, the selected vehicle ID SHALL equal the ID of the default vehicle.

**Validates: Requirements 9.1**
