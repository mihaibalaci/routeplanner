/**
 * @vitest-environment jsdom
 */
// Feature: ev-vehicle-category, Property 9: Detail panel conditional field display
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { VehicleDetailPanel } from './VehicleDetailPanel';
import type { VehicleProfileResponse } from '../../../src/models/vehicleProfile';
import {
  VALID_FUEL_TYPES,
  VALID_CHARGE_PORT_TYPES,
  VALID_VEHICLE_TYPES,
} from '../../../src/models/vehicleProfile';

// ─── Arbitraries ────────────────────────────────────────────────────────────

const iceVehicleTypes = VALID_VEHICLE_TYPES.filter((t) => t !== 'ev') as Array<
  'motorcycle' | 'car' | 'camper'
>;
const iceFuelTypes = VALID_FUEL_TYPES.filter((t) => t !== 'electric') as Array<
  'diesel' | 'petrol_95' | 'petrol_98' | 'lpg'
>;

/**
 * Generates a random EV VehicleProfileResponse.
 */
const evProfileArb: fc.Arbitrary<VehicleProfileResponse> = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  vehicle_type: fc.constant('ev' as const),
  fuel_type: fc.constant('electric' as const),
  tank_capacity_liters: fc.constant(null),
  consumption_per_100km: fc.constant(null),
  battery_capacity_kwh: fc.float({ min: 10, max: 200, noNaN: true }),
  consumption_kwh_per_100km: fc.float({ min: 5, max: 50, noNaN: true }),
  charge_port_type: fc.constantFrom(...VALID_CHARGE_PORT_TYPES),
  is_default: fc.boolean(),
  created_at: fc.date().map((d) => d.toISOString()),
  updated_at: fc.date().map((d) => d.toISOString()),
});

/**
 * Generates a random ICE (non-EV) VehicleProfileResponse.
 */
const iceProfileArb: fc.Arbitrary<VehicleProfileResponse> = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  vehicle_type: fc.constantFrom(...iceVehicleTypes),
  fuel_type: fc.constantFrom(...iceFuelTypes),
  tank_capacity_liters: fc.float({ min: 5, max: 200, noNaN: true }),
  consumption_per_100km: fc.float({ min: 1, max: 50, noNaN: true }),
  battery_capacity_kwh: fc.constant(null),
  consumption_kwh_per_100km: fc.constant(null),
  charge_port_type: fc.constant(null),
  is_default: fc.boolean(),
  created_at: fc.date().map((d) => d.toISOString()),
  updated_at: fc.date().map((d) => d.toISOString()),
});

/**
 * Generates any valid VehicleProfileResponse (EV or ICE).
 */
const vehicleProfileArb: fc.Arbitrary<VehicleProfileResponse> = fc.oneof(evProfileArb, iceProfileArb);

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('VehicleDetailPanel - Property 9: Detail panel conditional field display', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * For any EV vehicle profile, the detail panel SHALL display:
   * - battery_capacity_kwh
   * - consumption_kwh_per_100km
   * - charge_port_type
   * - estimated_range
   *
   * And SHALL NOT display ICE-specific fields.
   */
  it('displays EV-specific fields and hides ICE fields for EV vehicles', () => {
    fc.assert(
      fc.property(evProfileArb, (vehicle) => {
        container.innerHTML = '';
        const panel = new VehicleDetailPanel({ container, onClose: () => {} });
        panel.show(vehicle);

        // EV fields MUST be present
        const batteryField = container.querySelector('[data-field="battery_capacity_kwh"]');
        const consumptionKwhField = container.querySelector('[data-field="consumption_kwh_per_100km"]');
        const chargePortField = container.querySelector('[data-field="charge_port_type"]');
        const rangeField = container.querySelector('[data-field="estimated_range"]');

        expect(batteryField).not.toBeNull();
        expect(consumptionKwhField).not.toBeNull();
        expect(chargePortField).not.toBeNull();
        expect(rangeField).not.toBeNull();

        // ICE fields MUST NOT be present
        const fuelTypeField = container.querySelector('[data-field="fuel_type"]');
        const tankField = container.querySelector('[data-field="tank_capacity_liters"]');
        const consumptionField = container.querySelector('[data-field="consumption_per_100km"]');

        expect(fuelTypeField).toBeNull();
        expect(tankField).toBeNull();
        expect(consumptionField).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * For any non-EV vehicle profile, the detail panel SHALL display:
   * - fuel_type
   * - tank_capacity_liters
   * - consumption_per_100km
   *
   * And SHALL NOT display EV-specific fields.
   */
  it('displays ICE-specific fields and hides EV fields for non-EV vehicles', () => {
    fc.assert(
      fc.property(iceProfileArb, (vehicle) => {
        container.innerHTML = '';
        const panel = new VehicleDetailPanel({ container, onClose: () => {} });
        panel.show(vehicle);

        // ICE fields MUST be present
        const fuelTypeField = container.querySelector('[data-field="fuel_type"]');
        const tankField = container.querySelector('[data-field="tank_capacity_liters"]');
        const consumptionField = container.querySelector('[data-field="consumption_per_100km"]');

        expect(fuelTypeField).not.toBeNull();
        expect(tankField).not.toBeNull();
        expect(consumptionField).not.toBeNull();

        // EV fields MUST NOT be present
        const batteryField = container.querySelector('[data-field="battery_capacity_kwh"]');
        const consumptionKwhField = container.querySelector('[data-field="consumption_kwh_per_100km"]');
        const chargePortField = container.querySelector('[data-field="charge_port_type"]');
        const rangeField = container.querySelector('[data-field="estimated_range"]');

        expect(batteryField).toBeNull();
        expect(consumptionKwhField).toBeNull();
        expect(chargePortField).toBeNull();
        expect(rangeField).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * For any vehicle profile (EV or ICE), the correct field set is displayed
   * based on vehicle_type, and the opposite field set is never shown.
   */
  it('conditionally displays the correct field set for any vehicle type', () => {
    fc.assert(
      fc.property(vehicleProfileArb, (vehicle) => {
        container.innerHTML = '';
        const panel = new VehicleDetailPanel({ container, onClose: () => {} });
        panel.show(vehicle);

        const isEv = vehicle.vehicle_type === 'ev';

        // EV fields
        const batteryField = container.querySelector('[data-field="battery_capacity_kwh"]');
        const consumptionKwhField = container.querySelector('[data-field="consumption_kwh_per_100km"]');
        const chargePortField = container.querySelector('[data-field="charge_port_type"]');
        const rangeField = container.querySelector('[data-field="estimated_range"]');

        // ICE fields
        const fuelTypeField = container.querySelector('[data-field="fuel_type"]');
        const tankField = container.querySelector('[data-field="tank_capacity_liters"]');
        const consumptionField = container.querySelector('[data-field="consumption_per_100km"]');

        if (isEv) {
          // EV fields present
          expect(batteryField).not.toBeNull();
          expect(consumptionKwhField).not.toBeNull();
          expect(chargePortField).not.toBeNull();
          expect(rangeField).not.toBeNull();
          // ICE fields absent
          expect(fuelTypeField).toBeNull();
          expect(tankField).toBeNull();
          expect(consumptionField).toBeNull();
        } else {
          // ICE fields present
          expect(fuelTypeField).not.toBeNull();
          expect(tankField).not.toBeNull();
          expect(consumptionField).not.toBeNull();
          // EV fields absent
          expect(batteryField).toBeNull();
          expect(consumptionKwhField).toBeNull();
          expect(chargePortField).toBeNull();
          expect(rangeField).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });
});
