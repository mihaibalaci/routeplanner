/**
 * @vitest-environment jsdom
 */
// Feature: ev-vehicle-category, Property 8: Vehicle list rendering completeness
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { VehicleListComponent, VehicleProfileResponse } from './VehicleListComponent';

// **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
describe('Property 8: Vehicle list rendering completeness', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // Generator for a valid VehicleProfileResponse
  const vehicleTypeArb = fc.constantFrom(
    'motorcycle' as const,
    'car' as const,
    'camper' as const,
    'ev' as const
  );

  const vehicleProfileArb: fc.Arbitrary<VehicleProfileResponse> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    vehicle_type: vehicleTypeArb,
    fuel_type: fc.constantFrom('diesel', 'petrol_95', 'petrol_98', 'lpg', 'electric', null),
    tank_capacity_liters: fc.oneof(fc.double({ min: 5, max: 200, noNaN: true }), fc.constant(null)),
    consumption_per_100km: fc.oneof(fc.double({ min: 1, max: 50, noNaN: true }), fc.constant(null)),
    battery_capacity_kwh: fc.oneof(fc.double({ min: 10, max: 200, noNaN: true }), fc.constant(null)),
    consumption_kwh_per_100km: fc.oneof(fc.double({ min: 5, max: 50, noNaN: true }), fc.constant(null)),
    charge_port_type: fc.constantFrom('Type1', 'Type2', 'CCS', 'CHAdeMO', 'Tesla', null),
    is_default: fc.boolean(),
    created_at: fc.date().map((d) => d.toISOString()),
    updated_at: fc.date().map((d) => d.toISOString()),
  });

  const profilesArb = fc.array(vehicleProfileArb, { minLength: 1, maxLength: 10 });

  it('renders exactly as many cards as there are profiles', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        container.innerHTML = '';
        const component = new VehicleListComponent({
          container,
          onSelect: () => {},
        });
        component.setProfiles(profiles);

        const cards = container.querySelectorAll('.vehicle-list__card');
        expect(cards.length).toBe(profiles.length);

        component.destroy();
      }),
      { numRuns: 100 }
    );
  });

  it('each card contains the vehicle name text', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        container.innerHTML = '';
        const component = new VehicleListComponent({
          container,
          onSelect: () => {},
        });
        component.setProfiles(profiles);

        const cards = container.querySelectorAll('.vehicle-list__card');
        profiles.forEach((profile, index) => {
          const card = cards[index];
          const nameEl = card.querySelector('.vehicle-list__vehicle-name');
          expect(nameEl).not.toBeNull();
          expect(nameEl!.textContent).toBe(profile.name);
        });

        component.destroy();
      }),
      { numRuns: 100 }
    );
  });

  it('each card has a type badge matching its vehicle_type', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        container.innerHTML = '';
        const component = new VehicleListComponent({
          container,
          onSelect: () => {},
        });
        component.setProfiles(profiles);

        const cards = container.querySelectorAll('.vehicle-list__card');
        profiles.forEach((profile, index) => {
          const card = cards[index];
          const badge = card.querySelector(
            `.vehicle-list__type-badge--${profile.vehicle_type}`
          );
          expect(badge).not.toBeNull();
        });

        component.destroy();
      }),
      { numRuns: 100 }
    );
  });

  it('default indicator (star) appears if and only if is_default is true', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        container.innerHTML = '';
        const component = new VehicleListComponent({
          container,
          onSelect: () => {},
        });
        component.setProfiles(profiles);

        const cards = container.querySelectorAll('.vehicle-list__card');
        profiles.forEach((profile, index) => {
          const card = cards[index];
          const defaultBadge = card.querySelector('.vehicle-list__default-badge');
          if (profile.is_default) {
            expect(defaultBadge).not.toBeNull();
          } else {
            expect(defaultBadge).toBeNull();
          }
        });

        component.destroy();
      }),
      { numRuns: 100 }
    );
  });
});
