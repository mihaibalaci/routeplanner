/**
 * Refuel Advisor Page — Search refuel stops by route and/or vehicle.
 */
import { apiClient } from '../api/client';

interface RefuelStop {
  id: string;
  station_name: string;
  country_code: string;
  fuel_price_eur: number | null;
  position_in_route: number;
  status: string;
  latitude: number;
  longitude: number;
}

export class RefuelAdvisorPage {
  private container: HTMLElement;
  private error: string | null = null;
  private loading = false;
  private results: RefuelStop[] = [];
  private searched = false;

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
          <h1 class="page-header__title">Refuel Stops</h1>
          <p class="page-header__subtitle">Smart refueling suggestions along your route.</p>
        </div>

        ${this.error ? `<div class="alert alert--error" style="margin-bottom:var(--space-4);">${this.error}</div>` : ''}

        <div class="card">
          <div class="card__title">How it works</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-6);margin-top:var(--space-4);">
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">route</span>
              <p style="font-weight:600;margin-top:var(--space-2);">1. Calculate Route</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Plan your multi-stop route first.</p>
            </div>
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">directions_car</span>
              <p style="font-weight:600;margin-top:var(--space-2);">2. Select Vehicle</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">Choose your vehicle profile for range calculation.</p>
            </div>
            <div style="text-align:center;">
              <span class="material-symbols-rounded" style="font-size:36px;color:var(--color-primary);">local_gas_station</span>
              <p style="font-weight:600;margin-top:var(--space-2);">3. Get Suggestions</p>
              <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);">We find the cheapest stations before you run low.</p>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:var(--space-4);">
          <div class="card__title">Search Refuel Stops</div>
          <div class="card__subtitle" style="margin-bottom:var(--space-4);">Filter by route, vehicle, or both.</div>
          <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;">
            <div class="input-group" style="flex:1;min-width:200px;">
              <label class="input-group__label">Route ID</label>
              <input class="input" type="text" id="refuel-route-id" placeholder="From route planner" />
            </div>
            <div class="input-group" style="flex:1;min-width:200px;">
              <label class="input-group__label">Vehicle ID</label>
              <input class="input" type="text" id="refuel-vehicle-id" placeholder="From vehicle profile" />
            </div>
            <div style="display:flex;align-items:end;">
              <button id="btn-suggest" class="btn btn--primary btn--lg" ${this.loading ? 'disabled' : ''}>
                ${this.loading ? '<span class="spinner" style="width:16px;height:16px;"></span>' : '<span class="material-symbols-rounded">search</span> Find Stops'}
              </button>
            </div>
          </div>
          <div id="suggestions-result" style="margin-top:var(--space-4);">
            ${this.searched ? this.buildResults() : ''}
          </div>
        </div>
      </div>
    `;
  }

  private buildResults(): string {
    if (this.results.length === 0) {
      return `
        <div class="empty-state" style="padding:var(--space-6);">
          <span class="material-symbols-rounded empty-state__icon">search_off</span>
          <p class="empty-state__title">No refuel stops found</p>
          <p class="empty-state__text">Try a different route or vehicle ID.</p>
        </div>
      `;
    }

    const rows = this.results.map((stop, i) => `
      <tr>
        <td style="padding:var(--space-2) var(--space-3);">${i + 1}</td>
        <td style="padding:var(--space-2) var(--space-3);">${stop.station_name}</td>
        <td style="padding:var(--space-2) var(--space-3);">${stop.country_code}</td>
        <td style="padding:var(--space-2) var(--space-3);">${stop.fuel_price_eur !== null ? `€${stop.fuel_price_eur.toFixed(3)}/L` : '—'}</td>
        <td style="padding:var(--space-2) var(--space-3);">
          <span class="badge badge--${stop.status === 'accepted' ? 'success' : stop.status === 'rejected' ? 'error' : 'neutral'}">${stop.status}</span>
        </td>
      </tr>
    `).join('');

    return `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
          <thead>
            <tr style="border-bottom:1px solid var(--color-border);text-align:left;">
              <th style="padding:var(--space-2) var(--space-3);">#</th>
              <th style="padding:var(--space-2) var(--space-3);">Station</th>
              <th style="padding:var(--space-2) var(--space-3);">Country</th>
              <th style="padding:var(--space-2) var(--space-3);">Price</th>
              <th style="padding:var(--space-2) var(--space-3);">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-text-secondary);">
        ${this.results.length} stop${this.results.length !== 1 ? 's' : ''} found
      </p>
    `;
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-suggest')?.addEventListener('click', () => this.search());
  }

  private async search(): Promise<void> {
    const routeId = (this.container.querySelector('#refuel-route-id') as HTMLInputElement)?.value.trim();
    const vehicleId = (this.container.querySelector('#refuel-vehicle-id') as HTMLInputElement)?.value.trim();

    if (!routeId && !vehicleId) {
      this.error = 'Please enter at least a Route ID or Vehicle ID.';
      this.rerender();
      return;
    }

    this.loading = true;
    this.error = null;
    this.rerender();

    try {
      const params: Record<string, string> = {};
      if (routeId) params.routeId = routeId;
      if (vehicleId) params.vehicleId = vehicleId;

      const response = await apiClient.get<{ data: RefuelStop[] }>('/refuel-stops', params);
      this.results = response.data?.data ?? [];
      this.searched = true;
    } catch (err: any) {
      this.error = err.message || 'Failed to search refuel stops.';
      this.results = [];
      this.searched = true;
    }

    this.loading = false;
    this.rerender();
  }

  private rerender(): void {
    this.container.innerHTML = this.build();
    this.bindEvents();
  }
}
