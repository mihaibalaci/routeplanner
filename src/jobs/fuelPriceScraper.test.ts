import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startFuelPriceJob, stopFuelPriceJob, isFuelPriceJobRunning } from './fuelPriceScraper';

// Mock the fuel price service
vi.mock('../services/fuelPriceService', () => ({
  scrapeFuelPrices: vi.fn().mockResolvedValue(undefined),
}));

import { scrapeFuelPrices } from '../services/fuelPriceService';

const mockScrapeFuelPrices = vi.mocked(scrapeFuelPrices);

describe('FuelPriceScraper Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure job is stopped before each test
    stopFuelPriceJob();
  });

  afterEach(() => {
    stopFuelPriceJob();
    vi.useRealTimers();
  });

  it('should run initial scrape on start', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startFuelPriceJob();

    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(1);
    expect(isFuelPriceJobRunning()).toBe(true);

    infoSpy.mockRestore();
  });

  it('should run scrape every 6 hours', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startFuelPriceJob();

    // Initial call
    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(1);

    // Advance 6 hours
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(2);

    // Advance another 6 hours
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(3);

    infoSpy.mockRestore();
  });

  it('should stop the job when stopFuelPriceJob is called', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startFuelPriceJob();
    expect(isFuelPriceJobRunning()).toBe(true);

    stopFuelPriceJob();
    expect(isFuelPriceJobRunning()).toBe(false);

    // Advance time — should not trigger another scrape
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(1); // Only initial

    infoSpy.mockRestore();
  });

  it('should not start a second job if already running', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startFuelPriceJob();
    startFuelPriceJob(); // Second call should be ignored

    expect(mockScrapeFuelPrices).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('already running')
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('should handle scrape errors gracefully', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    mockScrapeFuelPrices.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    expect(() => startFuelPriceJob()).not.toThrow();

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
