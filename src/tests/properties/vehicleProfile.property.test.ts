import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  VALID_VEHICLE_TYPES,
  VALID_FUEL_TYPES,
  VALID_CHARGE_PORT_TYPES,
  TANK_CAPACITY_MIN,
  TANK_CAPACITY_MAX,
  CONSUMPTION_MIN,
  CONSUMPTION_MAX,
  BATTERY_CAPACITY_MIN,
  BATTERY_CAPACITY_MAX,
  CONSUMPTION_KWH_MIN,
  CONSUMPTION_KWH_MAX,
} from '../../models/vehicleProfile';

// ─── In-memory store for testing ──────────────────────────────────────────────

let profiles: any[] = [];
let idCounter = 0;

function generateId() {
  return `profile-uuid-${++idCounter}`;
}

function resetStore() {
  profiles = [];
  idCounter = 0;
}

const mockQueryFn = async (text: string, params?: unknown[]) => {
  // COUNT profiles for user
  if (text.includes('SELECT COUNT(*)') && text.includes('vehicle_profiles')) {
    const count = profiles.filter((p) => p.user_id === params![0]).length;
    return { rows: [{ count: count.toString() }], rowCount: 1 };
  }

  // INSERT profile
  if (text.includes('INSERT INTO vehicle_profiles')) {
    const profile = {
      id: generateId(),
      user_id: params![0],
      name: params![1],
      vehicle_type: params![2],
      fuel_type: params![3],
      tank_capacity_liters: params![4],
      consumption_per_100km: params![5],
      battery_capacity_kwh: params![6] ?? null,
      consumption_kwh_per_100km: params![7] ?? null,
      charge_port_type: params![8] ?? null,
      is_default: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    profiles.push(profile);
    return { rows: [profile], rowCount: 1 };
  }

  // SELECT profile by id
  if (text.includes('SELECT * FROM vehicle_profiles WHERE id')) {
    const found = profiles.filter((p) => p.id === params![0]);
    return { rows: found, rowCount: found.length };
  }

  // SELECT profiles by user_id
  if (text.includes('SELECT * FROM vehicle_profiles WHERE user_id')) {
    const found = profiles.filter((p) => p.user_id === params![0]);
    return { rows: found, rowCount: found.length };
  }

  return { rows: [], rowCount: 0 };
};

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn((...args: any[]) => mockQueryFn(args[0], args[1])),
  transaction: vi.fn(async (callback: any) => {
    const fakeClient = { query: (...args: any[]) => mockQueryFn(args[0], args[1]) };
    return callback(fakeClient);
  }),
  getClient: vi.fn(),
}));

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** ICE vehicle types only (no 'ev') */
const iceVehicleTypes = VALID_VEHICLE_TYPES.filter((t) => t !== 'ev');
const iceVehicleTypeArb = fc.constantFrom(...iceVehicleTypes);

/** ICE fuel types only (no 'electric') */
const iceFuelTypes = VALID_FUEL_TYPES.filter((t) => t !== 'electric');
const iceFuelTypeArb = fc.constantFrom(...iceFuelTypes);

/** Generate a valid vehicle type */
const vehicleTypeArb = fc.constantFrom(...VALID_VEHICLE_TYPES);

/** Generate a valid fuel type */
const fuelTypeArb = fc.constantFrom(...VALID_FUEL_TYPES);

/** Generate a valid charge port type */
const chargePortTypeArb = fc.constantFrom(...VALID_CHARGE_PORT_TYPES);

/** Generate a valid tank capacity in [5, 200] */
const validTankCapacityArb = fc.double({
  min: TANK_CAPACITY_MIN,
  max: TANK_CAPACITY_MAX,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generate a valid consumption in [1, 50] */
const validConsumptionArb = fc.double({
  min: CONSUMPTION_MIN,
  max: CONSUMPTION_MAX,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generate a valid battery capacity in [10, 200] */
const validBatteryCapacityArb = fc.double({
  min: BATTERY_CAPACITY_MIN,
  max: BATTERY_CAPACITY_MAX,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generate a valid EV consumption in [5, 50] */
const validConsumptionKwhArb = fc.double({
  min: CONSUMPTION_KWH_MIN,
  max: CONSUMPTION_KWH_MAX,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generate a valid non-whitespace-only name */
const validNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generate a valid ICE vehicle profile input */
const validIceProfileInputArb = fc.record({
  name: validNameArb,
  vehicle_type: iceVehicleTypeArb,
  fuel_type: iceFuelTypeArb,
  tank_capacity_liters: validTankCapacityArb,
  consumption_per_100km: validConsumptionArb,
});

/** Generate a valid EV vehicle profile input */
const validEvProfileInputArb = fc.record({
  name: validNameArb,
  vehicle_type: fc.constant('ev' as const),
  fuel_type: fc.constant('electric' as const),
  battery_capacity_kwh: validBatteryCapacityArb,
  consumption_kwh_per_100km: validConsumptionKwhArb,
  charge_port_type: chargePortTypeArb,
});

/** Generate a valid vehicle profile input (either ICE or EV) */
const validProfileInputArb = fc.oneof(validIceProfileInputArb, validEvProfileInputArb);

/** Generate a tank capacity outside [5, 200] */
const invalidTankCapacityArb = fc.oneof(
  fc.double({ min: -100, max: TANK_CAPACITY_MIN - 0.01, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: TANK_CAPACITY_MAX + 0.01, max: 1000, noNaN: true, noDefaultInfinity: true })
);

/** Generate a consumption outside [1, 50] */
const invalidConsumptionArb = fc.oneof(
  fc.double({ min: -100, max: CONSUMPTION_MIN - 0.01, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: CONSUMPTION_MAX + 0.01, max: 500, noNaN: true, noDefaultInfinity: true })
);

// ─── Property 8: Vehicle Profile Round-Trip ───────────────────────────────────
// **Validates: Requirements 5.1**
// Store and retrieve produces identical record.

describe('Property 8: Vehicle Profile Round-Trip', () => {
  let vehicleProfileService: typeof import('../../services/vehicleProfileService');

  beforeEach(async () => {
    resetStore();
    vehicleProfileService = await import('../../services/vehicleProfileService');
  });

  it('createProfile followed by getProfile returns the same data', async () => {
    /**
     * **Validates: Requirements 5.1**
     */
    await fc.assert(
      fc.asyncProperty(validProfileInputArb, async (input) => {
        resetStore();
        const userId = 'user-round-trip';

        // Create the profile
        const created = await vehicleProfileService.createProfile(userId, input);

        // Retrieve the profile
        const retrieved = await vehicleProfileService.getProfile(created.id);

        // Should exist
        expect(retrieved).not.toBeNull();

        // All fields should match
        expect(retrieved!.id).toBe(created.id);
        expect(retrieved!.user_id).toBe(userId);
        expect(retrieved!.name).toBe(input.name.trim());
        expect(retrieved!.vehicle_type).toBe(input.vehicle_type);

        if (input.vehicle_type === 'ev') {
          expect(retrieved!.fuel_type).toBe(input.fuel_type || 'electric');
          expect(retrieved!.battery_capacity_kwh).toBe(input.battery_capacity_kwh);
          expect(retrieved!.consumption_kwh_per_100km).toBe(input.consumption_kwh_per_100km);
          expect(retrieved!.charge_port_type).toBe(input.charge_port_type);
        } else {
          expect(retrieved!.fuel_type).toBe(input.fuel_type);
          expect(retrieved!.tank_capacity_liters).toBe(input.tank_capacity_liters);
          expect(retrieved!.consumption_per_100km).toBe(input.consumption_per_100km);
        }
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 9: Vehicle Profile Validation Boundaries ────────────────────────
// **Validates: Requirements 5.2, 5.3, 5.6**
// Values in [5,200] and [1,50] accepted, outside rejected with error messages.

describe('Property 9: Vehicle Profile Validation Boundaries', () => {
  let vehicleProfileService: typeof import('../../services/vehicleProfileService');

  beforeEach(async () => {
    resetStore();
    vehicleProfileService = await import('../../services/vehicleProfileService');
  });

  it('valid tank capacity and consumption values are accepted', async () => {
    /**
     * **Validates: Requirements 5.2, 5.3**
     */
    await fc.assert(
      fc.asyncProperty(validProfileInputArb, async (input) => {
        const result = vehicleProfileService.validateVehicleProfileInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 10 }
    );
  });

  it('tank capacity outside [5, 200] is rejected with error message', async () => {
    /**
     * **Validates: Requirements 5.2, 5.6**
     */
    await fc.assert(
      fc.asyncProperty(
        invalidTankCapacityArb,
        iceFuelTypeArb,
        iceVehicleTypeArb,
        validConsumptionArb,
        async (tankCapacity, fuelType, vehicleType, consumption) => {
          const input = {
            name: 'Test Vehicle',
            vehicle_type: vehicleType as string,
            fuel_type: fuelType as string,
            tank_capacity_liters: tankCapacity,
            consumption_per_100km: consumption,
          };

          const result = vehicleProfileService.validateVehicleProfileInput(input);

          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors).toContain(
              `Tank capacity must be between ${TANK_CAPACITY_MIN} and ${TANK_CAPACITY_MAX} liters`
            );
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('consumption outside [1, 50] is rejected with error message', async () => {
    /**
     * **Validates: Requirements 5.3, 5.6**
     */
    await fc.assert(
      fc.asyncProperty(
        invalidConsumptionArb,
        iceFuelTypeArb,
        iceVehicleTypeArb,
        validTankCapacityArb,
        async (consumption, fuelType, vehicleType, tankCapacity) => {
          const input = {
            name: 'Test Vehicle',
            vehicle_type: vehicleType as string,
            fuel_type: fuelType as string,
            tank_capacity_liters: tankCapacity,
            consumption_per_100km: consumption,
          };

          const result = vehicleProfileService.validateVehicleProfileInput(input);

          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors).toContain(
              `Consumption must be between ${CONSUMPTION_MIN} and ${CONSUMPTION_MAX} L/100km`
            );
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
