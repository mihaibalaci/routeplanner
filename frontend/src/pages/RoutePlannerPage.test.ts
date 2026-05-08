/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock mapService — prevent actual Google Maps loading
vi.mock('../services/mapService', () => ({
  loadGoogleMaps: vi.fn().mockRejectedValue(new Error('Maps not available in test')),
  isMapsAvailable: vi.fn().mockReturnValue(false),
  createMap: vi.fn().mockReturnValue(null),
}));

// Mock apiClient
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    isAuthenticated: vi.fn(() => true),
  },
}));

// Mock CostBreakdownPanel class to verify method calls
const mockSetRouteCalculating = vi.fn();
const mockSetRouteResult = vi.fn();
const mockSetRouteFailed = vi.fn();
const mockSetVehicleProfiles = vi.fn();
const mockDestroy = vi.fn();
const mockRender = vi.fn();

vi.mock('../components/CostBreakdownPanel', () => ({
  CostBreakdownPanel: vi.fn().mockImplementation(() => ({
    setRouteCalculating: mockSetRouteCalculating,
    setRouteResult: mockSetRouteResult,
    setRouteFailed: mockSetRouteFailed,
    setVehicleProfiles: mockSetVehicleProfiles,
    destroy: mockDestroy,
    render: mockRender,
  })),
}));

// Mock VehicleListComponent
const mockVehicleListSetProfiles = vi.fn();
const mockVehicleListGetSelectedId = vi.fn().mockReturnValue(null);
const mockVehicleListDestroy = vi.fn();
const mockVehicleListRender = vi.fn();

vi.mock('../components/VehicleListComponent', () => ({
  VehicleListComponent: vi.fn().mockImplementation(() => ({
    setProfiles: mockVehicleListSetProfiles,
    getSelectedId: mockVehicleListGetSelectedId,
    destroy: mockVehicleListDestroy,
    render: mockVehicleListRender,
  })),
}));

// Mock VehicleDetailPanel
const mockVehicleDetailShow = vi.fn();
const mockVehicleDetailHide = vi.fn();

vi.mock('../components/VehicleDetailPanel', () => ({
  VehicleDetailPanel: vi.fn().mockImplementation(() => ({
    show: mockVehicleDetailShow,
    hide: mockVehicleDetailHide,
  })),
}));

// Mock ChargingStationLayer
const mockChargingStationShow = vi.fn();
const mockChargingStationHide = vi.fn();
const mockChargingStationDestroy = vi.fn();

vi.mock('../components/ChargingStationLayer', () => ({
  ChargingStationLayer: vi.fn().mockImplementation(() => ({
    show: mockChargingStationShow,
    hide: mockChargingStationHide,
    destroy: mockChargingStationDestroy,
  })),
}));

import { apiClient } from '../api/client';
import { isMapsAvailable } from '../services/mapService';
import { CostBreakdownPanel } from '../components/CostBreakdownPanel';
import { RoutePlannerPage } from './RoutePlannerPage';

describe('RoutePlannerPage integration with CostBreakdownPanel', () => {
  let container: HTMLElement;
  let page: RoutePlannerPage;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock window.matchMedia for responsive layout
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(isMapsAvailable).mockReturnValue(false);

    // Reset mock function call history
    mockSetRouteCalculating.mockClear();
    mockSetRouteResult.mockClear();
    mockSetRouteFailed.mockClear();
    mockSetVehicleProfiles.mockClear();
    mockDestroy.mockClear();
    mockRender.mockClear();
    vi.mocked(CostBreakdownPanel).mockClear();
    mockVehicleListSetProfiles.mockClear();
    mockVehicleListGetSelectedId.mockClear();
    mockVehicleListGetSelectedId.mockReturnValue(null);
    mockVehicleListDestroy.mockClear();
    mockVehicleListRender.mockClear();
    mockVehicleDetailShow.mockClear();
    mockVehicleDetailHide.mockClear();
    mockChargingStationShow.mockClear();
    mockChargingStationHide.mockClear();
    mockChargingStationDestroy.mockClear();
  });

  afterEach(() => {
    document.body.removeChild(container);
    delete (window as any).google;
  });

  // ─── Requirement 1.1: Panel container exists after render ───────────────────

  describe('panel container rendering', () => {
    it('renders a #cost-breakdown-container element in the DOM after render()', () => {
      page = new RoutePlannerPage(container);
      page.render();

      const panelContainer = container.querySelector('#cost-breakdown-container');
      expect(panelContainer).not.toBeNull();
      expect(panelContainer).toBeInstanceOf(HTMLElement);
    });

    it('instantiates CostBreakdownPanel with the correct container element', () => {
      page = new RoutePlannerPage(container);
      page.render();

      expect(CostBreakdownPanel).toHaveBeenCalledTimes(1);

      const constructorCall = vi.mocked(CostBreakdownPanel).mock.calls[0][0];
      const panelContainer = container.querySelector('#cost-breakdown-container') as HTMLElement;
      expect(constructorCall.container).toBe(panelContainer);
    });
  });

  // ─── Requirement 2.1: Vehicle profiles loaded on page init ──────────────────

  describe('vehicle profiles loading on init', () => {
    it('fetches vehicle profiles and passes them to the panel when authenticated', async () => {
      const mockProfiles = [
        { id: 'v1', name: 'My Car', vehicle_type: 'car', fuel_type: 'diesel', tank_capacity_liters: 50, consumption_per_100km: 6.5 },
        { id: 'v2', name: 'My Bike', vehicle_type: 'motorcycle', fuel_type: 'petrol', tank_capacity_liters: 15, consumption_per_100km: 4.0 },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: mockProfiles },
        status: 200,
      });

      page = new RoutePlannerPage(container);
      page.render();

      // Wait for the async loadVehicleProfiles to complete
      await vi.waitFor(() => {
        expect(mockSetVehicleProfiles).toHaveBeenCalledTimes(1);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/vehicles');
      expect(mockSetVehicleProfiles).toHaveBeenCalledWith(mockProfiles);
    });

    it('does not fetch vehicle profiles when user is not authenticated', async () => {
      vi.mocked(apiClient.isAuthenticated).mockReturnValue(false);

      page = new RoutePlannerPage(container);
      page.render();

      // Give time for any async operations to settle
      await new Promise((r) => setTimeout(r, 50));

      // Should not have called GET /vehicles
      expect(apiClient.get).not.toHaveBeenCalled();
      expect(mockSetVehicleProfiles).not.toHaveBeenCalled();
    });

    it('handles vehicle profiles fetch failure gracefully without crashing', async () => {
      vi.mocked(apiClient.get).mockRejectedValue({
        status: 500,
        message: 'Server error',
      });

      page = new RoutePlannerPage(container);
      page.render();

      // Wait for the async operation to settle
      await new Promise((r) => setTimeout(r, 50));

      // Panel should still be instantiated, no crash
      expect(CostBreakdownPanel).toHaveBeenCalledTimes(1);
      // setVehicleProfiles should NOT have been called since the fetch failed
      expect(mockSetVehicleProfiles).not.toHaveBeenCalled();
    });
  });

  // ─── Requirement 1.1: Panel lifecycle methods on route events ───────────────

  describe('panel lifecycle methods on route calculation events', () => {
    it('calls setRouteCalculating on the panel when route calculation starts', () => {
      vi.mocked(isMapsAvailable).mockReturnValue(true);

      // Mock Google Maps on window so calculateRoute proceeds past the check
      (window as any).google = {
        maps: {
          DirectionsService: vi.fn().mockImplementation(() => ({
            route: vi.fn(), // Don't call callback — we just want to verify setRouteCalculating
          })),
          DirectionsRenderer: vi.fn().mockImplementation(() => ({
            setDirections: vi.fn(),
          })),
          TravelMode: { DRIVING: 'DRIVING' },
          places: {
            Autocomplete: vi.fn(),
          },
        },
      };

      page = new RoutePlannerPage(container);
      page.render();

      // Set up origin and destination inputs
      const originInput = container.querySelector('#origin-input') as HTMLInputElement;
      const destInput = container.querySelector('#dest-input') as HTMLInputElement;
      originInput.value = 'Berlin';
      destInput.value = 'Munich';

      // Click calculate button
      const calcBtn = container.querySelector('#btn-calculate') as HTMLButtonElement;
      calcBtn.click();

      // setRouteCalculating should be called at the start of calculateRoute
      expect(mockSetRouteCalculating).toHaveBeenCalled();
    });

    it('calls setRouteFailed on the panel when route calculation encounters an error', async () => {
      vi.mocked(isMapsAvailable).mockReturnValue(true);

      // Mock google maps DirectionsService to return a non-OK status
      (window as any).google = {
        maps: {
          DirectionsService: vi.fn().mockImplementation(() => ({
            route: vi.fn().mockImplementation((_req: any, callback: any) => {
              callback(null, 'ZERO_RESULTS');
            }),
          })),
          DirectionsRenderer: vi.fn().mockImplementation(() => ({
            setDirections: vi.fn(),
          })),
          TravelMode: { DRIVING: 'DRIVING' },
          places: {
            Autocomplete: vi.fn(),
          },
        },
      };

      page = new RoutePlannerPage(container);
      page.render();

      // Set up inputs
      const originInput = container.querySelector('#origin-input') as HTMLInputElement;
      const destInput = container.querySelector('#dest-input') as HTMLInputElement;
      originInput.value = 'Berlin';
      destInput.value = 'Munich';

      // Click calculate
      const calcBtn = container.querySelector('#btn-calculate') as HTMLButtonElement;
      calcBtn.click();

      // setRouteCalculating should be called first
      expect(mockSetRouteCalculating).toHaveBeenCalled();

      // Wait for the callback to fire
      await new Promise((r) => setTimeout(r, 50));

      // setRouteFailed should be called when status is not 'OK'
      expect(mockSetRouteFailed).toHaveBeenCalled();
    });

    it('calls setRouteResult on the panel with routeId after successful route save', async () => {
      vi.mocked(isMapsAvailable).mockReturnValue(true);

      // Mock Google Maps DirectionsService to return a successful result
      const mockLeg = {
        distance: { value: 580000 },
        duration: { value: 18000 },
        start_location: { lat: () => 52.52, lng: () => 13.405 },
        end_location: { lat: () => 48.135, lng: () => 11.582 },
        start_address: 'Berlin, Germany',
        end_address: 'Munich, Germany',
      };

      (window as any).google = {
        maps: {
          DirectionsService: vi.fn().mockImplementation(() => ({
            route: vi.fn().mockImplementation((_req: any, callback: any) => {
              callback(
                { routes: [{ legs: [mockLeg] }] },
                'OK'
              );
            }),
          })),
          DirectionsRenderer: vi.fn().mockImplementation(() => ({
            setDirections: vi.fn(),
          })),
          TravelMode: { DRIVING: 'DRIVING' },
          places: {
            Autocomplete: vi.fn(),
          },
        },
      };

      // Mock backend calls for saving route
      vi.mocked(apiClient.get).mockResolvedValue({ data: [], status: 200 });
      vi.mocked(apiClient.post)
        .mockResolvedValueOnce({ data: { id: 'route-abc-123' }, status: 201 }) // POST /routes
        .mockResolvedValueOnce({ data: {}, status: 200 }); // POST /routes/:id/calculate

      page = new RoutePlannerPage(container);
      page.render();

      // Set up inputs
      const originInput = container.querySelector('#origin-input') as HTMLInputElement;
      const destInput = container.querySelector('#dest-input') as HTMLInputElement;
      originInput.value = 'Berlin';
      destInput.value = 'Munich';

      // Click calculate
      const calcBtn = container.querySelector('#btn-calculate') as HTMLButtonElement;
      calcBtn.click();

      // setRouteCalculating should be called
      expect(mockSetRouteCalculating).toHaveBeenCalled();

      // Wait for the async route save to complete
      await vi.waitFor(() => {
        expect(mockSetRouteResult).toHaveBeenCalledWith('route-abc-123');
      });
    });

    it('calls setRouteFailed when backend route save fails', async () => {
      vi.mocked(isMapsAvailable).mockReturnValue(true);

      const mockLeg = {
        distance: { value: 580000 },
        duration: { value: 18000 },
        start_location: { lat: () => 52.52, lng: () => 13.405 },
        end_location: { lat: () => 48.135, lng: () => 11.582 },
        start_address: 'Berlin, Germany',
        end_address: 'Munich, Germany',
      };

      (window as any).google = {
        maps: {
          DirectionsService: vi.fn().mockImplementation(() => ({
            route: vi.fn().mockImplementation((_req: any, callback: any) => {
              callback(
                { routes: [{ legs: [mockLeg] }] },
                'OK'
              );
            }),
          })),
          DirectionsRenderer: vi.fn().mockImplementation(() => ({
            setDirections: vi.fn(),
          })),
          TravelMode: { DRIVING: 'DRIVING' },
          places: {
            Autocomplete: vi.fn(),
          },
        },
      };

      // Mock vehicle profiles fetch to succeed
      vi.mocked(apiClient.get).mockResolvedValue({ data: [], status: 200 });
      // Mock route save to fail
      vi.mocked(apiClient.post).mockRejectedValue({
        status: 500,
        message: 'Server error',
      });

      page = new RoutePlannerPage(container);
      page.render();

      // Set up inputs
      const originInput = container.querySelector('#origin-input') as HTMLInputElement;
      const destInput = container.querySelector('#dest-input') as HTMLInputElement;
      originInput.value = 'Berlin';
      destInput.value = 'Munich';

      // Click calculate
      const calcBtn = container.querySelector('#btn-calculate') as HTMLButtonElement;
      calcBtn.click();

      // Wait for the async operations
      await vi.waitFor(() => {
        expect(mockSetRouteFailed).toHaveBeenCalled();
      });
    });

    it('calls setRouteFailed when user is not authenticated (cannot save route)', async () => {
      vi.mocked(isMapsAvailable).mockReturnValue(true);
      vi.mocked(apiClient.isAuthenticated).mockReturnValue(false);

      const mockLeg = {
        distance: { value: 580000 },
        duration: { value: 18000 },
        start_location: { lat: () => 52.52, lng: () => 13.405 },
        end_location: { lat: () => 48.135, lng: () => 11.582 },
        start_address: 'Berlin, Germany',
        end_address: 'Munich, Germany',
      };

      (window as any).google = {
        maps: {
          DirectionsService: vi.fn().mockImplementation(() => ({
            route: vi.fn().mockImplementation((_req: any, callback: any) => {
              callback(
                { routes: [{ legs: [mockLeg] }] },
                'OK'
              );
            }),
          })),
          DirectionsRenderer: vi.fn().mockImplementation(() => ({
            setDirections: vi.fn(),
          })),
          TravelMode: { DRIVING: 'DRIVING' },
          places: {
            Autocomplete: vi.fn(),
          },
        },
      };

      page = new RoutePlannerPage(container);
      page.render();

      // Set up inputs
      const originInput = container.querySelector('#origin-input') as HTMLInputElement;
      const destInput = container.querySelector('#dest-input') as HTMLInputElement;
      originInput.value = 'Berlin';
      destInput.value = 'Munich';

      // Click calculate
      const calcBtn = container.querySelector('#btn-calculate') as HTMLButtonElement;
      calcBtn.click();

      // Wait for the callback
      await new Promise((r) => setTimeout(r, 50));

      // setRouteFailed should be called since user is not authenticated
      expect(mockSetRouteFailed).toHaveBeenCalled();
    });
  });
});
