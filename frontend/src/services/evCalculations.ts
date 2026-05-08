/**
 * EV Calculations — pure utility functions for Electric Vehicle computations.
 *
 * Provides range estimation based on battery capacity and energy consumption.
 */

/**
 * Calculate estimated range for an EV vehicle.
 * Formula: (batteryCapacityKwh / consumptionKwhPer100km) * 100
 * Result is rounded to 1 decimal place.
 *
 * Returns "0.0" if consumption is zero or negative (division guard).
 */
export function calculateEstimatedRange(
  batteryCapacityKwh: number,
  consumptionKwhPer100km: number
): string {
  if (consumptionKwhPer100km <= 0) {
    return '0.0';
  }
  const range = (batteryCapacityKwh / consumptionKwhPer100km) * 100;
  return range.toFixed(1);
}
