import { scrapeVignettePrices } from '../services/vignetteScraperService';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the vignette price scraping background job.
 * Runs an initial scrape immediately, then schedules every 24 hours.
 */
export function startVignettePriceJob(): void {
  if (intervalId !== null) {
    console.warn('[VignettePriceJob] Job already running, skipping start.');
    return;
  }

  console.info('[VignettePriceJob] Starting vignette price scraping job (every 24 hours)');

  // Run initial scrape
  scrapeVignettePrices().catch((err) => {
    console.error('[VignettePriceJob] Initial scrape failed:', (err as Error).message);
  });

  // Schedule recurring scrape every 24 hours
  intervalId = setInterval(() => {
    console.info('[VignettePriceJob] Running scheduled vignette price scrape');
    scrapeVignettePrices().catch((err) => {
      console.error('[VignettePriceJob] Scheduled scrape failed:', (err as Error).message);
    });
  }, TWENTY_FOUR_HOURS_MS);
}

/**
 * Stop the vignette price scraping background job.
 */
export function stopVignettePriceJob(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.info('[VignettePriceJob] Vignette price scraping job stopped');
  }
}

/**
 * Check if the vignette price job is currently running.
 */
export function isVignettePriceJobRunning(): boolean {
  return intervalId !== null;
}
