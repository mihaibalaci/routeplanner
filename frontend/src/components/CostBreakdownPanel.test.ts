/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CostBreakdownData } from '../services/costCalculations';

// Mock the apiClient module
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    isAuthenticated: vi.fn(() => true),
  },
}));

import { apiClient } from '../api/client';
import { CostBreakdownPanel } from './CostBreakdownPanel';

const mockCostData: CostBreakdownData = {
  totalCostEur: 125.5,
  isPartialEstimate: false,
  fuel: {
    totalFuelCostEur: 85.5,
    breakdown: [
      {
        countryCode: 'DE',
        countryName: 'Germany',
        distanceKm: 450,
        fuelPricePerLiter: 1.65,
        fuelCostEur: 48.26,
      },
      {
        countryCode: 'AT',
        countryName: 'Austria',
        distanceKm: 300,
        fuelPricePerLiter: 1.72,
        fuelCostEur: 37.24,
      },
    ],
  },
  vignettes: {
    totalVignetteCostEur: 40.0,
    breakdown: [
      {
        countryCode: 'AT',
        countryName: 'Austria',
        required: true,
        motorcycleExempt: false,
        selectedDuration: '10-day',
        availableDurations: ['10-day', '1-month', '1-year'],
        priceEur: 40.0,
        priceUnavailable: false,
      },
    ],
  },
  vehicleProfile: {
    id: 'v1',
    name: 'My Car',
    fuelType: 'diesel',
    consumptionPer100km: 6.5,
  },
};

function createMockCostData(overrides?: Partial<CostBreakdownData>): CostBreakdownData {
  return { ...mockCostData, ...overrides };
}

describe('CostBreakdownPanel state transitions', () => {
  let container: HTMLElement;
  let panel: CostBreakdownPanel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
    vi.mocked(apiClient.get).mockReset();
  });

  afterEach(() => {
    if (panel) {
      panel.destroy();
    }
    document.body.removeChild(container);
  });

  // ─── Requirement 1.1, 1.2, 1.3: empty → loading → loaded flow ──────────────

  describe('empty → loading → loaded flow', () => {
    it('starts in empty state, transitions to loading, then to loaded on successful fetch', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: createMockCostData(),
        status: 200,
      });

      panel = new CostBreakdownPanel({ container });

      // Initial state is empty
      expect(panel.getState()).toBe('empty');

      // Simulate vehicle selection first (needed for fetch to trigger)
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);

      // Simulate selecting a vehicle by triggering the internal handler
      // We need to select a vehicle via the DOM
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // Transition to loading when route calculation starts
      panel.setRouteCalculating();
      expect(panel.getState()).toBe('loading');

      // Route result triggers fetch
      panel.setRouteResult('route-123');

      // Wait for the async fetch to complete
      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });

      expect(panel.getCostData()).toEqual(createMockCostData());
      expect(panel.getRetryCount()).toBe(0);
    });
  });

  // ─── Requirement 1.2, 1.3, 7.1: empty → loading → error flow ───────────────

  describe('empty → loading → error flow', () => {
    it('starts in empty state, transitions to loading, then to error on API failure', async () => {
      vi.mocked(apiClient.get).mockRejectedValue({
        status: 500,
        message: 'Internal server error',
      });

      panel = new CostBreakdownPanel({ container });

      expect(panel.getState()).toBe('empty');

      // Select a vehicle via profiles + DOM interaction
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // Transition to loading
      panel.setRouteCalculating();
      expect(panel.getState()).toBe('loading');

      // Route result triggers fetch which will fail
      panel.setRouteResult('route-456');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });

      expect(panel.getErrorMessage()).toBe('Internal server error');
    });
  });

  // ─── Requirement 1.4: loaded → loading (new route) → loaded flow ────────────

  describe('loaded → loading (new route) → loaded flow', () => {
    it('transitions from loaded to loading on new route, then back to loaded', async () => {
      const firstData = createMockCostData({ totalCostEur: 100 });
      const secondData = createMockCostData({ totalCostEur: 200 });

      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: firstData, status: 200 })
        .mockResolvedValueOnce({ data: secondData, status: 200 });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // First route calculation
      panel.setRouteCalculating();
      panel.setRouteResult('route-1');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });
      expect(panel.getCostData()?.totalCostEur).toBe(100);

      // New route calculation starts — should go back to loading
      panel.setRouteCalculating();
      expect(panel.getState()).toBe('loading');

      // New route result
      panel.setRouteResult('route-2');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });
      expect(panel.getCostData()?.totalCostEur).toBe(200);
    });
  });

  // ─── Requirement 7.1: error → loading (retry) → loaded flow ─────────────────

  describe('error → loading (retry) → loaded flow', () => {
    it('transitions from error to loading on retry, then to loaded on success', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce({ status: 500, message: 'Server error' })
        .mockResolvedValueOnce({ data: createMockCostData(), status: 200 });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // First attempt fails
      panel.setRouteCalculating();
      panel.setRouteResult('route-err');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });

      // Click retry button
      const retryBtn = container.querySelector('.cost-breakdown-panel__retry-btn') as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();
      retryBtn.click();

      // Should transition to loading then loaded
      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });

      expect(panel.getCostData()).toEqual(createMockCostData());
      expect(panel.getRetryCount()).toBe(0); // Reset on success
    });
  });

  // ─── Requirement 7.1: retry count maxes at 3 ───────────────────────────────

  describe('retry count maxes at 3', () => {
    it('allows 3 retries then disables the retry button', async () => {
      vi.mocked(apiClient.get).mockRejectedValue({
        status: 500,
        message: 'Server error',
      });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // Initial fetch fails
      panel.setRouteCalculating();
      panel.setRouteResult('route-retry');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });
      expect(panel.getRetryCount()).toBe(0);

      // Retry 1
      let retryBtn = container.querySelector('.cost-breakdown-panel__retry-btn') as HTMLButtonElement;
      retryBtn.click();
      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });
      expect(panel.getRetryCount()).toBe(1);

      // Retry 2
      retryBtn = container.querySelector('.cost-breakdown-panel__retry-btn') as HTMLButtonElement;
      retryBtn.click();
      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });
      expect(panel.getRetryCount()).toBe(2);

      // Retry 3
      retryBtn = container.querySelector('.cost-breakdown-panel__retry-btn') as HTMLButtonElement;
      retryBtn.click();
      await vi.waitFor(() => {
        expect(panel.getState()).toBe('error');
      });
      expect(panel.getRetryCount()).toBe(3);

      // 4th retry should be blocked — button should be disabled
      retryBtn = container.querySelector('.cost-breakdown-panel__retry-btn') as HTMLButtonElement;
      expect(retryBtn.disabled).toBe(true);

      // Clicking disabled button should not change retry count
      retryBtn.click();
      // Wait a tick to ensure nothing changes
      await new Promise((r) => setTimeout(r, 50));
      expect(panel.getRetryCount()).toBe(3);
    });
  });

  // ─── Requirement 6.1, 6.4: collapse/expand toggle preserves data ────────────

  describe('collapse/expand toggle preserves data', () => {
    it('preserves cost data when toggling between collapsed and expanded states', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: createMockCostData(),
        status: 200,
      });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // Load data
      panel.setRouteCalculating();
      panel.setRouteResult('route-toggle');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });

      // Initially expanded
      expect(panel.isCollapsed()).toBe(false);
      const dataBeforeCollapse = panel.getCostData();

      // Collapse
      const toggleBtn = container.querySelector('.cost-breakdown-panel__toggle') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
      toggleBtn.click();

      expect(panel.isCollapsed()).toBe(true);
      expect(panel.getCostData()).toEqual(dataBeforeCollapse);
      expect(panel.getState()).toBe('loaded');

      // Expand again
      const toggleBtnAfter = container.querySelector('.cost-breakdown-panel__toggle') as HTMLButtonElement;
      toggleBtnAfter.click();

      expect(panel.isCollapsed()).toBe(false);
      expect(panel.getCostData()).toEqual(dataBeforeCollapse);
      expect(panel.getState()).toBe('loaded');
    });

    it('does not trigger a new API request when expanding from collapsed state', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: createMockCostData(),
        status: 200,
      });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      panel.setRouteCalculating();
      panel.setRouteResult('route-no-refetch');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });

      const callCountAfterLoad = vi.mocked(apiClient.get).mock.calls.length;

      // Collapse then expand
      const toggleBtn = container.querySelector('.cost-breakdown-panel__toggle') as HTMLButtonElement;
      toggleBtn.click(); // collapse
      const toggleBtn2 = container.querySelector('.cost-breakdown-panel__toggle') as HTMLButtonElement;
      toggleBtn2.click(); // expand

      // No additional API calls should have been made
      expect(vi.mocked(apiClient.get).mock.calls.length).toBe(callCountAfterLoad);
    });
  });

  // ─── Requirement 1.5: route failed reverts to empty ─────────────────────────

  describe('route failed reverts to empty', () => {
    it('transitions to empty state when route calculation fails', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: createMockCostData(),
        status: 200,
      });

      panel = new CostBreakdownPanel({ container });

      // Set up vehicle
      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      // Load data first
      panel.setRouteCalculating();
      panel.setRouteResult('route-will-fail');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });

      // Route fails — should revert to empty
      panel.setRouteFailed();
      expect(panel.getState()).toBe('empty');
      expect(panel.getCostData()).toBeNull();
    });
  });
});
