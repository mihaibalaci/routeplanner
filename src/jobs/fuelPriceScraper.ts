import { scrapeFuelPrices } from '../services/fuelPriceService';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the fuel price scraping background job.
 * Runs an initial scrape immediately, then schedules every 6 hours.
 */
export function startFuelPriceJob(): void {
  if (intervalId !== null) {
    console.warn('[FuelPriceJob] Job already running, skipping start.');
    return;
  }

  console.info('[FuelPriceJob] Starting fuel price scraping job (every 6 hours)');

  // Run initial scrape
  scrapeFuelPrices().catch((err) => {
    console.error('[FuelPriceJob] Initial scrape failed:', (err as Error).message);
  });

  // Schedule recurring scrape every 6 hours
  intervalId = setInterval(() => {
    console.info('[FuelPriceJob] Running scheduled fuel price scrape');
    scrapeFuelPrices().catch((err) => {
      console.error('[FuelPriceJob] Scheduled scrape failed:', (err as Error).message);
    });
  }, SIX_HOURS_MS);
}

/**
 * Stop the fuel price scraping background job.
 */
export function stopFuelPriceJob(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.info('[FuelPriceJob] Fuel price scraping job stopped');
  }
}

/**
 * Check if the fuel price job is currently running.
 */
export function isFuelPriceJobRunning(): boolean {
  return intervalId !== null;
}
