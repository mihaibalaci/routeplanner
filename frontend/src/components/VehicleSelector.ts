/**
 * VehicleSelector — Dropdown component for selecting a vehicle profile.
 *
 * Used as a sub-component within the CostBreakdownPanel.
 * Handles three states:
 * - Authenticated with profiles: renders a <select> dropdown
 * - Authenticated with no profiles: shows prompt to create a vehicle
 * - Unauthenticated: shows login required message
 */
import { apiClient } from '../api/client';

export interface VehicleProfileResponse {
  id: string;
  name: string;
  vehicle_type: string;
  fuel_type: string | null;
  tank_capacity_liters: number | null;
  consumption_per_100km: number | null;
  battery_capacity_kwh?: number | null;
  consumption_kwh_per_100km?: number | null;
  charge_port_type?: string | null;
  is_default?: boolean;
}

export interface VehicleSelectorOptions {
  container: HTMLElement;
  onSelect: (vehicleId: string) => void;
}

export class VehicleSelector {
  private container: HTMLElement;
  private onSelect: (vehicleId: string) => void;
  private profiles: VehicleProfileResponse[] = [];
  private selectedId: string | null = null;

  constructor(options: VehicleSelectorOptions) {
    this.container = options.container;
    this.onSelect = options.onSelect;
  }

  render(): void {
    if (!apiClient.isAuthenticated()) {
      this.renderUnauthenticated();
      return;
    }

    if (this.profiles.length === 0) {
      this.renderEmptyProfiles();
      return;
    }

    this.renderDropdown();
  }

  setProfiles(profiles: VehicleProfileResponse[]): void {
    this.profiles = profiles;
    this.render();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }

  // ─── Private Rendering ────────────────────────────────────────────────────

  private renderUnauthenticated(): void {
    this.container.innerHTML = `
      <div class="vehicle-selector vehicle-selector--message">
        <span class="material-symbols-rounded vehicle-selector__icon">lock</span>
        <p class="vehicle-selector__text">Login required to view cost estimates.</p>
      </div>
    `;
  }

  private renderEmptyProfiles(): void {
    this.container.innerHTML = `
      <div class="vehicle-selector vehicle-selector--message">
        <span class="material-symbols-rounded vehicle-selector__icon">directions_car</span>
        <p class="vehicle-selector__text">
          No vehicle profiles found.
          <a href="/vehicles" class="vehicle-selector__link" data-nav="/vehicles">Create a vehicle</a>
          to calculate costs.
        </p>
      </div>
    `;
  }

  private renderDropdown(): void {
    const options = this.profiles
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === this.selectedId ? 'selected' : ''}>${p.name} (${p.vehicle_type} – ${p.fuel_type})</option>`
      )
      .join('');

    this.container.innerHTML = `
      <div class="vehicle-selector">
        <label class="vehicle-selector__label" for="vehicle-selector-dropdown">Vehicle</label>
        <select class="input vehicle-selector__select" id="vehicle-selector-dropdown">
          <option value="" disabled ${this.selectedId === null ? 'selected' : ''}>Select a vehicle...</option>
          ${options}
        </select>
      </div>
    `;

    const select = this.container.querySelector(
      '#vehicle-selector-dropdown'
    ) as HTMLSelectElement | null;

    if (select) {
      select.addEventListener('change', () => {
        const value = select.value;
        if (value) {
          this.selectedId = value;
          this.onSelect(value);
        }
      });
    }
  }
}
