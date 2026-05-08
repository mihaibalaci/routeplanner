/**
 * VehicleDetailPanel — Slide-in panel showing full vehicle technical details.
 *
 * Displays different fields depending on vehicle type:
 * - EV: battery capacity, energy consumption, charge port type, estimated range
 * - ICE (car, motorcycle, camper): fuel type, tank capacity, consumption per 100km
 *
 * Provides show(vehicle) and hide() methods with a close button.
 */

import type { VehicleProfileResponse } from '../../../src/models/vehicleProfile';

export interface VehicleDetailPanelOptions {
  container: HTMLElement;
  onClose: () => void;
}

export class VehicleDetailPanel {
  private container: HTMLElement;
  private onClose: () => void;
  private currentVehicle: VehicleProfileResponse | null = null;

  constructor(options: VehicleDetailPanelOptions) {
    this.container = options.container;
    this.onClose = options.onClose;
  }

  /**
   * Show the detail panel for the given vehicle.
   */
  show(vehicle: VehicleProfileResponse): void {
    this.currentVehicle = vehicle;
    this.render();
  }

  /**
   * Hide the detail panel and clear content.
   */
  hide(): void {
    this.currentVehicle = null;
    this.container.innerHTML = '';
  }

  // ─── Private Rendering ────────────────────────────────────────────────────

  private render(): void {
    if (!this.currentVehicle) {
      this.container.innerHTML = '';
      return;
    }

    const vehicle = this.currentVehicle;
    const isEv = vehicle.vehicle_type === 'ev';

    this.container.innerHTML = `
      <div class="vehicle-detail-panel" data-vehicle-id="${vehicle.id}">
        <div class="vehicle-detail-panel__header">
          <h3 class="vehicle-detail-panel__title">${this.escapeHtml(vehicle.name)}</h3>
          <button class="vehicle-detail-panel__close-btn" aria-label="Close detail panel">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="vehicle-detail-panel__body">
          <div class="vehicle-detail-panel__type-badge">
            ${this.renderTypeBadge(vehicle.vehicle_type)}
          </div>
          <dl class="vehicle-detail-panel__specs">
            ${isEv ? this.renderEvFields(vehicle) : this.renderIceFields(vehicle)}
          </dl>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderEvFields(vehicle: VehicleProfileResponse): string {
    const batteryCapacity = vehicle.battery_capacity_kwh ?? 0;
    const consumption = vehicle.consumption_kwh_per_100km ?? 0;
    const chargePort = vehicle.charge_port_type ?? 'Unknown';
    const estimatedRange = this.calculateEstimatedRange(batteryCapacity, consumption);

    return `
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Battery Capacity</dt>
        <dd class="vehicle-detail-panel__value" data-field="battery_capacity_kwh">${batteryCapacity} kWh</dd>
      </div>
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Energy Consumption</dt>
        <dd class="vehicle-detail-panel__value" data-field="consumption_kwh_per_100km">${consumption} kWh/100km</dd>
      </div>
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Charge Port Type</dt>
        <dd class="vehicle-detail-panel__value" data-field="charge_port_type">${this.escapeHtml(chargePort)}</dd>
      </div>
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Estimated Range</dt>
        <dd class="vehicle-detail-panel__value" data-field="estimated_range">${estimatedRange} km</dd>
      </div>
    `;
  }

  private renderIceFields(vehicle: VehicleProfileResponse): string {
    const fuelType = vehicle.fuel_type ?? 'Unknown';
    const tankCapacity = vehicle.tank_capacity_liters ?? 0;
    const consumption = vehicle.consumption_per_100km ?? 0;

    return `
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Fuel Type</dt>
        <dd class="vehicle-detail-panel__value" data-field="fuel_type">${this.escapeHtml(this.formatFuelType(fuelType))}</dd>
      </div>
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Tank Capacity</dt>
        <dd class="vehicle-detail-panel__value" data-field="tank_capacity_liters">${tankCapacity} L</dd>
      </div>
      <div class="vehicle-detail-panel__field">
        <dt class="vehicle-detail-panel__label">Consumption</dt>
        <dd class="vehicle-detail-panel__value" data-field="consumption_per_100km">${consumption} L/100km</dd>
      </div>
    `;
  }

  private renderTypeBadge(vehicleType: string): string {
    const badges: Record<string, { icon: string; label: string }> = {
      ev: { icon: 'electric_car', label: 'EV ⚡' },
      car: { icon: 'directions_car', label: 'Car' },
      motorcycle: { icon: 'two_wheeler', label: 'Motorcycle' },
      camper: { icon: 'rv_hookup', label: 'Camper' },
    };

    const badge = badges[vehicleType] ?? { icon: 'directions_car', label: vehicleType };

    return `
      <span class="material-symbols-rounded vehicle-detail-panel__type-icon">${badge.icon}</span>
      <span class="vehicle-detail-panel__type-label">${badge.label}</span>
    `;
  }

  /**
   * Calculate estimated range for EV vehicles.
   * Formula: (battery_capacity_kwh / consumption_kwh_per_100km) * 100
   * Rounded to 1 decimal place.
   */
  private calculateEstimatedRange(batteryCapacityKwh: number, consumptionKwhPer100km: number): string {
    if (consumptionKwhPer100km <= 0) {
      return '0.0';
    }
    const range = (batteryCapacityKwh / consumptionKwhPer100km) * 100;
    return range.toFixed(1);
  }

  private formatFuelType(fuelType: string): string {
    const labels: Record<string, string> = {
      diesel: 'Diesel',
      petrol_95: 'Petrol 95',
      petrol_98: 'Petrol 98',
      lpg: 'LPG',
      electric: 'Electric',
    };
    return labels[fuelType] ?? fuelType;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Event Binding ────────────────────────────────────────────────────────

  private bindEvents(): void {
    const closeBtn = this.container.querySelector('.vehicle-detail-panel__close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
        this.onClose();
      });
    }
  }
}
