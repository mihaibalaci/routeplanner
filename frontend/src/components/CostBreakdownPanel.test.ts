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
  roadCosts: {
    vignettes: [
      {
        countryCode: 'AT',
        countryName: 'Austria',
        duration: '10-day',
        cost: 40.0,
        availableDurations: ['10-day', '1-month', '1-year'],
      },
    ],
    bridgeTolls: [],
    highwayTolls: [],
    totalRoadCostsEur: 40.0,
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

  // ─── Requirements 5.1–5.7: Road Costs rendering ──────────────────────────────

  describe('Road Costs rendering', () => {
    const mockCostDataWithRoadCosts: CostBreakdownData = {
      totalCostEur: 195.8,
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
      roadCosts: {
        vignettes: [
          {
            countryCode: 'AT',
            countryName: 'Austria',
            duration: '10-day',
            cost: 9.9,
            availableDurations: ['10-day', '1-month', '1-year'],
          },
          {
            countryCode: 'CH',
            countryName: 'Switzerland',
            duration: '1-year',
            cost: 40.0,
            availableDurations: ['1-year'],
          },
        ],
        bridgeTolls: [
          { name: 'Øresund Bridge', cost: 52.0 },
          { name: 'Great Belt Bridge', cost: 8.4 },
        ],
        highwayTolls: [
          { segment: 'A1 Milano-Napoli', cost: 18.5 },
          { segment: 'A4 Torino-Trieste', cost: 12.0 },
        ],
        totalRoadCostsEur: 140.8,
      },
      vehicleProfile: {
        id: 'v1',
        name: 'My Car',
        fuelType: 'diesel',
        consumptionPer100km: 6.5,
      },
    };

    async function loadPanelWithData(data: CostBreakdownData) {
      vi.mocked(apiClient.get).mockResolvedValue({ data, status: 200 });

      panel = new CostBreakdownPanel({ container });

      panel.setVehicleProfiles([
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
      ]);
      const select = container.querySelector('select') as HTMLSelectElement;
      if (select) {
        select.value = 'v1';
        select.dispatchEvent(new Event('change'));
      }

      panel.setRouteCalculating();
      panel.setRouteResult('route-road-costs');

      await vi.waitFor(() => {
        expect(panel.getState()).toBe('loaded');
      });
    }

    it('renders "Road Costs" subsection below fuel section', async () => {
      await loadPanelWithData(mockCostDataWithRoadCosts);

      const fuelSection = container.querySelector('.cost-breakdown-panel__fuel-section');
      const roadCostsSection = container.querySelector('.cost-breakdown-panel__road-costs-section');

      expect(fuelSection).not.toBeNull();
      expect(roadCostsSection).not.toBeNull();

      // Road costs section should come after fuel section in DOM order
      const details = container.querySelector('.cost-breakdown-panel__details');
      const sections = details!.querySelectorAll('.cost-breakdown-panel__section');
      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].classList.contains('cost-breakdown-panel__fuel-section')).toBe(true);
      expect(sections[1].classList.contains('cost-breakdown-panel__road-costs-section')).toBe(true);
    });

    it('displays vignettes with country name, duration, and cost', async () => {
      await loadPanelWithData(mockCostDataWithRoadCosts);

      const vignetteRows = container.querySelectorAll('.cost-breakdown-panel__vignette-row');
      expect(vignetteRows.length).toBe(2);

      // First vignette: Austria, 10-day, €9.90
      const firstRow = vignetteRows[0];
      expect(firstRow.querySelector('.cost-breakdown-panel__country-name')!.textContent).toBe('Austria');
      const firstSelect = firstRow.querySelector('.cost-breakdown-panel__duration-select') as HTMLSelectElement;
      expect(firstSelect.value).toBe('10-day');
      expect(firstRow.querySelector('.cost-breakdown-panel__cost')!.textContent).toBe('€9.90');

      // Second vignette: Switzerland, 1-year, €40.00
      const secondRow = vignetteRows[1];
      expect(secondRow.querySelector('.cost-breakdown-panel__country-name')!.textContent).toBe('Switzerland');
      const secondSelect = secondRow.querySelector('.cost-breakdown-panel__duration-select') as HTMLSelectElement;
      expect(secondSelect.value).toBe('1-year');
      expect(secondRow.querySelector('.cost-breakdown-panel__cost')!.textContent).toBe('€40.00');
    });

    it('hides bridge tolls group when bridgeTolls array is empty', async () => {
      const dataWithNoBridgeTolls: CostBreakdownData = {
        ...mockCostDataWithRoadCosts,
        roadCosts: {
          ...mockCostDataWithRoadCosts.roadCosts,
          bridgeTolls: [],
          totalRoadCostsEur: 80.4,
        },
      };

      await loadPanelWithData(dataWithNoBridgeTolls);

      const bridgeTollsGroup = container.querySelector('.cost-breakdown-panel__bridge-tolls-group');
      expect(bridgeTollsGroup).toBeNull();
    });

    it('hides highway tolls group when highwayTolls array is empty', async () => {
      const dataWithNoHighwayTolls: CostBreakdownData = {
        ...mockCostDataWithRoadCosts,
        roadCosts: {
          ...mockCostDataWithRoadCosts.roadCosts,
          highwayTolls: [],
          totalRoadCostsEur: 110.3,
        },
      };

      await loadPanelWithData(dataWithNoHighwayTolls);

      const highwayTollsGroup = container.querySelector('.cost-breakdown-panel__highway-tolls-group');
      expect(highwayTollsGroup).toBeNull();
    });

    it('displays road costs subtotal as correct sum', async () => {
      await loadPanelWithData(mockCostDataWithRoadCosts);

      const subtotalValue = container.querySelector('.cost-breakdown-panel__subtotal-value');
      expect(subtotalValue).not.toBeNull();
      // 9.9 + 40.0 + 52.0 + 8.4 + 18.5 + 12.0 = 140.80
      expect(subtotalValue!.textContent).toBe('€140.80');
    });

    it('triggers re-fetch when duration dropdown is changed', async () => {
      await loadPanelWithData(mockCostDataWithRoadCosts);

      const callCountAfterLoad = vi.mocked(apiClient.get).mock.calls.length;

      // Change the Austria vignette duration dropdown
      const durationSelect = container.querySelector(
        '.cost-breakdown-panel__duration-select[data-country-code="AT"]'
      ) as HTMLSelectElement;
      expect(durationSelect).not.toBeNull();

      durationSelect.value = '1-month';
      durationSelect.dispatchEvent(new Event('change'));

      // Should have triggered a new API call
      await vi.waitFor(() => {
        expect(vi.mocked(apiClient.get).mock.calls.length).toBeGreaterThan(callCountAfterLoad);
      });

      // Verify the request includes duration overrides
      const lastCall = vi.mocked(apiClient.get).mock.calls[vi.mocked(apiClient.get).mock.calls.length - 1];
      const params = lastCall[1] as Record<string, string>;
      expect(params.durations).toContain('AT');
      expect(params.durations).toContain('1-month');
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
