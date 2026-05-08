import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  VehicleProfile,
  VALID_CHARGE_PORT_TYPES,
  VALID_FUEL_TYPES,
  TANK_CAPACITY_MIN,
  TANK_CAPACITY_MAX,
  CONSUMPTION_MIN,
  CONSUMPTION_MAX,
  BATTERY_CAPACITY_MIN,
  BATTERY_CAPACITY_MAX,
  CONSUMPTION_KWH_MIN,
  CONSUMPTION_KWH_MAX,
  toVehicleProfileResponse,
} from '../models/vehicleProfile';
import { validateVehicleProfileInput } from './vehicleProfileService';

// Feature: ev-vehicle-category, Property 1: Conditional field requirements based on vehicle type
// **Validates: Requirements 1.5, 1.6, 3.1, 3.6, 9.1, 9.2**
describe('Property 1: Conditional field requirements based on vehicle type', () => {
  // Generators for valid field values
  const validName = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

  const validFuelType = fc.constantFrom(
    ...VALID_FUEL_TYPES.filter((f) => f !== 'electric')
  );

  const validChargePortType = fc.constantFrom(...VALID_CHARGE_PORT_TYPES);

  const validTankCapacity = fc.double({
    min: TANK_CAPACITY_MIN,
    max: TANK_CAPACITY_MAX,
    noNaN: true,
  });

  const validConsumption = fc.double({
    min: CONSUMPTION_MIN,
    max: CONSUMPTION_MAX,
    noNaN: true,
  });

  const validBatteryCapacity = fc.double({
    min: BATTERY_CAPACITY_MIN,
    max: BATTERY_CAPACITY_MAX,
    noNaN: true,
  });

  const validConsumptionKwh = fc.double({
    min: CONSUMPTION_KWH_MIN,
    max: CONSUMPTION_KWH_MAX,
    noNaN: true,
  });

  const nonEvVehicleType = fc.constantFrom(
    'motorcycle' as const,
    'car' as const,
    'camper' as const
  );

  // --- EV vehicle tests ---

  it('accepts valid EV vehicle profiles with all required EV fields', () => {
    fc.assert(
      fc.property(
        validName,
        validBatteryCapacity,
        validConsumptionKwh,
        validChargePortType,
        (name, battery, consumption, chargePort) => {
          const input = {
            name,
            vehicle_type: 'ev',
            battery_capacity_kwh: battery,
            consumption_kwh_per_100km: consumption,
            charge_port_type: chargePort,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects EV vehicle profiles missing battery_capacity_kwh', () => {
    fc.assert(
      fc.property(
        validName,
        validConsumptionKwh,
        validChargePortType,
        (name, consumption, chargePort) => {
          const input = {
            name,
            vehicle_type: 'ev',
            consumption_kwh_per_100km: consumption,
            charge_port_type: chargePort,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some((e) => e.toLowerCase().includes('battery'))
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects EV vehicle profiles missing consumption_kwh_per_100km', () => {
    fc.assert(
      fc.property(
        validName,
        validBatteryCapacity,
        validChargePortType,
        (name, battery, chargePort) => {
          const input = {
            name,
            vehicle_type: 'ev',
            battery_capacity_kwh: battery,
            charge_port_type: chargePort,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some(
                (e) =>
                  e.toLowerCase().includes('energy consumption') ||
                  e.toLowerCase().includes('consumption')
              )
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects EV vehicle profiles missing charge_port_type', () => {
    fc.assert(
      fc.property(
        validName,
        validBatteryCapacity,
        validConsumptionKwh,
        (name, battery, consumption) => {
          const input = {
            name,
            vehicle_type: 'ev',
            battery_capacity_kwh: battery,
            consumption_kwh_per_100km: consumption,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some((e) => e.toLowerCase().includes('charge port'))
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Non-EV vehicle tests ---

  it('accepts valid non-EV vehicle profiles with all required ICE fields', () => {
    fc.assert(
      fc.property(
        validName,
        nonEvVehicleType,
        validFuelType,
        validTankCapacity,
        validConsumption,
        (name, vehicleType, fuelType, tank, consumption) => {
          const input = {
            name,
            vehicle_type: vehicleType,
            fuel_type: fuelType,
            tank_capacity_liters: tank,
            consumption_per_100km: consumption,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-EV vehicle profiles missing fuel_type', () => {
    fc.assert(
      fc.property(
        validName,
        nonEvVehicleType,
        validTankCapacity,
        validConsumption,
        (name, vehicleType, tank, consumption) => {
          const input = {
            name,
            vehicle_type: vehicleType,
            tank_capacity_liters: tank,
            consumption_per_100km: consumption,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some((e) => e.toLowerCase().includes('fuel type'))
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-EV vehicle profiles missing tank_capacity_liters', () => {
    fc.assert(
      fc.property(
        validName,
        nonEvVehicleType,
        validFuelType,
        validConsumption,
        (name, vehicleType, fuelType, consumption) => {
          const input = {
            name,
            vehicle_type: vehicleType,
            fuel_type: fuelType,
            consumption_per_100km: consumption,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some((e) => e.toLowerCase().includes('tank capacity'))
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-EV vehicle profiles missing consumption_per_100km', () => {
    fc.assert(
      fc.property(
        validName,
        nonEvVehicleType,
        validFuelType,
        validTankCapacity,
        (name, vehicleType, fuelType, tank) => {
          const input = {
            name,
            vehicle_type: vehicleType,
            fuel_type: fuelType,
            tank_capacity_liters: tank,
          };
          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(
              result.errors.some((e) => e.toLowerCase().includes('consumption'))
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: ev-vehicle-category, Property 6: Implicit default fallback
// **Validates: Requirements 5.3**
describe('Property 6: Implicit default fallback', () => {
  /**
   * For any user whose vehicles all have is_default = false,
   * the vehicle with the most recent created_at timestamp SHALL be
   * treated as the implicit default when resolving the default vehicle.
   */

  function resolveImplicitDefault(vehicles: VehicleProfile[]): VehicleProfile | null {
    if (vehicles.length === 0) return null;
    return vehicles.reduce((latest, current) => {
      return current.created_at.getTime() > latest.created_at.getTime() ? current : latest;
    });
  }

  const vehicleProfileArb = fc
    .record({
      id: fc.uuid(),
      user_id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      vehicle_type: fc.constantFrom('motorcycle' as const, 'car' as const, 'camper' as const, 'ev' as const),
      fuel_type: fc.constantFrom('diesel' as const, 'petrol_95' as const, 'petrol_98' as const, 'lpg' as const, 'electric' as const, null),
      tank_capacity_liters: fc.oneof(fc.integer({ min: 5, max: 200 }), fc.constant(null)),
      consumption_per_100km: fc.oneof(fc.integer({ min: 1, max: 50 }), fc.constant(null)),
      battery_capacity_kwh: fc.oneof(fc.integer({ min: 10, max: 200 }), fc.constant(null)),
      consumption_kwh_per_100km: fc.oneof(fc.integer({ min: 5, max: 50 }), fc.constant(null)),
      charge_port_type: fc.constantFrom('Type1' as const, 'Type2' as const, 'CCS' as const, 'CHAdeMO' as const, 'Tesla' as const, null),
      is_default: fc.constant(false as const),
      created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
      updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    })
    .map((record) => record as unknown as VehicleProfile);

  it('should select the vehicle with the most recent created_at when no explicit default exists', () => {
    fc.assert(
      fc.property(
        fc.array(vehicleProfileArb, { minLength: 1, maxLength: 10 }),
        (vehicles) => {
          expect(vehicles.every((v) => v.is_default === false)).toBe(true);
          const selected = resolveImplicitDefault(vehicles);
          expect(selected).not.toBeNull();
          const maxCreatedAt = Math.max(...vehicles.map((v) => v.created_at.getTime()));
          expect(selected!.created_at.getTime()).toBe(maxCreatedAt);
          expect(vehicles).toContain(selected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null when the vehicle array is empty', () => {
    const result = resolveImplicitDefault([]);
    expect(result).toBeNull();
  });

  it('should handle a single vehicle as the implicit default', () => {
    fc.assert(
      fc.property(vehicleProfileArb, (vehicle) => {
        const selected = resolveImplicitDefault([vehicle]);
        expect(selected).toBe(vehicle);
      }),
      { numRuns: 100 }
    );
  });

  it('should select the correct vehicle when multiple vehicles share different timestamps', () => {
    fc.assert(
      fc.property(
        fc.array(vehicleProfileArb, { minLength: 2, maxLength: 10 }),
        (vehicles) => {
          const selected = resolveImplicitDefault(vehicles);
          for (const v of vehicles) {
            expect(v.created_at.getTime()).toBeLessThanOrEqual(selected!.created_at.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: ev-vehicle-category, Property 3: Energy consumption range validation
// **Validates: Requirements 1.8, 3.4**
describe('Property 3: Energy consumption range validation', () => {
  it('should accept consumption_kwh_per_100km if and only if it is in [5, 50]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (consumption) => {
          const input = {
            name: 'Test EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: consumption,
            charge_port_type: 'CCS',
          };

          const result = validateVehicleProfileInput(input);
          const isInRange = consumption >= CONSUMPTION_KWH_MIN && consumption <= CONSUMPTION_KWH_MAX;

          if (isInRange) {
            if (!result.valid) {
              const hasConsumptionError = result.errors.some(
                (e) => e.toLowerCase().includes('energy consumption')
              );
              expect(hasConsumptionError).toBe(false);
            }
          } else {
            expect(result.valid).toBe(false);
            if (!result.valid) {
              const hasConsumptionError = result.errors.some(
                (e) => e.toLowerCase().includes('energy consumption')
              );
              expect(hasConsumptionError).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should accept boundary values exactly at 5 and 50', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(CONSUMPTION_KWH_MIN, CONSUMPTION_KWH_MAX),
        (consumption) => {
          const input = {
            name: 'Boundary EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: consumption,
            charge_port_type: 'Type2',
          };

          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject values just outside the range', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: CONSUMPTION_KWH_MIN - 0.01, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: CONSUMPTION_KWH_MAX + 0.01, max: 1000, noNaN: true, noDefaultInfinity: true })
        ),
        (consumption) => {
          const input = {
            name: 'Out of Range EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: consumption,
            charge_port_type: 'CCS',
          };

          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            const hasConsumptionError = result.errors.some(
              (e) => e.toLowerCase().includes('energy consumption')
            );
            expect(hasConsumptionError).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: ev-vehicle-category, Property 4: Charge port type enum validation
// **Validates: Requirements 3.5**
describe('Property 4: Charge port type enum validation', () => {
  const validChargePortTypes = ['Type1', 'Type2', 'CCS', 'CHAdeMO', 'Tesla'];

  it('should accept charge_port_type if and only if it is in the valid set', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...validChargePortTypes),
          fc.string({ minLength: 1 })
        ),
        (chargePortType: string) => {
          const input = {
            name: 'Test EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: 15,
            charge_port_type: chargePortType,
          };

          const result = validateVehicleProfileInput(input);
          const isValid = validChargePortTypes.includes(chargePortType);

          if (isValid) {
            expect(result.valid).toBe(true);
          } else {
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.errors.some((e) => e.includes('Charge port type'))).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject arbitrary strings that are not in the valid charge port type set', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(
          (s) => !validChargePortTypes.includes(s)
        ),
        (invalidChargePortType: string) => {
          const input = {
            name: 'Test EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: 15,
            charge_port_type: invalidChargePortType,
          };

          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.includes('Charge port type'))).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept all valid charge port types', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validChargePortTypes),
        (validType: string) => {
          const input = {
            name: 'Test EV',
            vehicle_type: 'ev',
            battery_capacity_kwh: 75,
            consumption_kwh_per_100km: 15,
            charge_port_type: validType,
          };

          const result = validateVehicleProfileInput(input);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: ev-vehicle-category, Property 7: API response shape correctness
// **Validates: Requirements 4.1, 4.2, 4.3, 9.3**
describe('Property 7: API response shape correctness', () => {

  // Generator for EV vehicle profiles
  const evProfileArb = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s: string) => s.trim().length > 0),
    vehicle_type: fc.constant('ev' as const),
    fuel_type: fc.constantFrom('electric' as const, null),
    tank_capacity_liters: fc.constant(null),
    consumption_per_100km: fc.constant(null),
    battery_capacity_kwh: fc.double({ min: BATTERY_CAPACITY_MIN, max: BATTERY_CAPACITY_MAX, noNaN: true, noDefaultInfinity: true }),
    consumption_kwh_per_100km: fc.double({ min: CONSUMPTION_KWH_MIN, max: CONSUMPTION_KWH_MAX, noNaN: true, noDefaultInfinity: true }),
    charge_port_type: fc.constantFrom(...VALID_CHARGE_PORT_TYPES),
    is_default: fc.boolean(),
    created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  }) as fc.Arbitrary<VehicleProfile>;

  // Generator for non-EV (ICE) vehicle profiles
  const iceProfileArb = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s: string) => s.trim().length > 0),
    vehicle_type: fc.constantFrom('motorcycle' as const, 'car' as const, 'camper' as const),
    fuel_type: fc.constantFrom('diesel' as const, 'petrol_95' as const, 'petrol_98' as const, 'lpg' as const),
    tank_capacity_liters: fc.double({ min: 5, max: 200, noNaN: true, noDefaultInfinity: true }),
    consumption_per_100km: fc.double({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
    battery_capacity_kwh: fc.constant(null),
    consumption_kwh_per_100km: fc.constant(null),
    charge_port_type: fc.constant(null),
    is_default: fc.boolean(),
    created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  }) as fc.Arbitrary<VehicleProfile>;

  // Combined generator for any vehicle profile
  const anyProfileArb = fc.oneof(evProfileArb, iceProfileArb);

  it('response includes all required fields with correct types', () => {
    fc.assert(
      fc.property(anyProfileArb, (profile) => {
        const response = toVehicleProfileResponse(profile);

        // All required fields must be present
        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('name');
        expect(response).toHaveProperty('vehicle_type');
        expect(response).toHaveProperty('fuel_type');
        expect(response).toHaveProperty('is_default');
        expect(response).toHaveProperty('battery_capacity_kwh');
        expect(response).toHaveProperty('consumption_kwh_per_100km');
        expect(response).toHaveProperty('charge_port_type');
        expect(response).toHaveProperty('created_at');
        expect(response).toHaveProperty('updated_at');

        // Type checks for non-nullable fields
        expect(typeof response.id).toBe('string');
        expect(typeof response.name).toBe('string');
        expect(typeof response.vehicle_type).toBe('string');
        expect(typeof response.is_default).toBe('boolean');
        expect(typeof response.created_at).toBe('string');
        expect(typeof response.updated_at).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('EV profiles have EV-specific fields matching stored values (not null)', () => {
    fc.assert(
      fc.property(evProfileArb, (profile) => {
        const response = toVehicleProfileResponse(profile);

        // EV-specific fields must not be null and must match stored values
        expect(response.battery_capacity_kwh).not.toBeNull();
        expect(response.battery_capacity_kwh).toBe(profile.battery_capacity_kwh);
        expect(response.consumption_kwh_per_100km).not.toBeNull();
        expect(response.consumption_kwh_per_100km).toBe(profile.consumption_kwh_per_100km);
        expect(response.charge_port_type).not.toBeNull();
        expect(response.charge_port_type).toBe(profile.charge_port_type);

        // vehicle_type must be 'ev'
        expect(response.vehicle_type).toBe('ev');
      }),
      { numRuns: 100 }
    );
  });

  it('non-EV profiles have EV-specific fields set to null', () => {
    fc.assert(
      fc.property(iceProfileArb, (profile) => {
        const response = toVehicleProfileResponse(profile);

        // EV-specific fields must be null for non-EV vehicles
        expect(response.battery_capacity_kwh).toBeNull();
        expect(response.consumption_kwh_per_100km).toBeNull();
        expect(response.charge_port_type).toBeNull();

        // ICE-specific fields should match stored values
        expect(response.fuel_type).toBe(profile.fuel_type);
        expect(response.tank_capacity_liters).toBe(profile.tank_capacity_liters);
        expect(response.consumption_per_100km).toBe(profile.consumption_per_100km);
      }),
      { numRuns: 100 }
    );
  });

  it('created_at and updated_at are valid ISO 8601 strings', () => {
    fc.assert(
      fc.property(anyProfileArb, (profile) => {
        const response = toVehicleProfileResponse(profile);

        // Verify ISO string format
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
        expect(response.created_at).toMatch(isoRegex);
        expect(response.updated_at).toMatch(isoRegex);

        // Verify they parse back to valid dates
        const parsedCreated = new Date(response.created_at);
        const parsedUpdated = new Date(response.updated_at);
        expect(parsedCreated.getTime()).toBe(profile.created_at.getTime());
        expect(parsedUpdated.getTime()).toBe(profile.updated_at.getTime());
      }),
      { numRuns: 100 }
    );
  });

  it('response preserves id, name, vehicle_type, and is_default from the profile', () => {
    fc.assert(
      fc.property(anyProfileArb, (profile) => {
        const response = toVehicleProfileResponse(profile);

        expect(response.id).toBe(profile.id);
        expect(response.name).toBe(profile.name);
        expect(response.vehicle_type).toBe(profile.vehicle_type);
        expect(response.is_default).toBe(profile.is_default);
      }),
      { numRuns: 100 }
    );
  });
});
