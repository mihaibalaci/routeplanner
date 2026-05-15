/**
 * Trip Cost Page — Modern design
 */
import { apiClient, ApiError } from '../api/client';

export class TripCostPage {
  private container: HTMLElement;
  private error: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }

  private build(): string {
    return `
      <div class="fade-up">
        <div class="page-header">
          <h1 class="page-header__title">Trip Cost</h1>
          <p class="page-header__subtitle">Estimate fuel and vignette costs for your route.</p>
        </div>

        ${this.error ? `<div class="alert alert--error" style="margin-bottom:var(--space-4);">${this.error}</div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div class="card">
            <div class="card__title">Vehicle Profile</div>
            <div class="card__subtitle" style="margin-bottom:var(--space-4);">Select or create a vehicle to calculate costs.</div>
            <div class="input-group" style="margin-bottom:var(--space-4);">
              <label class="input-group__label">Vehicle</label>
              <select class="input" id="vehicle-select">
                <option value="">— Select a vehicle —</option>
              </select>
            </div>
            <button id="btn-create-vehicle" class="btn btn--secondary" style="width:100%;">
              <span class="material-symbols-rounded">add</span> Create Vehicle
            </button>
          </div>

          <div class="card">
            <div class="card__title">Cost Estimate</div>
            <div class="card__subtitle">Calculate a route first, then select a vehicle.</div>
            <div id="cost-result" style="margin-top:var(--space-4);">
              <div class="empty-state" style="padding:var(--space-6) 0;">
                <span class="material-symbols-rounded empty-state__icon">payments</span>
                <p class="empty-state__text">No cost calculated yet</p>
              </div>
            </div>
          </div>

          <div class="card" style="grid-column:1/3;">
            <div class="card__title">
              <span class="material-symbols-rounded" style="vertical-align:middle;margin-right:var(--space-2);">toll</span>
              Vignette Requirements
            </div>
            <div class="card__subtitle" style="margin-bottom:var(--space-4);">Countries on your route that require a vignette.</div>
            <div class="input-group" style="margin-bottom:var(--space-4);max-width:300px;">
              <label class="input-group__label">Route ID</label>
              <input class="input" type="text" id="vignette-route-id" placeholder="Enter route ID" />
            </div>
            <button id="btn-load-vignettes" class="btn btn--secondary">
              <span class="material-symbols-rounded">search</span> Load Vignettes
            </button>
            <div id="vignette-result" style="margin-top:var(--space-4);"></div>
          </div>

          <div class="card" style="grid-column:1/3;" id="create-vehicle-form" hidden>
            <div class="card__title">New Vehicle Profile</div>
            <form id="vehicle-form" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:var(--space-4);">
              <div class="input-group">
                <label class="input-group__label">Name</label>
                <input class="input" type="text" id="v-name" placeholder="My Car" required />
              </div>
              <div class="input-group">
                <label class="input-group__label">Type</label>
                <select class="input" id="v-type">
                  <option value="car">Car</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="camper">Camper</option>
                  <option value="ev">EV ⚡</option>
                </select>
              </div>
              <div class="input-group">
                <label class="input-group__label">Fuel Type</label>
                <select class="input" id="v-fuel">
                  <option value="diesel">Diesel</option>
                  <option value="petrol_95">Petrol 95</option>
                  <option value="petrol_98">Petrol 98</option>
                  <option value="lpg">LPG</option>
                </select>
              </div>
              <div class="input-group">
                <label class="input-group__label">Tank (liters, 5-200)</label>
                <input class="input" type="number" id="v-tank" min="5" max="200" step="0.1" placeholder="60" required />
              </div>
              <div class="input-group">
                <label class="input-group__label">Consumption (L/100km, 1-50)</label>
                <input class="input" type="number" id="v-consumption" min="1" max="50" step="0.1" placeholder="7.5" required />
              </div>
              <div style="display:flex;gap:var(--space-2);align-items:end;">
                <button type="submit" class="btn btn--primary">Save Vehicle</button>
                <button type="button" id="btn-cancel-vehicle" class="btn btn--ghost">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-create-vehicle')?.addEventListener('click', () => {
      const form = this.container.querySelector('#create-vehicle-form') as HTMLElement;
      if (form) form.hidden = false;
    });
    this.container.querySelector('#btn-cancel-vehicle')?.addEventListener('click', () => {
      const form = this.container.querySelector('#create-vehicle-form') as HTMLElement;
      if (form) form.hidden = true;
    });
    this.container.querySelector('#vehicle-form')?.addEventListener('submit', (e) => this.createVehicle(e));
    this.container.querySelector('#btn-load-vignettes')?.addEventListener('click', () => this.loadVignettes());
    this.loadVehicles();
  }

  private async loadVehicles(): Promise<void> {
    try {
      const res = await apiClient.get<any>('/vehicles');
      const vehicles = (res.data as any).data || res.data || [];
      const select = this.container.querySelector('#vehicle-select') as HTMLSelectElement;
      if (select && Array.isArray(vehicles)) {
        vehicles.forEach((v: any) => {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = `${v.name} (${v.vehicle_type} - ${v.fuel_type})`;
          select.appendChild(opt);
        });
      }
    } catch { /* ignore if not authenticated */ }
  }

  private async createVehicle(e: Event): Promise<void> {
    e.preventDefault();
    const name = (this.container.querySelector('#v-name') as HTMLInputElement).value.trim();
    const vehicle_type = (this.container.querySelector('#v-type') as HTMLSelectElement).value;
    const fuel_type = (this.container.querySelector('#v-fuel') as HTMLSelectElement).value;
    const tank = parseFloat((this.container.querySelector('#v-tank') as HTMLInputElement).value);
    const consumption = parseFloat((this.container.querySelector('#v-consumption') as HTMLInputElement).value);

    if (!name || isNaN(tank) || isNaN(consumption)) {
      this.error = 'Please fill in all fields.';
      this.rerender();
      return;
    }

    try {
      await apiClient.post<any>('/vehicles', { name, vehicle_type, fuel_type, tank_capacity_liters: tank, consumption_per_100km: consumption });
      this.error = null;
      // Force full page reload to show the new vehicle in the list
      this.rerender();
    } catch (err) {
      this.error = (err as ApiError).message || 'Failed to create vehicle.';
      this.rerender();
    }
  }

  private async loadVignettes(): Promise<void> {
    const routeId = (this.container.querySelector('#vignette-route-id') as HTMLInputElement)?.value.trim();
    if (!routeId) return;

    const vehicleType = (this.container.querySelector('#vehicle-select') as HTMLSelectElement)?.value;
    const resultDiv = this.container.querySelector('#vignette-result') as HTMLElement;
    if (!resultDiv) return;

    resultDiv.innerHTML = '<div style="text-align:center;padding:var(--space-4);"><div class="cost-breakdown-panel__spinner"></div></div>';

    try {
      const params: Record<string, string> = {};
      if (vehicleType) params.vehicle_type = vehicleType;

      const res = await apiClient.get<any>(`/vignettes/route/${routeId}`, params);
      const requirements = res.data?.requirements || res.data?.data?.requirements || [];

      if (!Array.isArray(requirements) || requirements.length === 0) {
        resultDiv.innerHTML = `
          <div style="text-align:center;padding:var(--space-4);color:var(--color-text-secondary);">
            <span class="material-symbols-rounded" style="font-size:32px;">check_circle</span>
            <p style="margin-top:var(--space-2);">No vignettes required for this route.</p>
          </div>
        `;
        return;
      }

      const rows = requirements.map((req: any) => {
        const prices = req.prices || req.durations || [];
        const priceList = Array.isArray(prices)
          ? prices.map((p: any) => `<span class="badge badge--neutral">${p.duration || p}: €${(p.price_eur || p.price || 0).toFixed(2)}</span>`).join(' ')
          : '';

        return `
          <tr>
            <td style="padding:var(--space-2) var(--space-3);font-weight:500;">
              ${req.country_name || req.country_code}
            </td>
            <td style="padding:var(--space-2) var(--space-3);">
              ${req.required ? '<span class="badge badge--error">Required</span>' : '<span class="badge badge--success">Not required</span>'}
            </td>
            <td style="padding:var(--space-2) var(--space-3);">
              ${priceList || '—'}
            </td>
          </tr>
        `;
      }).join('');

      resultDiv.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
            <thead>
              <tr style="border-bottom:1px solid var(--color-border);text-align:left;">
                <th style="padding:var(--space-2) var(--space-3);">Country</th>
                <th style="padding:var(--space-2) var(--space-3);">Status</th>
                <th style="padding:var(--space-2) var(--space-3);">Available Durations & Prices</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      resultDiv.innerHTML = `
        <div class="alert alert--error">Failed to load vignette data: ${(err as any).message || 'Unknown error'}</div>
      `;
    }
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }
}
