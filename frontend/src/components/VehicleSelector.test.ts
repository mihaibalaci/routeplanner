/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VehicleSelector, VehicleProfileResponse } from './VehicleSelector';

// Mock the apiClient module
vi.mock('../api/client', () => ({
  apiClient: {
    isAuthenticated: vi.fn(() => true),
  },
}));

import { apiClient } from '../api/client';

const mockProfiles: VehicleProfileResponse[] = [
  {
    id: 'v1',
    name: 'My Car',
    vehicle_type: 'car',
    fuel_type: 'diesel',
    tank_capacity_liters: 50,
    consumption_per_100km: 6.5,
  },
  {
    id: 'v2',
    name: 'Family Van',
    vehicle_type: 'van',
    fuel_type: 'petrol',
    tank_capacity_liters: 70,
    consumption_per_100km: 9.2,
  },
];

describe('VehicleSelector', () => {
  let container: HTMLElement;
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    onSelect = vi.fn();
    vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
  });

  // ─── Requirement 2.1: Renders dropdown with profile options ─────────────────

  describe('rendering with profiles', () => {
    it('renders a select dropdown populated with vehicle profiles', () => {
      const selector = new VehicleSelector({ container, onSelect });
      selector.setProfiles(mockProfiles);

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).not.toBeNull();

      // Should have placeholder + 2 profile options
      const options = select.querySelectorAll('option');
      expect(options.length).toBe(3); // placeholder + 2 profiles

      // Check profile options contain name, vehicle type, and fuel type
      expect(options[1].textContent).toContain('My Car');
      expect(options[1].textContent).toContain('car');
      expect(options[1].textContent).toContain('diesel');
      expect(options[1].value).toBe('v1');

      expect(options[2].textContent).toContain('Family Van');
      expect(options[2].textContent).toContain('van');
      expect(options[2].textContent).toContain('petrol');
      expect(options[2].value).toBe('v2');
    });
  });

  // ─── Requirement 2.6: Default no-selection state ────────────────────────────

  describe('default no-selection state', () => {
    it('shows "Select a vehicle..." placeholder by default with no selection', () => {
      const selector = new VehicleSelector({ container, onSelect });
      selector.setProfiles(mockProfiles);

      const select = container.querySelector('select') as HTMLSelectElement;
      const placeholder = select.querySelector('option[disabled]') as HTMLOptionElement;

      expect(placeholder).not.toBeNull();
      expect(placeholder.textContent).toContain('Select a vehicle...');
      expect(placeholder.selected).toBe(true);

      // getSelectedId should return null
      expect(selector.getSelectedId()).toBeNull();
    });
  });

  // ─── Requirement 2.4: Empty state (no profiles) ────────────────────────────

  describe('empty state (no profiles)', () => {
    it('shows empty state message with link when no profiles exist', () => {
      const selector = new VehicleSelector({ container, onSelect });
      selector.setProfiles([]);

      // Should not render a select dropdown
      const select = container.querySelector('select');
      expect(select).toBeNull();

      // Should show a message about no vehicle profiles
      const text = container.textContent || '';
      expect(text).toContain('No vehicle profiles found');

      // Should contain a link to create a vehicle
      const link = container.querySelector('a[href="/vehicles"]');
      expect(link).not.toBeNull();
      expect(link!.textContent).toContain('Create a vehicle');
    });
  });

  // ─── Requirement 2.5: Unauthenticated state ────────────────────────────────

  describe('unauthenticated state', () => {
    it('shows login required message when unauthenticated', () => {
      vi.mocked(apiClient.isAuthenticated).mockReturnValue(false);

      const selector = new VehicleSelector({ container, onSelect });
      selector.render();

      // Should not render a select dropdown
      const select = container.querySelector('select');
      expect(select).toBeNull();

      // Should show login required message
      const text = container.textContent || '';
      expect(text).toContain('Login required');
    });
  });

  // ─── Requirement 2.1: Selection callback fires with correct vehicleId ──────

  describe('selection callback', () => {
    it('fires onSelect callback with the correct vehicleId when user selects an option', () => {
      const selector = new VehicleSelector({ container, onSelect });
      selector.setProfiles(mockProfiles);

      const select = container.querySelector('select') as HTMLSelectElement;

      // Simulate selecting the second profile
      select.value = 'v2';
      select.dispatchEvent(new Event('change'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('v2');
    });

    it('updates selectedId after selection', () => {
      const selector = new VehicleSelector({ container, onSelect });
      selector.setProfiles(mockProfiles);

      const select = container.querySelector('select') as HTMLSelectElement;

      select.value = 'v1';
      select.dispatchEvent(new Event('change'));

      expect(selector.getSelectedId()).toBe('v1');
    });
  });
});
