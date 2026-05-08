// Feature: ev-vehicle-category, Property 10: EV range calculation correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateEstimatedRange } from './evCalculations';

describe('Property 10: EV range calculation correctness', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any EV vehicle profile with battery_capacity_kwh > 0 and
   * consumption_kwh_per_100km > 0, the estimated range displayed SHALL equal
   * (battery_capacity_kwh / consumption_kwh_per_100km) * 100 (in km),
   * rounded to one decimal place.
   */
  it('calculateEstimatedRange equals ((battery / consumption) * 100).toFixed(1) for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 5, max: 50, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacityKwh, consumptionKwhPer100km) => {
          const result = calculateEstimatedRange(batteryCapacityKwh, consumptionKwhPer100km);
          const expected = ((batteryCapacityKwh / consumptionKwhPer100km) * 100).toFixed(1);
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "0.0" when consumption is zero or negative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacityKwh, consumptionKwhPer100km) => {
          const result = calculateEstimatedRange(batteryCapacityKwh, consumptionKwhPer100km);
          expect(result).toBe('0.0');
        }
      ),
      { numRuns: 100 }
    );
  });
});
