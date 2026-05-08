import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startVignettePriceJob,
  stopVignettePriceJob,
  isVignettePriceJobRunning,
} from './vignettePriceScraper';

// Mock the vignette scraper service
vi.mock('../services/vignetteScraperService', () => ({
  scrapeVignettePrices: vi.fn().mockResolvedValue(undefined),
}));

import { scrapeVignettePrices } from '../services/vignetteScraperService';

const mockScrapeVignettePrices = vi.mocked(scrapeVignettePrices);

describe('VignettePriceScraper Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure job is stopped before each test
    stopVignettePriceJob();
  });

  afterEach(() => {
    stopVignettePriceJob();
    vi.useRealTimers();
  });

  it('should run initial scrape on start', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startVignettePriceJob();

    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(1);
    expect(isVignettePriceJobRunning()).toBe(true);

    infoSpy.mockRestore();
  });

  it('should run scrape every 24 hours', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startVignettePriceJob();

    // Initial call
    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(1);

    // Advance 24 hours
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(2);

    // Advance another 24 hours
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(3);

    infoSpy.mockRestore();
  });

  it('should stop the job when stopVignettePriceJob is called', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startVignettePriceJob();
    expect(isVignettePriceJobRunning()).toBe(true);

    stopVignettePriceJob();
    expect(isVignettePriceJobRunning()).toBe(false);

    // Advance time — should not trigger another scrape
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(1); // Only initial

    infoSpy.mockRestore();
  });

  it('should not start a second job if already running', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    startVignettePriceJob();
    startVignettePriceJob(); // Second call should be ignored

    expect(mockScrapeVignettePrices).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('already running')
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('should handle scrape errors gracefully', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    mockScrapeVignettePrices.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    expect(() => startVignettePriceJob()).not.toThrow();

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
