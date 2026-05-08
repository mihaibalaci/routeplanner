/**
 * Trip Cost Page
 *
 * Displays trip fuel cost estimate with:
 * - Vehicle profile selector (dropdown of user's vehicles)
 * - "Create Vehicle" form (name, type, fuel_type, tank_capacity, consumption)
 * - Trip cost display with per-country breakdown
 * - Outdated price warning when applicable
 * - Prompt to select/create vehicle if none selected
 *
 * Requirements: 5.1, 5.5, 7.3, 7.4, 7.5, 7.6
 */

import { apiClient, ApiError } from '../api/client';

interface Vehicle {
  id: string;
  name: string;
  vehicle_type: string;
  fuel_type: string;
  tank_capacity_liters: number;
  consumption_per_100km: number;
}

interface CountryBreakdown {
  countryCode: string;
  distanceKm: number;
  fuelLiters: number;
  costEur: number;
  pricePerLiter: number;
}

interface TripCostResult {
  totalCostEur: number;
  totalFuelLiters: number;
  countryBreakdown: CountryBreakdown[];
  pricesOutdated: boolean;
}

export class TripCostPage {
  private container: HTMLElement;
  private vehicles: Vehicle[] = [];
  private selectedVehicleId: string | null = null;
  private tripCost: TripCostResult | null = null;
  private showCreateForm = false;
  private loading = false;
  private error: string | null = null;
  private routeId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    // Try to get routeId from sessionStorage (set by route planner)
    this.routeId = sessionStorage.getItem('currentRouteId');
  }

  async render(): Promise<void> {
    this.container.innerHTML = this.buildLoading();
    await this.loadVehicles();
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private async loadVehicles(): Promise<void> {
    try {
      const res = await apiClient.get<Vehicle[]>('/vehicles');
      this.vehicles = res.data;
    } catch {
      this.vehicles = [];
    }
  }

  private buildTemplate(): string {
    return `
      <div class="trip-cost-page">
        ${this.buildVehicleSelector()}
        ${this.showCreateForm ? this.buildCreateVehicleForm() : ''}
        ${this.error ? this.buildError() : ''}
        ${this.loading ? this.buildLoading() : ''}
        ${this.tripCost ? this.buildCostDisplay() : ''}
        ${!this.selectedVehicleId && !this.showCreateForm ? this.buildPrompt() : ''}
      </div>
    `;
  }

  private buildVehicleSelector(): string {
    const options = this.vehicles
      .map(
        (v) =>
          `<option value="${v.id}" ${v.id === this.selectedVehicleId ? 'selected' : ''}>
            ${v.name} (${v.vehicle_type} - ${v.fuel_type})
          </option>`
      )
      .join('');

    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">directions_car</i>&nbsp;Vehicle Profile
          </h2>
        </div>
        <div class="mdl-card__supporting-text">
          <div class="form-field">
            <label for="vehicle-select" class="form-label">Select Vehicle:</label>
            <select id="vehicle-select" class="mdl-textfield__input" style="width:100%;padding:8px;">
              <option value="">-- Select a vehicle --</option>
              ${options}
            </select>
          </div>
        </div>
        <div class="mdl-card__actions mdl-card--border">
          <button id="btn-create-vehicle"
                  class="mdl-button mdl-js-button mdl-button--colored mdl-js-ripple-effect">
            <i class="material-icons">add</i>&nbsp;Create Vehicle
          </button>
          ${this.selectedVehicleId && this.routeId ? `
          <button id="btn-calculate-cost"
                  class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
            <i class="material-icons">calculate</i>&nbsp;Calculate Cost
          </button>` : ''}
        </div>
      </div>
    `;
  }

  private buildCreateVehicleForm(): string {
    return `
      <div class="mdl-card mdl-shadow--2dp app-card" id="create-vehicle-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">Create Vehicle Profile</h2>
        </div>
        <div class="mdl-card__supporting-text">
          <form id="create-vehicle-form" novalidate>
            <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
              <input class="mdl-textfield__input" type="text" id="vehicle-name" required />
              <label class="mdl-textfield__label" for="vehicle-name">Vehicle Name</label>
            </div>

            <div class="form-field">
              <label for="vehicle-type" class="form-label">Vehicle Type:</label>
              <select id="vehicle-type" class="mdl-textfield__input" style="width:100%;padding:8px;">
                <option value="car">Car</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="camper">Camper</option>
              </select>
            </div>

            <div class="form-field">
              <label for="fuel-type" class="form-label">Fuel Type:</label>
              <select id="fuel-type" class="mdl-textfield__input" style="width:100%;padding:8px;">
                <option value="diesel">Diesel</option>
                <option value="petrol_95">Petrol 95</option>
                <option value="petrol_98">Petrol 98</option>
                <option value="lpg">LPG</option>
              </select>
            </div>

            <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
              <input class="mdl-textfield__input" type="number" id="tank-capacity"
                     min="5" max="200" step="0.1" required />
              <label class="mdl-textfield__label" for="tank-capacity">Tank Capacity (liters, 5-200)</label>
            </div>

            <div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label form-field">
              <input class="mdl-textfield__input" type="number" id="consumption"
                     min="1" max="50" step="0.1" required />
              <label class="mdl-textfield__label" for="consumption">Consumption (L/100km, 1-50)</label>
            </div>

            <div class="form-actions" style="margin-top:16px;">
              <button type="submit"
                      class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect">
                Save Vehicle
              </button>
              <button type="button" id="btn-cancel-create"
                      class="mdl-button mdl-js-button mdl-js-ripple-effect">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  private buildCostDisplay(): string {
    if (!this.tripCost) return '';

    const rows = this.tripCost.countryBreakdown
      .map(
        (c) => `
        <tr>
          <td class="mdl-data-table__cell--non-numeric">${c.countryCode}</td>
          <td>${c.distanceKm.toFixed(1)} km</td>
          <td>${c.fuelLiters.toFixed(2)} L</td>
          <td>€${c.pricePerLiter.toFixed(3)}/L</td>
          <td>€${c.costEur.toFixed(2)}</td>
        </tr>`
      )
      .join('');

    const outdatedWarning = this.tripCost.pricesOutdated
      ? `<div class="mdl-card__supporting-text" style="background:#fff3cd;color:#856404;border-radius:4px;margin:8px 0;">
           <i class="material-icons" style="vertical-align:middle;">warning</i>
           Some fuel prices are outdated (older than 12 hours). Costs may not be accurate.
         </div>`
      : '';

    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__title">
          <h2 class="mdl-card__title-text">
            <i class="material-icons">attach_money</i>&nbsp;Trip Fuel Cost
          </h2>
        </div>
        ${outdatedWarning}
        <div class="mdl-card__supporting-text">
          <div class="route-totals" style="display:flex;gap:24px;margin-bottom:16px;">
            <div>
              <strong>Total Cost:</strong> €${this.tripCost.totalCostEur.toFixed(2)}
            </div>
            <div>
              <strong>Total Fuel:</strong> ${this.tripCost.totalFuelLiters.toFixed(2)} L
            </div>
          </div>
          <h6>Per-Country Breakdown</h6>
          <table class="mdl-data-table mdl-js-data-table" style="width:100%;">
            <thead>
              <tr>
                <th class="mdl-data-table__cell--non-numeric">Country</th>
                <th>Distance</th>
                <th>Fuel</th>
                <th>Price</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private buildPrompt(): string {
    if (this.vehicles.length === 0) {
      return `
        <div class="mdl-card mdl-shadow--2dp app-card">
          <div class="mdl-card__supporting-text" style="text-align:center;padding:24px;">
            <i class="material-icons" style="font-size:48px;color:#9e9e9e;">directions_car</i>
            <p>You don't have any vehicles yet. Create one to calculate trip costs.</p>
          </div>
        </div>
      `;
    }
    return `
      <div class="mdl-card mdl-shadow--2dp app-card">
        <div class="mdl-card__supporting-text" style="text-align:center;padding:24px;">
          <i class="material-icons" style="font-size:48px;color:#9e9e9e;">info</i>
          <p>Select a vehicle profile above to calculate trip costs.</p>
        </div>
      </div>
    `;
  }

  private buildError(): string {
    return `
      <div class="mdl-card mdl-shadow--2dp app-card" style="background:#f8d7da;">
        <div class="mdl-card__supporting-text" style="color:#721c24;">
          <i class="material-icons" style="vertical-align:middle;">error</i>
          ${this.error}
        </div>
      </div>
    `;
  }

  private buildLoading(): string {
    return `
      <div style="text-align:center;padding:32px;">
        <div class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active"></div>
        <p>Loading...</p>
      </div>
    `;
  }

  private bindEvents(): void {
    const select = this.container.querySelector('#vehicle-select') as HTMLSelectElement;
    select?.addEventListener('change', () => {
      this.selectedVehicleId = select.value || null;
      this.tripCost = null;
      this.error = null;
      this.rerender();
    });

    const createBtn = this.container.querySelector('#btn-create-vehicle');
    createBtn?.addEventListener('click', () => {
      this.showCreateForm = true;
      this.rerender();
    });

    const cancelBtn = this.container.querySelector('#btn-cancel-create');
    cancelBtn?.addEventListener('click', () => {
      this.showCreateForm = false;
      this.rerender();
    });

    const form = this.container.querySelector('#create-vehicle-form') as HTMLFormElement;
    form?.addEventListener('submit', (e) => this.handleCreateVehicle(e));

    const calcBtn = this.container.querySelector('#btn-calculate-cost');
    calcBtn?.addEventListener('click', () => this.calculateCost());
  }

  private async handleCreateVehicle(e: Event): Promise<void> {
    e.preventDefault();

    const name = (this.container.querySelector('#vehicle-name') as HTMLInputElement).value.trim();
    const vehicleType = (this.container.querySelector('#vehicle-type') as HTMLSelectElement).value;
    const fuelType = (this.container.querySelector('#fuel-type') as HTMLSelectElement).value;
    const tankCapacity = parseFloat(
      (this.container.querySelector('#tank-capacity') as HTMLInputElement).value
    );
    const consumption = parseFloat(
      (this.container.querySelector('#consumption') as HTMLInputElement).value
    );

    if (!name || isNaN(tankCapacity) || isNaN(consumption)) {
      this.error = 'Please fill in all fields.';
      this.rerender();
      return;
    }

    try {
      const res = await apiClient.post<Vehicle>('/vehicles', {
        name,
        vehicle_type: vehicleType,
        fuel_type: fuelType,
        tank_capacity_liters: tankCapacity,
        consumption_per_100km: consumption,
      });
      this.vehicles.push(res.data);
      this.selectedVehicleId = res.data.id;
      this.showCreateForm = false;
      this.error = null;
      this.rerender();
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to create vehicle.';
      this.rerender();
    }
  }

  private async calculateCost(): Promise<void> {
    if (!this.selectedVehicleId || !this.routeId) {
      this.error = 'Please select a vehicle and ensure a route is calculated.';
      this.rerender();
      return;
    }

    this.loading = true;
    this.error = null;
    this.tripCost = null;
    this.rerender();

    try {
      const res = await apiClient.post<TripCostResult>(`/trips/${this.routeId}/cost`, {
        vehicleId: this.selectedVehicleId,
      });
      this.tripCost = res.data;
    } catch (err) {
      const apiErr = err as ApiError;
      this.error = apiErr.message || 'Failed to calculate trip cost.';
    } finally {
      this.loading = false;
      this.rerender();
    }
  }

  private rerender(): void {
    this.container.innerHTML = this.buildTemplate();
    this.bindEvents();
    this.upgradeComponents();
  }

  private upgradeComponents(): void {
    if (typeof componentHandler !== 'undefined') {
      componentHandler.upgradeDom();
    }
  }
}
